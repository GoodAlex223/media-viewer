# Group G2 — Tournament-Mode Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix three user-flagged Tournament Mode defects — undo that silently targets the wrong action, mouse-wheel navigation that desyncs the pair, and always-visible chrome that eats viewing area.

**Architecture:** `engine.history` becomes the single chronological undo stack: entries carry a `kind` discriminator (`pick` / `special` / `prune`), two new engine methods (`peekUndoEntry`, `undoUserAction`) expose "the newest *user* action" while transparently reversing system prunes, and `handleTournamentUndo` becomes a thin dispatcher over it. The wheel fix is a one-line mode guard. Auto-hide extracts the existing `.header` reveal logic into a reusable helper applied to three elements.

**Tech Stack:** Electron 30 renderer (no bundler), pure-ESM `tournament-engine.js`, Vitest (unit), Playwright + Electron (E2E), Prettier + ESLint flat config.

**Spec:** [docs/superpowers/specs/2026-07-20-g2-tournament-bug-fixes-design.md](../../superpowers/specs/2026-07-20-g2-tournament-bug-fixes-design.md) (commit `49170bd`)
**Branch:** `fix/g2-tournament-bug-fixes` (deleted post-merge, remote + local)

> **Status: Complete (code) — ARCHIVED 2026-07-21.** All 6 tasks executed and reviewed; MERGED via **PR #65** (merge `937084c`). Automated verification green: **492 unit / 55 E2E / lint 0-err**. The whole-branch review + fix waves added three commits beyond the plan (`1c18029` TOCTOU mutex, `0848723` exit-button, `ae98e85` advisory-mutex identity re-check) and a pre-push flake fix (`b6be9c7`). **The "Manual smoke (user-side, gates checkoff)" section below was NOT run before the user-directed merge** — the code is on `main` with that acceptance gate still open (fix-forward if it surfaces anything). See [DONE.md](../../planning/DONE.md) 2026-07-21.

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `bracketSpacing`, `arrowParens=always`, `endOfLine="lf"`. Run `npm run format` before each commit.
- **Persisted state stays `version: 2`.** Do not touch `TournamentEngine.serialize`/`deserialize` or `strategyState`. Undo history is **never** persisted (spec D5).
- **`UNDO_HISTORY_CAP` stays `100`.**
- **`tournament-engine.js` is pure ESM and must stay renderer-free** — no `document`, no `window`, no `window.electronAPI`. It stores `meta` opaquely and never inspects it (spec D3).
- **Unused variables** must be `_`-prefixed to satisfy ESLint `no-unused-vars`.
- **Pre-commit hook** runs `check-secrets.js` → lint-staged → `npx vitest run`. All unit tests must pass on every commit. E2E is **not** run by the hook — run it manually where the plan says so.
- **Baseline before starting:** 471 unit tests passing, E2E 52/52.
- **Commit style:** `type(g2): subject`, body wrapped at ~80 chars, trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `tournament-engine.js` | Owns the undo stack: `kind` discriminator, `peekUndoEntry`, `peekUndoKind`, `undoUserAction`. Stays pure/renderer-free. | 1 |
| `tests/tournament-engine.test.js` | Engine undo-stack unit tests; one stale test renamed. | 1 |
| `media-viewer.js` | `handleTournamentUndo` dispatcher; `moveToSpecialFolder` tournament removal now `trackUndo`; undo-button state; wheel guard; `_setupAutoHide` helper + `setupHeaderVisibility` rewire; chrome reveal/hide on tournament enter/exit. | 2, 3, 4, 5 |
| `tests/media-viewer-utils.test.js` | `handleTournamentUndo` extracted-method unit tests. | 2 |
| `styles.css` | `.tournament-header` / `.tournament-controls` auto-hide rules. | 5 |
| `tests/e2e/tournament-mode.test.js` | Undo-button state, wheel guard, auto-hide E2E; `revealTournamentChrome` helper; three existing call sites updated. | 3, 4, 5 |
| `CLAUDE.md` | Two "Active gotchas" bullets corrected. | 6 |

---

### Task 1: Engine — unified undo stack

**Files:**
- Modify: `tournament-engine.js:360-431` (`recordResult`, `recordDraw`, `undo`, `removeFile`) + new methods
- Test: `tests/tournament-engine.test.js` (new describe block; rename the test at `:458`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces, all on `TournamentEngine`:
  - `peekUndoEntry(): object | null` — newest *user* history entry (skipping trailing `prune`s), no mutation.
  - `peekUndoKind(): 'pick' | 'special' | null` — that entry's `kind`, defaulting a missing `kind` to `'pick'`.
  - `undoUserAction(): object | null` — reverses trailing `prune` entries then exactly one user entry; returns that entry (so callers can read `.meta`); returns `null` and mutates nothing when there is no user entry.
  - `undo(): object | null` — existing single-entry primitive, now **returns the popped entry** instead of `undefined`.
  - `removeFile(filePath, { trackUndo = false, kind = 'prune', meta = null })` — the `kind`/`meta` options are new; defaults preserve today's behaviour at the `-1` auto-prune call site.
  - History entries from `recordResult`/`recordDraw` now carry `kind: 'pick'`.

> **Deviation from the spec, deliberate:** the spec names only `peekUndoKind()`. The dispatcher in
> Task 2 needs the entry's `meta` *before* committing to the undo (the disk restore must succeed
> first), so `peekUndoEntry()` is added as the primitive and `peekUndoKind()` becomes a one-line
> wrapper over it. Same semantics, no extra scan cost.

- [x] **Step 1: Write the failing tests**

Append to `tests/tournament-engine.test.js`:

