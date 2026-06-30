# Tournament Exit Affordances Implementation Plan

**Status: Complete** — executed 2026-06-30 via subagent-driven development (controller commits). All 5 tasks done; final whole-branch review (opus) "Ready to merge: Yes". Commits: `ef18b0b` (T1 exit button), `218b5d3` (T2 leave-prompt continuation), `728f479` (T3 renderer handler + preload), `9e397e8` + `c9361dc` (T4 main close interception + macOS fix), `0b88177` (final-review `isDestroyed()` guard), `cac3e79` (user-flagged `#navInfo` overlap fix). 388 unit, full E2E 48 pass / 1 pre-existing fail, lint 0; all 5 manual close-confirm cases PASSED. See [DONE.md](../../planning/DONE.md) 2026-06-30. (Step checkboxes below flipped to `[x]` at archival.)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two tournament-mode exit affordances — a discoverable in-tournament exit button and a confirm-before-app-close guard for an in-progress tournament — both reusing the existing leave-prompt machinery.

**Architecture:** Item 1 re-adds the removed pause button to the tournament header; its click routes through the existing `switchMode('single')` → `showTournamentLeavePrompt` path. Item 2 intercepts the main-process window `close` event, round-trips to the renderer over IPC, and reuses the same Save/Discard/Cancel leave modal before allowing the app to quit. The shared leave prompt is refactored from a `targetMode` argument to an `onAfterLeave` continuation so both the mode-switch caller and the app-close caller drive the same UI.

**Tech Stack:** Electron (main + preload + renderer), vanilla JS (no bundler), Lucide icons (CDN), Vitest (unit), Playwright (E2E).

## Global Constraints

- Prettier: tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always, endOfLine="lf". `.md` files are Prettier-ignored.
- ESLint flat config (`eslint.config.mjs`): `eqeqeq`, `curly`, `prefer-const`, `no-var`; unused vars must be `_`-prefixed.
- `main.js` and `preload.js` are CommonJS (`require`); `media-viewer.js` is the renderer with browser globals + ES module `import` for extracted modules.
- **`preload.js` changes require security review** (IPC bridge surface).
- Lucide: `createIcons()` with `{root: element}`, never `{nodes:[el]}`. The pause icon is in static `index.html` markup, so the initial `createIcons()` pass renders it.
- **The close confirm applies ONLY to an incomplete tournament** (`isTournamentMode && engine && !engine.isComplete()`) — not to any other state.
- No new npm dependency.
- Unit tests must pass before every commit (Husky pre-commit runs `npx vitest run`). E2E is **not** run by the hook — run it manually.
- Unit tests for `MediaViewer` methods use the `extractMethod`/`extractAsyncMethod` source-extraction pattern in `tests/media-viewer-utils.test.js`; mock `this.*` via `.call(ctx, ...)` and patch `globalThis.window` / `globalThis.document`. Keep new method bodies free of braces inside string literals (the extractor brace-counts raw source).

---

### Task 1: In-tournament exit button (Item 1)

Re-add the pause button (removed in `c6914ef`) to the center of `#tournamentHeader`; wire its click to `switchMode('single')`, which already shows the Save/Discard/Cancel leave prompt for an incomplete tournament.

**Files:**
- Modify: `index.html` (`#tournamentHeader`, ~line 251)
- Modify: `styles.css` (re-add `.tournament-pause`, after `.tournament-tiers` ~line 2298)
- Modify: `media-viewer.js` (`setupEventListeners`, after the tournament button wiring ~line 1968)
- Test: `tests/e2e/tournament-mode.test.js` (new test inside `describe('Tournament Mode')`)

**Interfaces:**
- Consumes: existing `MediaViewer.switchMode(mode)` and the existing `#tournamentResumeModal` leave prompt.
- Produces: DOM element `#tournamentExitBtn` (a `.tournament-pause` button) in `#tournamentHeader`.

- [x] **Step 1: Write the failing E2E test**

Add inside `test.describe('Tournament Mode', () => { ... })` in `tests/e2e/tournament-mode.test.js`:

```javascript
test('exit button in the tournament header opens the leave prompt', async () => {
    tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
    await loadFolder(page, tmpFixtures.dir);
    await waitForMedia(page);

    await enterAndStartTournament(page, { rounds: 1 });

    // The exit affordance is visible in the tournament header.
    await expect(page.locator('#tournamentExitBtn')).toBeVisible();

    // Clicking it routes through switchMode('single') → the incomplete-tournament
    // leave prompt (Save & leave / Discard / Cancel). force: the tournament overlay
    // can intercept pointer events.
    await page.locator('#tournamentExitBtn').click({ force: true });
    await expect(page.locator('#tournamentResumeModal')).toBeVisible();
    await expect(page.locator('#tournamentResumeTitle')).toHaveText('Leave tournament?');
});
```

- [x] **Step 2: Run the E2E test to verify it fails**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "exit button"`
Expected: FAIL — `#tournamentExitBtn` not found (locator never visible / click times out).

- [x] **Step 3: Add the button markup**

In `index.html`, change `#tournamentHeader` (currently progress + tiers) to insert the button between them:

```html
<div class="tournament-header" id="tournamentHeader">
    <span class="tournament-progress" id="tournamentProgress"></span>
    <button class="tournament-pause" id="tournamentExitBtn" title="Pause / leave tournament (Escape)">
        <i data-lucide="pause"></i>
    </button>
    <span class="tournament-tiers" id="tournamentTiers"></span>
</div>
```

- [x] **Step 4: Re-add the `.tournament-pause` CSS**

In `styles.css`, immediately after the `.tournament-tiers { ... }` rule (~line 2298), add (a glass button matching `.tournament-controls .control-btn`, with a hover for discoverability — the original transparent style was too subtle):

```css
.tournament-pause {
    pointer-events: auto;
    display: flex;
    align-items: center;
    padding: 4px 8px;
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
}
.tournament-pause:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.35);
}
```

- [x] **Step 5: Wire the click handler**

In `media-viewer.js`, inside `setupEventListeners()` right after the `tournamentBothLoseBtn` block (~line 1968):

```javascript
const tournamentExitBtn = document.getElementById('tournamentExitBtn');
if (tournamentExitBtn) {
    tournamentExitBtn.addEventListener('click', () => this.switchMode('single'));
}
```