```js
describe('TournamentEngine unified undo stack (peekUndoEntry / peekUndoKind / undoUserAction)', () => {
    const FILES = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
    // 6 files → 3 pairs in round 1, so the first two picks are non-boundary inverse-deltas
    // (roundQueue.length > 1 at captureUndo time), which is the interesting case.
    const makeEngine = () => new TournamentEngine(FILES, new SwissStrategy(), { rounds: 3 });

    it('peekUndoKind returns null on an empty history', () => {
        expect(makeEngine().peekUndoKind()).toBeNull();
        expect(makeEngine().peekUndoEntry()).toBeNull();
    });

    it('peekUndoKind returns "pick" after a recorded result', () => {
        const eng = makeEngine();
        const p = eng.getCurrentPair();
        eng.recordResult(p.left, p.right);
        expect(eng.peekUndoKind()).toBe('pick');
    });

    it('peekUndoKind returns "special" for a kind:"special" removal', () => {
        const eng = makeEngine();
        eng.removeFile('c.jpg', { trackUndo: true, kind: 'special', meta: { fileName: 'c.jpg' } });
        expect(eng.peekUndoKind()).toBe('special');
    });

    it('peekUndoKind sees past trailing system prunes without mutating', () => {
        const eng = makeEngine();
        const p = eng.getCurrentPair();
        eng.recordResult(p.left, p.right);
        eng.removeFile('e.jpg', { trackUndo: true }); // default kind → 'prune'
        eng.removeFile('f.jpg', { trackUndo: true });
        const depth = eng.history.length;
        expect(eng.peekUndoKind()).toBe('pick');
        expect(eng.history.length).toBe(depth); // a peek must never consume
    });

    it('peekUndoKind returns null when the history holds only system prunes', () => {
        const eng = makeEngine();
        eng.removeFile('e.jpg', { trackUndo: true });
        expect(eng.peekUndoKind()).toBeNull();
    });

    it('undoUserAction consumes trailing prunes and exactly one user entry', () => {
        const eng = makeEngine();
        const p1 = eng.getCurrentPair();
        eng.recordResult(p1.left, p1.right);
        const p2 = eng.getCurrentPair();
        eng.recordResult(p2.left, p2.right);
        eng.removeFile('e.jpg', { trackUndo: true }); // a system prune sits on top

        const entry = eng.undoUserAction();
        expect(entry.kind).toBe('pick');
        expect(eng.history.length).toBe(1); // only the first pick remains
        expect(eng.peekUndoKind()).toBe('pick');
        expect(eng.strategy.files).toContain('e.jpg'); // the prune was reversed too
    });

    it('undoUserAction returns null and mutates nothing on a prune-only history', () => {
        const eng = makeEngine();
        eng.removeFile('e.jpg', { trackUndo: true });
        const before = eng.history.length;
        expect(eng.undoUserAction()).toBeNull();
        expect(eng.history.length).toBe(before);
        expect(eng.files).not.toContain('e.jpg'); // nothing reversed
    });

    it('undoing a kind:"special" removal restores full strategy state, not just engine.files', () => {
        const eng = makeEngine();
        const meta = { fileName: 'c.jpg', newPath: '/special/c.jpg' };
        eng.removeFile('c.jpg', { trackUndo: true, kind: 'special', meta });
        expect(eng.strategy.files).not.toContain('c.jpg');

        const entry = eng.undoUserAction();
        expect(entry.meta).toBe(meta); // opaque payload round-trips by identity
        expect(eng.files).toContain('c.jpg');
        expect(eng.strategy.files).toContain('c.jpg'); // the divergence regression
        expect(eng.strategy.winCounts.has('c.jpg')).toBe(true);
        expect(eng.strategy.byes.size).toBe(0); // no phantom bye left by the removal
    });

    it('treats a history entry with no kind as a pick (entries written before G2)', () => {
        const eng = makeEngine();
        eng.history.push({ undo: { kind: 'snapshot', strategyStateSnapshot: eng.strategy.serialize() } });
        expect(eng.peekUndoKind()).toBe('pick');
    });

    it('recordResult and recordDraw tag their history entries kind:"pick"', () => {
        const eng = makeEngine();
        const p1 = eng.getCurrentPair();
        eng.recordResult(p1.left, p1.right);
        const p2 = eng.getCurrentPair();
        eng.recordDraw(p2.left, p2.right, 'win');
        expect(eng.history.map((h) => h.kind)).toEqual(['pick', 'pick']);
    });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tournament-engine.test.js --no-file-parallelism`
Expected: FAIL — `eng.peekUndoKind is not a function` (vitest v4.0.18 is flaky under parallelism on Windows; `--no-file-parallelism` is the house workaround).

- [x] **Step 3: Add the `kind` discriminator to pick entries**

In `tournament-engine.js`, `recordResult` (~line 365) — add `kind` as the first property of the pushed object:

```js
        this.history.push({
            kind: 'pick',
            winner,
            loser,
            round: progressBefore.round,
            gameIndex: progressBefore.gamesPlayed,
            timestamp: Date.now(),
            undo,
            // Engine-level files list captured separately so undo() can rewind a removeFile()
            // that happened between picks (getTierBreakdown/handleApply read engine.files).
            filesSnapshot: [...this.files],
        });
```

And in `recordDraw` (~line 384):

```js
        this.history.push({
            kind: 'pick',
            draw: true,
            outcome,
            a,
            b,
            round: progressBefore.round,
            gameIndex: progressBefore.gamesPlayed,
            timestamp: Date.now(),
            undo,
            filesSnapshot: [...this.files],
        });
```

- [x] **Step 4: Make `undo()` return the popped entry**

Replace `undo()` (~line 398):

```js
    // Reverse exactly one history entry, whatever its kind. Returns the popped entry (or null).
    // Prefer undoUserAction() for user-facing undo — it also absorbs system `prune` entries.
    undo() {
        if (this.history.length === 0) return null;
        const entry = this.history.pop();
        this.strategy.applyUndo(entry.undo);
        if (entry.filesSnapshot) {
            this.files = [...entry.filesSnapshot];
        }
        return entry;
    }
```

- [x] **Step 5: Add the peek + user-undo methods**

Insert directly after `undo()`:

```js
    // A `prune` entry is system-initiated — the renderer's -1 auto-prune of a file that
    // vanished from disk. It is reversed transparently as part of the following user undo, so
    // it never costs the user a press. Everything else (`pick`, `special`) is a user action.
    // Entries written before G2 carry no `kind`; they are picks.
    _isUserEntry(entry) {
        return (entry.kind ?? 'pick') !== 'prune';
    }

    // Newest user entry, looking past trailing system prunes. Does NOT mutate.
    // Returns null when there is nothing the user can undo (empty, or prunes only).
    peekUndoEntry() {
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this._isUserEntry(this.history[i])) return this.history[i];
        }
        return null;
    }

    peekUndoKind() {
        const entry = this.peekUndoEntry();
        return entry ? (entry.kind ?? 'pick') : null;
    }

    // Reverse trailing system prunes, then exactly one user entry; return that entry so the
    // caller can read its `meta`. Mutates nothing when there is no user entry to reverse.
    undoUserAction() {
        if (this.peekUndoEntry() === null) return null;
        let entry = this.undo();
        while (entry && !this._isUserEntry(entry)) {
            entry = this.undo();
        }
        return entry;
    }
```

- [x] **Step 6: Extend `removeFile` with `kind` + `meta`**

Replace the `removeFile` doc comment and signature (~line 407-428). Note the rewritten comment — the old one asserts the special path is *not* tracked, which this change reverses:

```js
    // `trackUndo: true` records a snapshot-based undo entry BEFORE removing, so a later undo()
    // fully reverses a mid-tournament removal — restoring the strategy state (files/byes/
    // winCounts/roundQueue), not just engine.files. Without it, the O(1) inverse-delta of the
    // picks recorded before the removal cannot resurrect the removed file's strategy state,
    // corrupting the tournament on undo-past-a-removal.
    //
    // `kind` places the entry on the unified undo stack (G2):
    //   'prune'   (default) — system-initiated, absorbed transparently by undoUserAction()
    //   'special' — the renderer's special-folder move, a user action worth one Undo press
    // `meta` is an opaque renderer payload (the moveHistory entry) stored and handed back by
    // peekUndoEntry()/undoUserAction(); the engine never inspects it.
    removeFile(filePath, { trackUndo = false, kind = 'prune', meta = null } = {}) {
        if (!this.files.includes(filePath)) return;
        if (trackUndo) {
            // Same entry shape as a boundary-snapshot pick, so undo() reverses it with no extra
            // dispatch: applyUndo restores the strategy from the snapshot, filesSnapshot restores
            // engine.files. Snapshot is captured BEFORE the mutations below.
            this.history.push({
                kind,
                file: filePath,
                meta,
                undo: { kind: 'snapshot', strategyStateSnapshot: this.strategy.serialize() },
                filesSnapshot: [...this.files],
            });
            if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();
        }
        this.files = this.files.filter((f) => f !== filePath);
        this.strategy.removeFile(filePath);
    }
```

- [x] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/tournament-engine.test.js --no-file-parallelism`
Expected: PASS — 41 tests (31 existing + 10 new).

- [x] **Step 8: Fix the now-false stale test**

The test at `tests/tournament-engine.test.js:458` asserts a rationale this task reverses. Replace it entirely:

```js
    it('removeFile defaults to no undo tracking, and to kind:"prune" when tracked', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });
        const before = eng.history.length;
        eng.removeFile('c.jpg'); // no options → default { trackUndo: false }
        expect(eng.history.length).toBe(before);
        expect(eng.files).not.toContain('c.jpg');

        // When tracked without an explicit kind (the -1 auto-prune call site), the entry is a
        // system prune — it must not consume a user Undo press.
        eng.removeFile('d.jpg', { trackUndo: true });
        expect(eng.history[eng.history.length - 1].kind).toBe('prune');
        expect(eng.peekUndoKind()).toBeNull();
    });
```

- [x] **Step 9: Run the full unit suite**

Run: `npx vitest run --no-file-parallelism`
Expected: PASS — 481 tests (471 baseline + 10 new).

- [x] **Step 10: Format, lint, and commit**

```bash
npm run format
npm run lint
git add tournament-engine.js tests/tournament-engine.test.js
git commit -m "feat(g2): unified undo stack in TournamentEngine

engine.history becomes the single chronological undo stack. Entries carry a
kind discriminator: 'pick' (recordResult/recordDraw), 'special' (a renderer
special-folder move) and 'prune' (the -1 auto-prune, system-initiated).

New: peekUndoEntry/peekUndoKind report the newest USER entry without
mutating; undoUserAction reverses trailing prunes plus exactly one user
entry and returns it so the caller can read its opaque meta payload.
undo() now returns the popped entry. removeFile gains kind/meta options,
defaulting to 'prune'/null so the auto-prune call site is unchanged.

Entries written before this change carry no kind and are treated as picks.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Renderer — `handleTournamentUndo` dispatcher

**Files:**
- Modify: `media-viewer.js:1562-1568` (tournament removal inside `moveToSpecialFolder`)
- Modify: `media-viewer.js:4700-4751` (`handleTournamentUndo`)
- Test: `tests/media-viewer-utils.test.js` (new describe block)

**Interfaces:**
- Consumes (Task 1): `engine.peekUndoEntry()`, `engine.undoUserAction()`, `engine.removeFile(path, { trackUndo, kind, meta })`.
- Produces: `handleTournamentUndo()` — dispatches on the peeked entry's `kind`; the special branch restores the file on disk *before* advancing the stack. No longer reads `this.moveHistory` to choose a branch.

> **On the `globalThis.MediaViewer` stub** the spec flags: not needed here. `handleTournamentUndo`'s
> body touches only `this.*`, `window.electronAPI` and `console` — no class-static reference, so
> there is no vacuous-pass risk from `new AsyncFunction` resolving a global. Verified by reading the
> method body; re-check if the implementation drifts.

- [x] **Step 1: Write the failing tests**

Append to `tests/media-viewer-utils.test.js`:

```js
describe('handleTournamentUndo (unified undo stack)', () => {
    const handleTournamentUndo = extractAsyncMethod('handleTournamentUndo');

    function makeCtx(pending, overrides = {}) {
        const engine = {
            peekUndoEntry: vi.fn(() => pending),
            undoUserAction: vi.fn(() => pending),
        };
        return {
            isTournamentMode: true,
            isLoading: false,
            baseFolderPath: '/src',
            showRatingConfirmations: false,
            mediaFiles: [],
            moveHistory: [],
            tournament: { engine, _schedulePersist: vi.fn() },
            showNotification: vi.fn(),
            showError: vi.fn(),
            restoreFeatureCachesFromHistory: vi.fn(),
            updateFolderInfo: vi.fn(),
            showTournamentPair: vi.fn(async () => {}),
            ...overrides,
        };
    }

    const SPECIAL_META = {
        fileName: 'c.jpg',
        originalPath: '/src/c.jpg',
        newPath: '/special/c.jpg',
        fileSize: 9,
        fileType: 'image',
        actionType: 'special',
    };

    beforeEach(() => {
        globalThis.window = { electronAPI: { moveFile: vi.fn(async () => ({ success: true })) } };
    });

    afterEach(() => {
        delete globalThis.window;
    });

    it('notifies and leaves the engine alone when there is nothing to undo', async () => {
        const ctx = makeCtx(null);
        await handleTournamentUndo.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledWith('Nothing to undo', 'info');
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });

    it('undoes a pick without touching the disk', async () => {
        const ctx = makeCtx({ kind: 'pick' });
        await handleTournamentUndo.call(ctx);
        expect(ctx.tournament.engine.undoUserAction).toHaveBeenCalledTimes(1);
        expect(globalThis.window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx.tournament._schedulePersist).toHaveBeenCalledWith('/src');
        expect(ctx.showTournamentPair).toHaveBeenCalled();
    });

    it('bails while isLoading (mirrors handleTournamentPick/handleTournamentDraw)', async () => {
        const ctx = makeCtx({ kind: 'pick' }, { isLoading: true });
        await handleTournamentUndo.call(ctx);
        expect(ctx.tournament.engine.peekUndoEntry).not.toHaveBeenCalled();
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
    });

    it('restores the file on disk, then advances the stack, for a special entry', async () => {
        const ctx = makeCtx({ kind: 'special', meta: SPECIAL_META }, { moveHistory: [SPECIAL_META] });
        await handleTournamentUndo.call(ctx);
        expect(globalThis.window.electronAPI.moveFile).toHaveBeenCalledWith({
            sourcePath: '/special/c.jpg',
            targetFolder: '/src',
            fileName: 'c.jpg',
        });
        expect(ctx.tournament.engine.undoUserAction).toHaveBeenCalledTimes(1);
        expect(ctx.mediaFiles).toEqual([{ name: 'c.jpg', path: '/src/c.jpg', size: 9, type: 'image' }]);
        expect(ctx.restoreFeatureCachesFromHistory).toHaveBeenCalledWith(SPECIAL_META);
        expect(ctx.moveHistory).toEqual([]); // the consumed entry is removed by identity
        expect(ctx.showTournamentPair).toHaveBeenCalled();
    });

    it('leaves the stack, moveHistory and mediaFiles untouched when the disk restore fails', async () => {
        const ctx = makeCtx({ kind: 'special', meta: SPECIAL_META }, { moveHistory: [SPECIAL_META] });
        globalThis.window.electronAPI.moveFile = vi.fn(async () => ({ success: false, error: 'EPERM' }));
        await handleTournamentUndo.call(ctx);
        expect(ctx.showError).toHaveBeenCalled();
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([SPECIAL_META]);
        expect(ctx.mediaFiles).toEqual([]);
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });

    it('a special move made outside the tournament cannot divert a pick undo', async () => {
        // THE REPORTED BUG. moveHistory holds a special move made in single mode; the newest
        // engine entry is a pick. Pre-G2 this peeked moveHistory and took the special branch,
        // restoring an unrelated file while the pick stood — "undo did nothing".
        const stray = { ...SPECIAL_META, fileName: 's.jpg', newPath: '/special/s.jpg' };
        const ctx = makeCtx({ kind: 'pick' }, { moveHistory: [stray] });
        await handleTournamentUndo.call(ctx);
        expect(globalThis.window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([stray]);
        expect(ctx.tournament.engine.undoUserAction).toHaveBeenCalledTimes(1);
    });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism`
Expected: FAIL — the current implementation reads `this.moveHistory[...]` and calls `engine.undo()`, so `peekUndoEntry`/`undoUserAction` are never called and `showNotification` is never called with `'Nothing to undo'`.

- [x] **Step 3: Track the tournament special-move removal on the undo stack**

Replace `media-viewer.js:1562-1568`:

```js
            // Tournament mode: also drop the moved file from the engine. `trackUndo` records it
            // on engine.history as a `special` entry, IN ORDER with the picks, so Ctrl+A reverses
            // whichever action happened last; `meta` carries this moveHistory entry back to
            // handleTournamentUndo (opaque to the engine). The state write is debounced
            // (non-blocking) — a crash before it lands is self-healing, since the file is gone
            // from disk and resume reconciliation prunes it anyway.
            if (this.isTournamentMode && this.tournament.engine) {
                this.tournament.engine.removeFile(fileToMove.path, {
                    trackUndo: true,
                    kind: 'special',
                    meta: historyEntry,
                });
                this.tournament._schedulePersist(this.baseFolderPath);
            }
```

- [x] **Step 4: Rewrite `handleTournamentUndo`**

Replace `media-viewer.js:4700-4751` in full:

```js
    async handleTournamentUndo() {
        if (!this.isTournamentMode || this.isLoading || !this.tournament.engine) return;

        // engine.history is the single chronological undo stack: picks and tournament-mode
        // special-folder moves interleave in it, and system `prune` entries (the -1 auto-prune
        // in showTournamentPair) are absorbed by undoUserAction so they never cost a press.
        const pending = this.tournament.engine.peekUndoEntry();
        if (!pending) {
            // Also the post-resume case: undo is session-only, so a resumed tournament starts
            // with an empty stack (the version:2 payload is deliberately history-free).
            this.showNotification('Nothing to undo', 'info');
            return;
        }

        if ((pending.kind ?? 'pick') === 'special') {
            // The file was physically moved off disk and dropped from mediaFiles + the feature
            // caches. Restore it FIRST and only then advance the stack, so a failed move leaves
            // engine.history and moveHistory exactly as they were.
            const move = pending.meta;
            try {
                const moveResult = await window.electronAPI.moveFile({
                    sourcePath: move.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: move.fileName,
                });
                if (!moveResult.success) {
                    throw new Error(moveResult.error);
                }
            } catch (error) {
                console.error('Error undoing tournament special:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                return;
            }
            // Disk restored — safe to advance. undoUserAction reverses any trailing prunes plus
            // this removal, restoring strategy state (files/winCounts/byes/roundQueue) AND
            // engine.files from the snapshot, so the file re-pairs and reports its real tier.
            this.tournament.engine.undoUserAction();
            this.mediaFiles.push({
                name: move.fileName,
                path: move.originalPath,
                size: move.fileSize,
                type: move.fileType,
            });
            this.restoreFeatureCachesFromHistory(move);
            const moveIdx = this.moveHistory.lastIndexOf(move);
            if (moveIdx !== -1) this.moveHistory.splice(moveIdx, 1);
            if (this.showRatingConfirmations) {
                this.showNotification(`✅ Restored ${move.fileName}`, 'success');
            }
            this.updateFolderInfo();
        } else {
            this.tournament.engine.undoUserAction();
        }

        this.tournament._schedulePersist(this.baseFolderPath);
        await this.showTournamentPair();
    }
```

Note: the old `if (this.isSortedByPrediction) this.requestPredictionScores();` line is **deliberately dropped**, not ported — `enterTournamentMode` calls `restoreOriginalOrderForTournament()`, which forces `isSortedByPrediction = false`, and the sort controls are hidden in-mode, so it is unreachable here.

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism`
Expected: PASS — 194 tests (188 existing + 6 new).

- [x] **Step 6: Mutation-verify the guards**

Four of these tests exist only to pin a guard. A guard test that passes with its guard deleted is worthless (four such tests shipped on the PR #64 branch). Verify each one **fails** when its guard is removed, then restore the guard:

| Mutation | Test that must go red |
|---|---|
| Delete `\|\| this.isLoading` from the first line | `bails while isLoading` |
| Delete the `if (!pending) { … return; }` block | `notifies and leaves the engine alone when there is nothing to undo` |
| Change the failure `return` to fall through | `leaves the stack, moveHistory and mediaFiles untouched when the disk restore fails` |
| Move `undoUserAction()` above the `try` | same as above |

For each: apply the mutation, run `npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism`, confirm the named test FAILS, then **revert that one edit by hand** and re-run to confirm green again before moving to the next.

⚠️ Do **not** use `git checkout -- media-viewer.js` to revert — Steps 3-4 are not committed yet and it would discard them. Each mutation is a one-line change; undo it in the editor.

- [x] **Step 7: Run the full unit suite**

Run: `npx vitest run --no-file-parallelism`
Expected: PASS — 487 tests.

- [x] **Step 8: Format, lint, and commit**

```bash
npm run format
npm run lint
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(g2): tournament undo targets the newest action, not moveHistory

handleTournamentUndo peeked this.moveHistory to decide between its default
and special-move branches. Tournament picks never write to moveHistory, and
moveHistory is cleared only on folder change - so any special-folder move,
including one made in single or compare mode before the tournament started,
permanently owned the top slot and hijacked every later tournament undo. The
special file was restored, the pick stood, and the pair did not change, which
reads as 'undo did nothing'.

Dispatch now runs off engine.peekUndoEntry(), with the special-move removal
recorded on the same stack (kind:'special'). Also adds the missing isLoading
guard, notifies on an empty stack, and restores the file on disk BEFORE
advancing the stack so a failed move is a no-op rather than a compensating
push-back. The special path now restores strategy state via the snapshot,
fixing the engine.files vs strategy.files divergence that left a restored
file unpaired and stuck at Tier-0.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Undo-button enabled state

**Files:**
- Modify: `media-viewer.js:4522-4523` (inside `showTournamentPair`), `media-viewer.js:4796` (summary modal)
- Test: `tests/e2e/tournament-mode.test.js` (new test)

**Interfaces:**
- Consumes (Task 1): `engine.peekUndoKind()`.
- Produces: `#tournamentUndoBtn.disabled` is `true` exactly when `peekUndoKind()` is `null`. Asserted via Playwright `isDisabled()`, which needs no visibility — so it survives Task 5's auto-hide.

- [x] **Step 1: Write the failing E2E test**

Append inside the `test.describe('Tournament Mode', …)` block in `tests/e2e/tournament-mode.test.js`:

```js
    test('undo button is disabled with an empty stack and enabled after a pick', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        // isDisabled() needs no visibility, so this holds once the chrome auto-hides.
        await expect(page.locator('#tournamentUndoBtn')).toBeDisabled();

        await page.keyboard.press('q');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 1);
        await page.waitForFunction(() => !window.mediaViewer.isLoading);
        await expect(page.locator('#tournamentUndoBtn')).toBeEnabled();

        await page.keyboard.press('Control+a');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 0);
        await expect(page.locator('#tournamentUndoBtn')).toBeDisabled();
    });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "undo button is disabled"`
Expected: FAIL on the first assertion — the button has no `disabled` attribute at any time.

- [x] **Step 3: Drive the state from `showTournamentPair`**

In `media-viewer.js`, immediately after the two progress/tiers lines (~4522-4523):

```js
        document.getElementById('tournamentProgress').textContent = this.tournament.getProgressText();
        document.getElementById('tournamentTiers').textContent = this.tournament.getTierBreakdownText();
        // Undo is available only when the stack holds a user action (system prunes don't count).
        const undoBtn = document.getElementById('tournamentUndoBtn');
        if (undoBtn) undoBtn.disabled = this.tournament.engine.peekUndoKind() === null;
```

- [x] **Step 4: Use the same predicate in the summary modal**

Replace `media-viewer.js:4796`:

```js
            // Enable only if there's a user action to undo (a prune-only stack is not one).
            undoBtn.disabled = this.tournament.engine?.peekUndoKind() == null;
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "undo button is disabled"`
Expected: PASS (1 passed).

- [x] **Step 6: Run the unit suite and commit**