- [x] **Step 6: Run the E2E test to verify it passes**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "exit button"`
Expected: PASS.

- [x] **Step 7: Run unit tests + lint (no regression)**

Run: `npm test && npm run lint`
Expected: 381 unit tests pass; lint 0 errors.

- [x] **Step 8: Commit**

```bash
git add index.html styles.css media-viewer.js tests/e2e/tournament-mode.test.js
git commit -m "feat(tournament): add in-header exit button (re-adds removed pause control)"
```

---

### Task 2: Refactor leave prompt to a continuation (`targetMode` → `onAfterLeave`)

Make `showTournamentLeavePrompt` accept a continuation callback run after Save and after Discard (not after Cancel), so both the mode-switch path and the app-close path (Task 3) drive the same modal.

**Files:**
- Modify: `media-viewer.js` (`showTournamentLeavePrompt` ~line 4162; its single caller in `switchMode` ~line 4068)
- Test: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `this.tournament.flush()`, `this.tournament.handleDiscard()`, `this.tournament.engine.getProgress()`.
- Produces: `showTournamentLeavePrompt(onAfterLeave: () => Promise<void> | void)` — `onAfterLeave` is awaited after Save (post-`flush`, engine nulled) and after Discard (post-`handleDiscard`); not called on Cancel.

- [x] **Step 1: Write the failing unit tests**

Add to `tests/media-viewer-utils.test.js` (near the other extracted-method describes):

```javascript
describe('showTournamentLeavePrompt continuation', () => {
    const showTournamentLeavePrompt = extractMethod('showTournamentLeavePrompt');

    const makeEl = () => ({ textContent: '', innerHTML: '', style: {}, onclick: null });
    let elements;

    beforeEach(() => {
        elements = {
            tournamentResumeModal: makeEl(),
            tournamentResumeTitle: makeEl(),
            tournamentResumeBody: makeEl(),
            tournamentResumeAccept: makeEl(),
            tournamentResumeDiscard: makeEl(),
            tournamentResumeCancel: makeEl(),
        };
        globalThis.document = { getElementById: (id) => elements[id] };
    });
    afterEach(() => {
        delete globalThis.document;
    });

    const makeCtx = () => ({
        tournament: {
            engine: { getProgress: () => ({ gamesPlayed: 1, gamesTotal: 3 }) },
            flush: vi.fn().mockResolvedValue(undefined),
            handleDiscard: vi.fn().mockResolvedValue(undefined),
        },
    });

    it('runs the continuation after Save & leave (flush + engine nulled)', async () => {
        const ctx = makeCtx();
        const onAfterLeave = vi.fn().mockResolvedValue(undefined);
        showTournamentLeavePrompt.call(ctx, onAfterLeave);
        await elements.tournamentResumeAccept.onclick();
        expect(ctx.tournament.flush).toHaveBeenCalledTimes(1);
        expect(ctx.tournament.engine).toBeNull();
        expect(onAfterLeave).toHaveBeenCalledTimes(1);
    });

    it('runs the continuation after Discard', async () => {
        const ctx = makeCtx();
        const onAfterLeave = vi.fn().mockResolvedValue(undefined);
        showTournamentLeavePrompt.call(ctx, onAfterLeave);
        await elements.tournamentResumeDiscard.onclick();
        expect(ctx.tournament.handleDiscard).toHaveBeenCalledTimes(1);
        expect(onAfterLeave).toHaveBeenCalledTimes(1);
    });

    it('does NOT run the continuation on Cancel and hides the modal', () => {
        const ctx = makeCtx();
        const onAfterLeave = vi.fn();
        showTournamentLeavePrompt.call(ctx, onAfterLeave);
        elements.tournamentResumeCancel.onclick();
        expect(onAfterLeave).not.toHaveBeenCalled();
        expect(elements.tournamentResumeModal.style.display).toBe('none');
    });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "showTournamentLeavePrompt continuation"`
Expected: FAIL — the current method calls `this._applyModeSwitch(targetMode)` (undefined on the mock ctx → throws) instead of `onAfterLeave`.

- [x] **Step 3: Refactor the method signature + body**

In `media-viewer.js`, change the method header at ~line 4162 from `showTournamentLeavePrompt(targetMode) {` to `showTournamentLeavePrompt(onAfterLeave) {`, and update the two continuation call sites inside it:

Replace the `acceptBtn.onclick` body's last line `await this._applyModeSwitch(targetMode);` with:

```javascript
        acceptBtn.onclick = async () => {
            // State is persisted per-pick (debounced); flush any pending write so the latest
            // picks are durable, then drop the in-memory engine (disk is the single source of truth).
            await this.tournament.flush();
            this.tournament.engine = null;
            cleanup();
            await onAfterLeave();
        };
```

Replace the `discardBtn.onclick` body's last line `await this._applyModeSwitch(targetMode);` with:

```javascript
        discardBtn.onclick = async () => {
            await this.tournament.handleDiscard();
            cleanup();
            await onAfterLeave();
        };
```

(The `cancelBtn.onclick = () => cleanup();` line is unchanged.)

- [x] **Step 4: Update the caller in `switchMode`**

In `media-viewer.js` at ~line 4068, change:

```javascript
            this.showTournamentLeavePrompt(mode);
```

to:

```javascript
            this.showTournamentLeavePrompt(() => this._applyModeSwitch(mode));
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "showTournamentLeavePrompt continuation"`
Expected: PASS (3 tests).

- [x] **Step 6: Confirm no other caller relied on the old signature**

Run: `git grep -n "showTournamentLeavePrompt(" -- "*.js"`
Expected: only the definition and the updated `switchMode` caller (the `_applyModeSwitch(mode)` continuation). No bare `showTournamentLeavePrompt(mode)` remains.

- [x] **Step 7: Run full unit suite + lint**

Run: `npm test && npm run lint`
Expected: 384 unit tests pass (381 + 3 new); lint 0 errors.

- [x] **Step 8: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "refactor(tournament): leave prompt takes an onAfterLeave continuation"
```

---

### Task 3: App-close confirm — renderer handler + preload bridge (Item 2 part A)

Add the renderer's decision logic (`handleAppCloseRequest`) and the preload IPC bridge so the renderer can answer the main process's close request, reusing the Task 2 leave prompt.

**Files:**
- Modify: `preload.js` (after the `logError` line ~line 60)
- Modify: `media-viewer.js` (new method `handleAppCloseRequest` after `showTournamentLeavePrompt` ~line 4204; register listener in `setupEventListeners` ~line 1972)
- Test: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `showTournamentLeavePrompt(onAfterLeave)` (Task 2); `window.electronAPI.allowAppClose()`, `window.electronAPI.logError(msg)`.
- Produces:
  - `preload`: `onAppCloseRequested(callback): () => void` (subscribes to `'app-close-requested'`, returns an unsubscribe fn) and `allowAppClose(): void` (sends `'app-close-allow'`).
  - `MediaViewer.handleAppCloseRequest(): void` — shows the leave prompt for an incomplete tournament (continuation = `allowAppClose`), else calls `allowAppClose()` immediately; always allows on error.

- [x] **Step 1: Write the failing unit tests**

Add to `tests/media-viewer-utils.test.js`:

```javascript
describe('handleAppCloseRequest', () => {
    const handleAppCloseRequest = extractMethod('handleAppCloseRequest');
    let allowAppClose, logError;

    beforeEach(() => {
        allowAppClose = vi.fn();
        logError = vi.fn();
        globalThis.window = { electronAPI: { allowAppClose, logError } };
    });
    afterEach(() => {
        delete globalThis.window;
    });

    it('allows close immediately when not in tournament mode', () => {
        const ctx = { isTournamentMode: false, tournament: {}, showTournamentLeavePrompt: vi.fn() };
        handleAppCloseRequest.call(ctx);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        expect(ctx.showTournamentLeavePrompt).not.toHaveBeenCalled();
    });

    it('allows close immediately when the tournament is complete', () => {
        const ctx = {
            isTournamentMode: true,
            tournament: { engine: { isComplete: () => true } },
            showTournamentLeavePrompt: vi.fn(),
        };
        handleAppCloseRequest.call(ctx);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        expect(ctx.showTournamentLeavePrompt).not.toHaveBeenCalled();
    });

    it('shows the leave prompt for an incomplete tournament; its continuation allows close', () => {
        const ctx = {
            isTournamentMode: true,
            tournament: { engine: { isComplete: () => false } },
            showTournamentLeavePrompt: vi.fn(),
        };
        handleAppCloseRequest.call(ctx);
        expect(ctx.showTournamentLeavePrompt).toHaveBeenCalledTimes(1);
        expect(allowAppClose).not.toHaveBeenCalled();
        const continuation = ctx.showTournamentLeavePrompt.mock.calls[0][0];
        continuation();
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('still allows close if the handler throws (fail-safe)', () => {
        const ctx = {
            get isTournamentMode() {
                throw new Error('boom');
            },
            tournament: {},
            showTournamentLeavePrompt: vi.fn(),
        };
        handleAppCloseRequest.call(ctx);
        expect(logError).toHaveBeenCalled();
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "handleAppCloseRequest"`
Expected: FAIL — `extractMethod('handleAppCloseRequest')` throws "Could not find method" (not implemented yet).

- [x] **Step 3: Implement `handleAppCloseRequest`**

In `media-viewer.js`, add immediately after `showTournamentLeavePrompt` (after its closing brace ~line 4204):

```javascript
    // Main process intercepted a window-close (X / Alt+F4 / quit) and is asking whether it
    // may proceed. For an incomplete tournament, show the same Save/Discard/Cancel leave
    // prompt the user sees on Escape — Save/Discard then allow the close, Cancel keeps the
    // app open. Otherwise allow immediately. Fail-safe: any error still allows the close, so
    // a renderer bug can never make the app unclosable.
    handleAppCloseRequest() {
        try {
            if (this.isTournamentMode && this.tournament.engine && !this.tournament.engine.isComplete()) {
                this.showTournamentLeavePrompt(() => window.electronAPI.allowAppClose());
            } else {
                window.electronAPI.allowAppClose();
            }
        } catch (err) {
            window.electronAPI.logError?.('app-close handler failed: ' + err.message);
            window.electronAPI.allowAppClose();
        }
    }
```

- [x] **Step 4: Add the preload IPC bridge**

In `preload.js`, immediately after the `logError` line (~line 60), inside the `exposeInMainWorld` object:

```javascript
    // App-close confirm: main intercepts window close and asks the renderer (which owns
    // tournament state) whether it may proceed. onAppCloseRequested returns an unsubscribe fn.
    onAppCloseRequested: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('app-close-requested', handler);
        return () => ipcRenderer.removeListener('app-close-requested', handler);
    },
    allowAppClose: () => ipcRenderer.send('app-close-allow'),
```

- [x] **Step 5: Register the renderer listener**

In `media-viewer.js`, inside `setupEventListeners()` after the `tournamentExitBtn` wiring from Task 1 (~line 1972):

```javascript
// App-close confirm: main asks before quitting with a tournament in progress.
if (window.electronAPI.onAppCloseRequested) {
    window.electronAPI.onAppCloseRequested(() => this.handleAppCloseRequest());
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "handleAppCloseRequest"`
Expected: PASS (4 tests).

- [x] **Step 7: Run full unit suite + lint**

Run: `npm test && npm run lint`
Expected: 388 unit tests pass (384 + 4 new); lint 0 errors.

- [x] **Step 8: Commit**

```bash
git add preload.js media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(tournament): renderer app-close confirm handler + preload bridge"
```

> **Security review note:** This task adds two `preload.js` IPC channels (`onAppCloseRequested` receive, `allowAppClose` send). Both are unidirectional, carry no payload, and expose no filesystem access — consistent with the existing bridge. Flag for the security-review gate during PR review.

---

### Task 4: App-close confirm — main-process interception (Item 2 part B)

Intercept the window `close` event in the main process, round-trip to the renderer, and only quit once the renderer replies. This completes the loop started in Task 3. No unit test (Electron main process) — verified manually + by code review.

**Files:**
- Modify: `main.js` (`let isQuitting` near `let mainWindow` ~line 95; `close` handler + `ipcMain.on('app-close-allow')` inside `createWindow` ~line 119)
- Modify: `tests/e2e/tournament-mode.test.js` (`afterEach` teardown hardening)

**Interfaces:**
- Consumes: renderer's `'app-close-requested'` listener and `'app-close-allow'` reply (Task 3).
- Produces: window-lifecycle interception. No renderer-visible API beyond the two IPC channels.

> **Why the E2E teardown change:** `closeApp` calls `electronApp.close()` (graceful — fires the window `close` event) racing a 5s timeout, then force-kills. Once this task intercepts `close`, any tournament E2E test that ends with an **incomplete** tournament would make the graceful close hang (renderer shows the leave modal, never replies) → 5s timeout → SIGKILL on every such test. Resetting the engine before close makes the handler see no active tournament and allow the close immediately. This is test-teardown hygiene — no test-only branch is added to production `main.js`.

- [x] **Step 1: Add the quit-confirmed flag**

In `main.js`, beside `let mainWindow;` (~line 95):

```javascript
let isQuitting = false; // set true once the user confirms, to let the re-issued close() through
```

- [x] **Step 2: Intercept `close` and add the reply handler**

In `main.js`, inside `createWindow()` after the `before-input-event` DevTools handler (~line 119, before the function's closing `}`):

```javascript
    // Confirm before close when a tournament is in progress. Every close path — the window
    // "X", app.quit() (via window-all-closed), and the Alt+F4 globalShortcut (which calls
    // focusedWindow.close()) — fires this 'close' event, so one handler covers them all.
    // preventDefault, ask the renderer (which owns tournament state), and proceed only when
    // it replies via 'app-close-allow'.
    mainWindow.on('close', (e) => {
        if (isQuitting) return; // already confirmed → let the re-issued close() through
        const wc = mainWindow.webContents;
        if (wc.isDestroyed() || wc.isCrashed()) return; // dead renderer → never trap the app
        e.preventDefault();
        wc.send('app-close-requested');
    });

    // Renderer's verdict: no tournament, or the user chose Save & leave / Discard.
    ipcMain.on('app-close-allow', () => {
        if (mainWindow) {
            isQuitting = true;
            mainWindow.close();
        }
    });
```

- [x] **Step 3: Harden the tournament E2E teardown**

In `tests/e2e/tournament-mode.test.js`, update the `afterEach` so it drops any in-progress engine before `closeApp` (preventing the new `close` interception from hanging teardown):

```javascript
    test.afterEach(async () => {
        // Drop any in-progress tournament so the main-process close confirm (which traps an
        // incomplete tournament) doesn't hang graceful teardown → 5s timeout → SIGKILL.
        if (page) {
            await page
                .evaluate(() => {
                    if (window.mediaViewer && window.mediaViewer.tournament) {
                        window.mediaViewer.tournament.engine = null;
                    }
                })
                .catch(() => {});
        }
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });
```

- [x] **Step 4: Verify no unit/lint regression**

Run: `npm test && npm run lint`
Expected: 388 unit tests pass; lint 0 errors. (`ipcMain` is already imported in `main.js`.)

- [x] **Step 5: Manual test — the full close-confirm loop**

Run: `npm start`. Verify each case:

1. **No tournament** — open a folder in single mode, press the window "X". → App closes immediately, no prompt.
2. **Incomplete tournament + Cancel** — enter tournament mode, start a tournament, make 0–1 picks, press **Alt+F4**. → "Leave tournament?" modal appears; click **Cancel** → app stays open, tournament intact.
3. **Incomplete tournament + Save & leave** — press the window "X" → modal → **Save & leave** → app quits. Relaunch, open the same folder, enter tournament → the **Continue / Start over** prompt offers the saved state.
4. **Incomplete tournament + Discard** — start a fresh tournament, press "X" → modal → **Discard** → app quits. Relaunch, enter tournament for that folder → no saved state (config modal, not Continue).
5. **Complete tournament** — finish a 1-round 2-file tournament to the summary, press "X". → App closes immediately, no leave prompt (engine is complete).

Record the result of each case.

- [x] **Step 6: Commit**

```bash
git add main.js tests/e2e/tournament-mode.test.js
git commit -m "feat(tournament): confirm before app close during an active tournament"
```

---

### Task 5: Full verification + closeout prep

Run the whole automated suite and a consolidated manual smoke before handing the branch to PR review.

**Files:** none (verification only).

- [x] **Step 1: Full unit suite**

Run: `npm test`
Expected: 388 tests pass.

- [x] **Step 2: Lint + format check**

Run: `npm run lint && npm run format:check`
Expected: 0 lint errors; Prettier reports all matched files formatted.

- [x] **Step 3: E2E (tournament file)**

Run: `npx playwright test tests/e2e/tournament-mode.test.js`
Expected: all tournament E2E tests pass, including the new "exit button" test.

- [x] **Step 4: Consolidated manual smoke**

Confirm both items in one `npm start` session:
- Item 1: in tournament mode, the centered header exit button is visible; clicking it opens "Leave tournament?"; Save/Discard/Cancel each behave (Cancel returns to the tournament, Save/Discard return to single mode).
- Item 2: re-confirm at least cases 1, 2, and 3 from Task 4 Step 5.

- [x] **Step 5: Report results**

Summarize the unit/lint/E2E counts and the manual-case outcomes. Do NOT run the post-approval closeout (Extract → Archive → Transition → Commit → Capture learnings) until the user approves — that is the CLAUDE.md task-completion flow, performed after this plan's implementation is accepted.

---

## Notes for the implementer

- The renderer (`media-viewer.js`) has no bundler — use browser globals and the existing `import` for ES modules; do not add `require` there.
- `window.electronAPI.logError?.(...)` is fire-and-forget (no `await`).
- The `extractMethod` helper brace-counts raw source; `handleAppCloseRequest`'s error string contains no `{`/`}`, and `showTournamentLeavePrompt`'s template literals are brace-balanced (`${...}`), so both extract cleanly.
- When running a single Vitest test by name, vitest v4 `-t` matches a substring of the test/suite title.