```bash
npx vitest run --no-file-parallelism
npm run format
npm run lint
git add media-viewer.js tests/e2e/tournament-mode.test.js
git commit -m "feat(g2): drive #tournamentUndoBtn disabled state from peekUndoKind

The in-tournament Undo button was never disabled - only the summary modal's
was, and it keyed off history.length, which counts system prune entries the
user cannot undo. Both now use peekUndoKind() === null, so the affordance
matches what Ctrl+A will actually do.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Mouse-wheel guard

**Files:**
- Modify: `media-viewer.js:2121-2128` (document `wheel` listener)
- Test: `tests/e2e/tournament-mode.test.js` (new test)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new API. Behaviour — `wheel` events never reach `nextMedia`/`previousMedia` while `isTournamentMode` is true.

- [x] **Step 1: Write the failing E2E test**

Append inside the same `test.describe` block:

```js
    test('mouse wheel does not navigate pairs in tournament mode', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        const before = await page.evaluate(() => ({
            index: window.mediaViewer.currentIndex,
            pair: (() => {
                const p = window.mediaViewer.tournament.engine.getCurrentPair();
                return [p.left, p.right].sort();
            })(),
        }));

        // Wheel over the tournament header — empty space, not a .media-wrapper, so the handler
        // would otherwise fall through to nextMedia()/previousMedia(). nextMedia mutates
        // currentIndex synchronously (compare branch: currentIndex += 2), so no wait is needed.
        await page.evaluate(() => {
            const el = document.getElementById('tournamentHeader');
            el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
        });

        const after = await page.evaluate(() => ({
            index: window.mediaViewer.currentIndex,
            pair: (() => {
                const p = window.mediaViewer.tournament.engine.getCurrentPair();
                return [p.left, p.right].sort();
            })(),
        }));

        expect(after).toEqual(before);
        expect(await page.evaluate(() => window.mediaViewer.isTournamentMode)).toBe(true);
    });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "mouse wheel does not navigate"`
Expected: FAIL — `after.index` is `before.index + 2` (the compare-mode branch of `nextMedia`).

- [x] **Step 3: Add the guard**

In `media-viewer.js`, insert immediately after the help-overlay guard inside the `wheel` listener (~line 2127, before the `mediaFiles.length === 0` check):

```js
                // Tournament mode drives pair progression through the Swiss engine — wheel
                // navigation would advance currentIndex and desync the display from the
                // engine's chosen pair. Return before preventDefault, matching the help-overlay
                // guard above. Zoom over media is unaffected: the media elements' own wheel
                // listeners fire in the bubble phase before this document-level handler, which
                // never calls stopPropagation.
                if (this.isTournamentMode) return;
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "mouse wheel does not navigate"`
Expected: PASS (1 passed).

- [x] **Step 5: Verify zoom still works outside tournament mode**

Run: `npx playwright test tests/e2e/ -g "zoom"`
Expected: PASS — no regression in the zoom tests. If no test matches, run the full E2E suite instead (`npx playwright test`) and confirm 54/54.

- [x] **Step 6: Format, lint, and commit**

```bash
npm run format
npm run lint
git add media-viewer.js tests/e2e/tournament-mode.test.js
git commit -m "fix(g2): block wheel navigation in tournament mode

The document wheel handler fell through to nextMedia()/previousMedia() with
no isTournamentMode guard, so scrolling over empty space advanced
currentIndex and desynced the display from the engine's chosen pair. This was
the last remaining leak: tournament mode binds no next/previous keys and the
nav arrows are already CSS-hidden.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Auto-hide tournament chrome

**Files:**
- Modify: `styles.css:2279-2292` (`.tournament-header`), `styles.css:2314-2322` (`.tournament-controls`)
- Modify: `media-viewer.js:2164-2188` (`setupHeaderVisibility` → extract `_setupAutoHide`)
- Modify: `media-viewer.js:4477-4481` (fresh-start entry), `media-viewer.js:4834-4837` (`_enterResumedTournamentUI`), `media-viewer.js:4352-4361` (`exitTournamentMode`)
- Test: `tests/e2e/tournament-mode.test.js` (new `revealTournamentChrome` helper, new test, three existing call sites updated)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces on `MediaViewer`:
  - `_setupAutoHide(el, inZone, { delay = 3000, enabled = () => true }): { show, hide } | null` — wires hidden-by-default reveal for one element.
  - `this.tournamentChrome: Array<{ show, hide }>` — the two tournament elements, revealed on mode entry and hidden on exit.

- [x] **Step 1: Write the failing E2E test and helper**

Add the helper just below `enterAndStartTournament` in `tests/e2e/tournament-mode.test.js`:

```js
/**
 * Tournament chrome auto-hides (G2). Reveal a band by moving the real mouse into it and wait
 * for the `.show` class, so subsequent clicks pass Playwright's actionability checks. Hovering
 * the element itself re-arms its 3s timer, so the click that follows keeps it open.
 */
async function revealTournamentChrome(page, which) {
    const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const y = which === 'top' ? 30 : size.height - 30;
    await page.mouse.move(Math.round(size.width / 2), Math.round(y));
    const id = which === 'top' ? '#tournamentHeader' : '#tournamentControls';
    await expect(page.locator(id)).toHaveClass(/\bshow\b/);
}

/** Computed opacity of an element, as a number. Class presence alone is not visibility. */
function chromeOpacity(page, id) {
    return page.evaluate((sel) => Number(getComputedStyle(document.querySelector(sel)).opacity), id);
}
```

And append this test inside the `test.describe` block:

```js
    test('tournament chrome hides at rest and reveals on its edge band', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        // Park the pointer mid-screen so neither band is active, and let the entry reveal's
        // 3s timer expire (the chrome is shown once on entry so the exit button is findable).
        const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        await page.mouse.move(Math.round(size.width / 2), Math.round(size.height / 2));
        await expect(page.locator('#tournamentHeader')).not.toHaveClass(/\bshow\b/, { timeout: 6000 });

        // Computed opacity, not just the class.
        await expect.poll(() => chromeOpacity(page, '#tournamentHeader')).toBe(0);
        await expect.poll(() => chromeOpacity(page, '#tournamentControls')).toBe(0);

        await revealTournamentChrome(page, 'top');
        await expect.poll(() => chromeOpacity(page, '#tournamentHeader')).toBe(1);

        await revealTournamentChrome(page, 'bottom');
        await expect.poll(() => chromeOpacity(page, '#tournamentControls')).toBe(1);
    });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "tournament chrome hides at rest"`
Expected: FAIL at the first `not.toHaveClass(/show/)` … actually at the `chromeOpacity(...)).toBe(0)` poll — the chrome is currently always `opacity: 1`.

- [x] **Step 3: Add the CSS**

In `styles.css`, replace the `.tournament-header` rule (lines 2279-2292):

```css
.tournament-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.65);
    color: white;
    font-size: 13px;
    gap: 16px;
    /* Push below the main app header (.header is position: fixed, min-height ~50px) so
       the hover-revealed menu doesn't cover the tournament progress + pause button. */
    margin-top: 56px;
    /* Auto-hide, mirroring .header: hidden at rest to maximise viewing area, revealed by the
       top edge band (see _setupAutoHide) or by hovering the bar once it is up. The parent
       .tournament-overlay is pointer-events: none, so `auto` lives in the .show rule. */
    opacity: 0;
    transition: opacity var(--transition-slow);
    pointer-events: none;
}
.tournament-header:hover,
.tournament-header.show {
    opacity: 1;
    pointer-events: auto;
}
```

And replace the `.tournament-controls` rule (lines 2314-2322):

```css
.tournament-controls {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    /* Auto-hide on the bottom edge band — see .tournament-header above. */
    opacity: 0;
    transition: opacity var(--transition-slow);
    pointer-events: none;
}
.tournament-controls:hover,
.tournament-controls.show {
    opacity: 1;
    pointer-events: auto;
}
```

- [x] **Step 4: Extract the reveal helper and wire all three elements**

In `media-viewer.js`, replace `setupHeaderVisibility` (lines 2164-2188) with:

```js
    // Shared auto-hide wiring. `el` is hidden by default (CSS opacity: 0) and revealed by the
    // `show` class — while the pointer is inside `inZone(e)`, or while it is over `el` itself —
    // then hidden `delay` ms after the pointer leaves. `enabled()` gates the zone check so
    // tournament chrome ignores mouse movement outside tournament mode.
    _setupAutoHide(el, inZone, { delay = 3000, enabled = () => true } = {}) {
        if (!el) return null;
        let timeout;
        const show = () => {
            el.classList.add('show');
            clearTimeout(timeout);
            timeout = setTimeout(() => el.classList.remove('show'), delay);
        };
        const hide = () => {
            clearTimeout(timeout);
            el.classList.remove('show');
        };
        el.addEventListener('mouseenter', show);
        el.addEventListener('mouseleave', hide);
        document.addEventListener('mousemove', (e) => {
            if (enabled() && inZone(e)) show();
        });
        return { show, hide };
    }

    setupHeaderVisibility() {
        this._setupAutoHide(this.header, (e) => e.clientY < 50);

        // Tournament chrome (G2): hidden at rest to maximise viewing area. The top band spans
        // the main header AND the tournament bar (which sits at margin-top: 56px), so one
        // upward motion reveals both; the bottom band reveals the shared Undo / Both Win /
        // Both Lose row.
        const inTournament = () => this.isTournamentMode;
        this.tournamentChrome = [
            this._setupAutoHide(document.getElementById('tournamentHeader'), (e) => e.clientY < 110, {
                enabled: inTournament,
            }),
            this._setupAutoHide(
                document.getElementById('tournamentControls'),
                (e) => e.clientY > window.innerHeight - 110,
                { enabled: inTournament }
            ),
        ].filter(Boolean);
    }
```

- [x] **Step 5: Reveal on entry, hide on exit**

In the fresh-start path (`showTournamentConfigModal`'s start handler, ~line 4480), after the overlay is shown:

```js
                document.getElementById('tournamentOverlay').style.display = 'block';
                // Reveal the chrome once on entry (the 3s timer then hides it) so the pause /
                // exit affordance and the shared buttons announce themselves before hiding.
                this.tournamentChrome?.forEach((c) => c.show());
                await this.showTournamentPair();
```

In `_enterResumedTournamentUI` (~line 4837), after the same overlay line:

```js
        document.getElementById('tournamentOverlay').style.display = 'block';
        this.tournamentChrome?.forEach((c) => c.show());
```

In `exitTournamentMode` (~line 4355), after hiding the overlay:

```js
        const overlay = document.getElementById('tournamentOverlay');
        if (overlay) overlay.style.display = 'none';
        this.tournamentChrome?.forEach((c) => c.hide()); // drop .show + clear pending timers
```

- [x] **Step 6: Update the three existing E2E call sites the auto-hide breaks**

`.tournament-controls` and `.tournament-header` are now `pointer-events: none` at rest, so a plain `.click()` times out on the hit-target check and a `{ force: true }` click lands on whatever is beneath.

At `tests/e2e/tournament-mode.test.js:101`, in *Both Win button records a win-win draw*:

```js
        await revealTournamentChrome(page, 'bottom');
        await page.locator('#tournamentBothWinBtn').click();
```

At `tests/e2e/tournament-mode.test.js:198-203`, in *exit button in the tournament header opens the leave prompt*:

```js
        // The exit affordance lives in the auto-hiding tournament header: reveal it, then assert
        // it is genuinely visible (computed opacity — Playwright's toBeVisible ignores opacity).
        await revealTournamentChrome(page, 'top');
        await expect(page.locator('#tournamentExitBtn')).toBeVisible();
        expect(await chromeOpacity(page, '#tournamentHeader')).toBe(1);

        // Clicking it routes through switchMode('single') → the incomplete-tournament
        // leave prompt (Save & leave / Discard / Cancel).
        await page.locator('#tournamentExitBtn').click();
```

- [x] **Step 7: Run the tournament E2E file**

Run: `npx playwright test tests/e2e/tournament-mode.test.js`
Expected: PASS — all tests in the file, including the three updated ones.

- [x] **Step 8: Run the full E2E suite (nothing else should regress)**

Run: `npx playwright test`
Expected: PASS — 55/55 (52 baseline + Task 3 + Task 4 + this task).

- [x] **Step 9: Run the unit suite, format, lint, and commit**

```bash
npx vitest run --no-file-parallelism
npm run format
npm run lint
git add styles.css media-viewer.js tests/e2e/tournament-mode.test.js
git commit -m "feat(g2): auto-hide tournament header and shared controls

The tournament bar and the shared Undo / Both Win / Both Lose row were
permanently on screen, eating viewing area. Both now mirror .header: hidden
at rest, revealed by an edge band or by hovering once up, hidden 3s after the
pointer leaves. The top band spans the main header and the tournament bar
(margin-top: 56px) so one upward motion reveals both.

setupHeaderVisibility's body is extracted into _setupAutoHide and reused for
all three elements; .header's effective behaviour is unchanged. Both are
revealed once on tournament entry so the PR #58 exit affordance stays
discoverable, and hidden on exit.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Documentation propagation

**Files:**
- Modify: `CLAUDE.md:190`, `CLAUDE.md:191`

**Interfaces:**
- Consumes: the behaviour established by Tasks 1-5.
- Produces: no code. Both stale gotchas corrected in place (not annotated — CLAUDE.md is a live doc).

- [x] **Step 1: Sweep the repo for stale references**

Run each and read every hit, including comments and tests — the unit-only pre-commit hook catches none of these (root cause of the PR #56 follow-ups):

```bash
git grep -n "trackUndo"
git grep -n "handleTournamentUndo"
git grep -n "actionType === 'special'"
git grep -n "moveHistory" -- '*.js'
```

Expected live hits after Tasks 1-5: `tournament-engine.js` (definition + comment), `media-viewer.js` (the special-move call site + `handleTournamentUndo` + `handleCancel`'s single/compare branches, which are unchanged and still correct), `tests/tournament-engine.test.js`, `tests/media-viewer-utils.test.js`, `CLAUDE.md:190-191`. Anything else asserting that tournament undo reads `moveHistory`, or that the special path is `trackUndo: false`, is stale — fix it.

- [x] **Step 2: Correct the `handleTournamentUndo` gotcha**

Replace `CLAUDE.md:190` in full:

```markdown
- `handleTournamentUndo` dispatches off **`engine.history`, the single chronological undo stack** — never `moveHistory` (that peek was the G2 bug: picks don't write to `moveHistory` and it's cleared only on folder change, so any special move, even one made in single mode, hijacked every tournament undo). `engine.peekUndoEntry()` returns the newest **user** entry, skipping system `prune` entries; `kind` is `'pick'` (recordResult/recordDraw), `'special'` (a tournament-mode special-folder move, `meta` = the moveHistory entry, opaque to the engine) or `'prune'` (the `-1` auto-prune, absorbed by `undoUserAction()` so it never costs a press). The special branch restores the file on disk **first** and only then calls `undoUserAction()` — a failed `moveFile` is a clean no-op, not a compensating push-back.
```

- [x] **Step 3: Correct the `engine.files` vs `strategy.files` gotcha**

Replace `CLAUDE.md:191` in full:

```markdown
- `engine.files` vs `strategy.files` **diverge after an untracked `removeFile()`** — `engine.files` is authoritative for `getTierBreakdown()`/`handleApply()`. Both the `-1` auto-prune and the special-move removal now pass `{trackUndo: true}` (kinds `'prune'` and `'special'`), so each records a strategy snapshot + `filesSnapshot` and `undo()` restores `files`/`winCounts`/`byes`/`roundQueue` in full — the O(1) inverse-delta of prior picks cannot resurrect a removed file's strategy state on its own. Undo-past-a-removal is therefore safe, and a restored special file re-pairs and reports its real tier instead of being stranded at Tier-0.
```

- [x] **Step 4: Verify CLAUDE.md still passes the structure test**

Run: `npx vitest run tests/backlog-structure.test.js --no-file-parallelism`
Expected: PASS (2 tests). Then confirm CLAUDE.md is still under the ~200-line durable-rules ceiling:

```bash
wc -l CLAUDE.md
```
Expected: no growth beyond the current count (both edits replace lines 1-for-1).

- [x] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(g2): correct two CLAUDE.md gotchas the undo rework falsifies

The handleTournamentUndo 'two paths / manually restores engine.files' bullet
and the 'special-move removal is deliberately left trackUndo:false' bullet
both described pre-G2 behaviour. Corrected in place - CLAUDE.md is a live doc,
so it gets fixed rather than annotated with a superseded note.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (before opening the PR)

- [x] **Full unit suite**: `npx vitest run --no-file-parallelism` → 487 passing (471 baseline + 10 engine + 6 renderer).
- [x] **Full E2E suite**: `npx playwright test` → 55/55.
- [x] **Lint**: `npm run lint` → 0 errors.
- [x] **Format check**: `npm run format:check` → clean.
- [x] **Diff review**: `git diff main...HEAD --stat` — expect only `tournament-engine.js`, `media-viewer.js`, `styles.css`, the two unit test files, the E2E file, `CLAUDE.md`, and the spec.
- [x] **Confirm no state-format drift**: `git diff main...HEAD -- tournament-engine.js | grep -n "version"` → no hits (spec constraint: persisted state stays `version: 2`).

## Manual smoke (user-side, gates checkoff)

These cannot be E2E-fixtured — the reported bug needs a real special-folder configured (F1 → Settings).

1. Single mode → special-move a file (`1`) → enter Tournament → 3 picks → Ctrl+A ×4. Expect: the three picks reverse newest-first, **then** the special file is restored — in that order.
2. Ctrl+A on a freshly started tournament → "Nothing to undo" toast, `Undo` button greyed out.
3. Save & leave → re-enter → Ctrl+A → "Nothing to undo" (expected per spec D5, not a bug).
4. Undo a tournament special move, then keep playing — the restored file must appear in later pairs and land in its real tier on Apply (not Tier-0).
5. Scroll the wheel over empty space mid-tournament → the pair does not change. Scroll over an image → it still zooms.
6. Chrome hidden at rest; top band reveals header + bar together; bottom band reveals the buttons; each hides ~3s after the pointer leaves; both appear once on entry.
