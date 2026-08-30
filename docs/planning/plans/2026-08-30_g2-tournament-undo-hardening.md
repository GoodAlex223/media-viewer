# G2 Tournament Undo Hardening — Implementation Plan

**Task Reference**: WEEKLY.md Aug 31–Sep 4 § G2 (🟤, 5 SP) ← BACKLOG 🟤 `### [2026-07-21] PR #65 review follow-ups`
**Created**: 2026-08-30
**Status**: In Progress
**Last Updated**: 2026-08-30

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five gaps that can strand or wedge the unified `engine.history` undo stack introduced by PR #65.

**Architecture:** Two new O(1) engine primitives (`clearHistory`, `dropEntry`) give the renderer and the manager a way out of states the existing snapshot machinery cannot reverse. `reconcileWithFiles` drops the whole session-only stack instead of tracking hundreds of per-file snapshots; a permanently-failing special restore drops its own entry rather than sitting on top forever; a dedicated `_tournamentRenderBusy` flag provides the re-entrancy lock that `isLoading` cannot (it is cleared mid-render by the compare handlers).

**Tech Stack:** Vanilla JS (no bundler), Electron renderer, pure-ESM `tournament-engine.js` / `tournament.js`, Vitest (unit, `extractMethod` pattern).

**Spec:** [docs/superpowers/specs/2026-08-30-g2-tournament-undo-hardening-design.md](../../superpowers/specs/2026-08-30-g2-tournament-undo-hardening-design.md)

## Global Constraints

- Branch: `g2-tournament-undo-hardening`. **No PR** — push only (`git push -u origin g2-tournament-undo-hardening`).
- **Every file change must go through the Edit/Write tools, never Bash heredoc/sed.** WEEKLY names this group the `dead-rules-audit` trial vehicle; the plugin's `PostToolUse` matcher is `Edit|MultiEdit|Write`, so Bash-authored edits are invisible to it and Friday's scorecard would read "compliant" having observed nothing.
- Prettier: tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, bracketSpacing, arrowParens=always, endOfLine=lf.
- New `MediaViewer` methods at **4-space indent** — `extractMethod` matches `^\s{4}<name>\(`; a method at any other indent is untestable by the house pattern.
- Unit baseline: **529 passing / 17 files** (`npx vitest run --no-file-parallelism`, verified 2026-08-30). The pre-commit hook runs the full suite and blocks on failure.
- Constants UPPER_SNAKE_CASE at module scope; functions camelCase verb-first; private renderer helpers `_leadingUnderscore`.
- Mutation-verify every new guard test: temporarily break the implementation, watch the test fail, restore. A guard test that cannot fail looks exactly like one that passes.
- Stage docs by explicit path (editor format-on-save rewrites Markdown).
- Out of scope (spec §7) — file to BACKLOG 🟤 at closeout, do **not** fix here: `moveToSpecialFolder`'s un-awaited `showTournamentPair()` (`media-viewer.js:4830`) and the unguarded render calls at `:1628`, `:4650`, `:5059`; enforcing (rather than documenting) the `exitTournamentMode` invariant; the dead `2025-12-29_video-fullscreen-toggle.md` row in `docs/planning/plans/README.md`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `tournament-engine.js` | Pure-ESM engine + Swiss strategy | Add `clearHistory()` and `dropEntry(entry)` (Task 1) |
| `tournament.js` | TournamentManager — IPC glue, persistence, reconcile | `reconcileWithFiles` drops history + notifies (Task 2) |
| `media-viewer.js` | Renderer (MediaViewer class) | `_tournamentRestoreFailures` + `_dropWedgedSpecialEntry` + restructured catch (Task 3); `_tournamentRenderBusy` ×3 handlers (Task 4); keydown `canUndo` + `exitTournamentMode` comment (Task 5) |
| `tests/tournament-engine.test.js` | Engine unit tests | New describe for `clearHistory`/`dropEntry` (Task 1) |
| `tests/tournament-manager.test.js` | Manager unit tests | New cases in the existing `reconcileWithFiles` describe (Task 2) |
| `tests/media-viewer-utils.test.js` | Extracted-method tests | `makeCtx` gains `_tournamentRestoreFailures`; new cases for Tasks 3–5 |
| `CLAUDE.md` | Durable rules | Split + correct line 192 (Task 5) |

**Key context for whoever implements this:** `media-viewer.js` is ~9,470 lines and has no bundler — it is a
browser-global renderer script. Its methods are unit-tested by *reading the source text*, extracting a
method body by brace-counting, and invoking it against a hand-built mock `this`. That means **every `this.*`
a method touches must exist on the mock ctx**, or the test throws a confusing `TypeError` rather than
failing an assertion. Task 3 depends on this; read its Step 1 carefully.

---

### Task 1: Engine primitives — `clearHistory()` + `dropEntry(entry)`

**Files:**
- Modify: `tournament-engine.js` (inside `class TournamentEngine`, after `removeFile`, ~L474)
- Test: `tests/tournament-engine.test.js` (append a new `describe` at end of file)

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `TournamentEngine.prototype.clearHistory(): number` — empties `this.history`, returns the count dropped. Used by Task 2.
  - `TournamentEngine.prototype.dropEntry(entry: object): boolean` — splices that exact entry out of `this.history` **without reversing it**; returns `true` if found. Used by Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tournament-engine.test.js`. Uses the real `SwissStrategy`, matching the existing
`inverse-delta undo (real SwissStrategy)` describe at L324 — construction idiom
`new TournamentEngine(files, new SwissStrategy(), { rounds: 3 })`.

```javascript
describe('TournamentEngine.clearHistory', () => {
    it('empties the stack and returns the number of entries dropped', () => {
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const p1 = eng.getCurrentPair();
        eng.recordResult(p1.left, p1.right);
        const p2 = eng.getCurrentPair();
        eng.recordResult(p2.left, p2.right);
        expect(eng.history.length).toBe(2);

        expect(eng.clearHistory()).toBe(2);
        expect(eng.history).toEqual([]);
        expect(eng.peekUndoKind()).toBeNull();
    });

    it('returns 0 and stays a no-op on an already-empty stack', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), { rounds: 3 });
        expect(eng.clearHistory()).toBe(0);
        expect(eng.history).toEqual([]);
    });

    it('does NOT reverse the picks it drops — strategy state stands', () => {
        // The whole point: dropping is not undoing. Win counts and gamesPlayed must survive,
        // otherwise a reconcile would silently rewind the tournament.
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const p = eng.getCurrentPair();
        eng.recordResult(p.left, p.right);
        expect(eng.strategy.winCounts.get(p.left)).toBe(1);

        eng.clearHistory();

        expect(eng.strategy.winCounts.get(p.left)).toBe(1);
        expect(eng.strategy.gamesPlayed).toBe(1);
    });
});

describe('TournamentEngine.dropEntry', () => {
    it('removes the entry without reversing it and returns true', () => {
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const p = eng.getCurrentPair();
        eng.recordResult(p.left, p.right);
        eng.removeFile('c.jpg', { trackUndo: true, kind: 'special', meta: { fileName: 'c.jpg' } });
        const special = eng.history[eng.history.length - 1];
        expect(special.kind).toBe('special');
        const winsBefore = eng.strategy.winCounts.get(p.left);

        expect(eng.dropEntry(special)).toBe(true);

        expect(eng.history).not.toContain(special);
        expect(eng.history.length).toBe(1); // the pick survives
        // Not reversed: the file stays removed and the strategy is untouched.
        expect(eng.files).not.toContain('c.jpg');
        expect(eng.strategy.winCounts.get(p.left)).toBe(winsBefore);
    });

    it('returns false for an entry that is not on the stack', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), { rounds: 3 });
        expect(eng.dropEntry({ kind: 'special' })).toBe(false);
        expect(eng.history).toEqual([]);
    });

    it('removes only the given entry when two share a kind', () => {
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        eng.removeFile('c.jpg', { trackUndo: true, kind: 'special', meta: { fileName: 'c.jpg' } });
        eng.removeFile('d.jpg', { trackUndo: true, kind: 'special', meta: { fileName: 'd.jpg' } });
        const [first, second] = eng.history;

        expect(eng.dropEntry(first)).toBe(true);

        expect(eng.history).toEqual([second]);
    });

    it('leaves the newest user entry visible to peekUndoEntry after a drop', () => {
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const p = eng.getCurrentPair();
        eng.recordResult(p.left, p.right);
        eng.removeFile('c.jpg', { trackUndo: true, kind: 'special', meta: { fileName: 'c.jpg' } });
        const special = eng.history[eng.history.length - 1];
        expect(eng.peekUndoEntry()).toBe(special);

        eng.dropEntry(special);

        // The pick beneath is now reachable — this is what un-wedges the stack.
        expect(eng.peekUndoKind()).toBe('pick');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/tournament-engine.test.js --no-file-parallelism
```

Expected: FAIL — `eng.clearHistory is not a function` / `eng.dropEntry is not a function`.

- [ ] **Step 3: Implement both methods**

In `tournament-engine.js`, inside `class TournamentEngine`, immediately **after** the closing brace of
`removeFile(...)` (~L474) and **before** `isComplete()`:

```javascript
    // Discard the entire session-only undo stack in O(1). Used where a bulk mutation would
    // otherwise need one O(n) strategy snapshot per file (reconcileWithFiles' prune can drop
    // hundreds at once on a 24k folder — that would undo the PR #55 perf win). Dropping is NOT
    // undoing: strategy state stands, only the ability to reverse it is given up. Honest
    // outcome: peekUndoKind() -> null, the button disables, Ctrl+A says "Nothing to undo".
    // Returns the number of entries dropped so the caller can decide whether to notify.
    clearHistory() {
        const dropped = this.history.length;
        this.history = [];
        return dropped;
    }

    // Remove ONE entry without reversing it. For a `special` entry whose disk restore is
    // permanently failing: reversing it is impossible (the file is not on disk), and leaving it
    // on top wedges every later undo, since each press retries the same absent path.
    // Returns true if the entry was found and removed.
    dropEntry(entry) {
        const i = this.history.lastIndexOf(entry);
        if (i === -1) return false;
        this.history.splice(i, 1);
        return true;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/tournament-engine.test.js --no-file-parallelism
```

Expected: PASS. Then the full suite — it must be **529 + 7 = 536**:

```bash
npx vitest run --no-file-parallelism
```

- [ ] **Step 5: Mutation-verify the two load-bearing guards**

These two assertions are the ones that would silently rot. Break each, confirm RED, restore:

1. In `clearHistory`, change `return dropped;` to `return 0;` → the "returns the number of entries dropped" case must FAIL. Restore.
2. In `dropEntry`, change `lastIndexOf(entry)` to `findIndex((e) => e.kind === entry.kind)` → "removes only the given entry when two share a kind" must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add tournament-engine.js tests/tournament-engine.test.js
git commit -F <message-file>
```

Message:

```
feat(g2): add engine clearHistory() and dropEntry() undo primitives

Two O(1) primitives for states the snapshot machinery cannot reverse:

- clearHistory() empties the session-only stack and returns the count.
  Used by reconcileWithFiles, where {trackUndo:true} per pruned file
  would push an O(n) strategy.serialize() each and undo the PR #55 24k
  win. Dropping is not undoing: strategy state stands.
- dropEntry(entry) splices one entry out WITHOUT reversing it, for a
  `special` entry whose disk restore is permanently failing.

Neither is wired up yet; call sites land in the next two commits.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 2: `reconcileWithFiles` drops the history and notifies

**Files:**
- Modify: `tournament.js:114-126` (`reconcileWithFiles`)
- Test: `tests/tournament-manager.test.js` (add cases to the existing `describe('TournamentManager.reconcileWithFiles')` at ~L408)

**Interfaces:**
- Consumes: `engine.clearHistory(): number` (Task 1)
- Produces: no signature change. `reconcileWithFiles(currentFiles): number` still returns the **removed-file count** — six existing assertions and `handleResumeReconciled`'s `removedCount` depend on it. The history drop is a side effect, surfaced to the user via `host.showNotification`.

**Why not `{trackUndo: true}`:** the BACKLOG entry's explicit design constraint. A bulk reconcile can prune
hundreds of files; tracking each pushes an O(n) `strategy.serialize()` snapshot, reversing the CW-T/PR #55
24k performance win. The prune loop stays untracked *on purpose*; the stack is dropped once instead.

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('TournamentManager.reconcileWithFiles', ...)` block in
`tests/tournament-manager.test.js`. `makeHost()` (L4) already provides `showNotification: vi.fn()`.
`tm.cancelPending()` drops the debounced persist — the existing cases call it and so must these.

```javascript
    it('drops the session-only undo history when it prunes anything', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        expect(tm.engine.history.length).toBe(1);

        tm.reconcileWithFiles(['a.jpg', 'b.jpg']); // c,d gone from disk
        tm.cancelPending();

        // Untracked removal + a live history would strand a file at Tier-0 on undo-past.
        expect(tm.engine.history).toEqual([]);
        expect(tm.engine.peekUndoKind()).toBeNull();
    });

    it('notifies exactly once when a non-empty history is dropped', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        host.showNotification.mockClear();

        tm.reconcileWithFiles(['a.jpg', 'b.jpg']);
        tm.cancelPending();

        expect(host.showNotification).toHaveBeenCalledTimes(1);
        expect(host.showNotification).toHaveBeenCalledWith(
            expect.stringContaining('undo history cleared'),
            'info'
        );
    });

    it('stays silent when it prunes but the history was already empty', async () => {
        // The disk-resume path: deserialize() sets history = [] (session-only undo), so a
        // reconcile there must not toast about an undo stack the user never had.
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        host.showNotification.mockClear();

        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg'])).toBe(2);
        tm.cancelPending();

        expect(host.showNotification).not.toHaveBeenCalled();
    });

    it('leaves the history intact when it prunes nothing', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        host.showNotification.mockClear();

        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg', 'e.jpg'])).toBe(0);

        expect(tm.engine.history.length).toBe(1);
        expect(host.showNotification).not.toHaveBeenCalled();
    });

    it('singularises the notification for a one-file prune', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        host.showNotification.mockClear();

        tm.reconcileWithFiles(['a.jpg', 'b.jpg']);
        tm.cancelPending();

        expect(host.showNotification).toHaveBeenCalledWith(expect.stringContaining('1 file left'), 'info');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/tournament-manager.test.js --no-file-parallelism
```

Expected: FAIL — history still holds the pick; `showNotification` not called.

- [ ] **Step 3: Implement**

In `tournament.js`, replace the body of the `if (removed.length > 0)` block in `reconcileWithFiles`:

```javascript
        if (removed.length > 0) {
            // The prune loop above stays UNTRACKED on purpose: {trackUndo:true} per file would
            // push an O(n) strategy.serialize() snapshot each, and a bulk reconcile can drop
            // hundreds at once — that is the CW-T/PR #55 24k perf win, undone. Instead drop the
            // whole session-only stack once, in O(1). Undoing PAST an untracked removal would
            // otherwise restore engine.files from a stale filesSnapshot but not strategy state,
            // stranding the file at Tier-0.
            const droppedUndo = this.engine.clearHistory();
            if (droppedUndo > 0) {
                this.host.showNotification(
                    `${removed.length} file${removed.length === 1 ? '' : 's'} left the folder — ` +
                        `tournament undo history cleared`,
                    'info'
                );
            }
            this._schedulePersist(this.host.baseFolderPath);
        }
```

Note: the notification is gated on `droppedUndo > 0`, **not** `removed.length > 0`. On the disk-resume
path `TournamentEngine.deserialize` has already set `history = []` (`tournament-engine.js:525`), so the
count is 0 and nothing fires — silent exactly where the user never had a stack to lose.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/tournament-manager.test.js --no-file-parallelism
npx vitest run --no-file-parallelism
```

Expected: PASS; full suite **536 + 5 = 541**. The six pre-existing `reconcileWithFiles` assertions must
still be green — if any went red, the return shape was changed by mistake.

- [ ] **Step 5: Mutation-verify the gate**

Change `if (droppedUndo > 0)` to `if (removed.length > 0)` → "stays silent when it prunes but the history
was already empty" must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add tournament.js tests/tournament-manager.test.js
git commit -F <message-file>
```

Message:

```
fix(g2): reconcileWithFiles drops the session-only undo history

reconcileWithFiles ran engine.removeFile() untracked on every
tournament-mode entry. Undoing past that point restored engine.files
from a stale filesSnapshot but not strategy state, stranding the
restored file at Tier-0 (CLAUDE.md:192 documented this as open).

The naive fix is wrong: {trackUndo:true} per pruned file pushes an
O(n) strategy.serialize() each, and a bulk reconcile can drop hundreds
at once — that is the CW-T/PR #55 24k win, undone. Drop the whole
session-only stack once instead, in O(1), and tell the user.

The toast is gated on the DROPPED COUNT, not the pruned count: the
disk-resume path deserializes with history already empty, so it stays
silent there. Return shape unchanged (removed-file count).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 3: A failed special-restore cannot wedge the undo stack

**Files:**
- Modify: `media-viewer.js` — constructor (~L69), `handleTournamentUndo` (~L4872-4964), new `_dropWedgedSpecialEntry` helper
- Test: `tests/media-viewer-utils.test.js` — `makeCtx` in `describe('handleTournamentUndo (unified undo stack)')` (~L4534), plus new cases

**Interfaces:**
- Consumes: `engine.dropEntry(entry): boolean` (Task 1)
- Produces:
  - `MediaViewer.prototype._dropWedgedSpecialEntry(entry, move): void` — drops the engine entry **and** its `moveHistory` twin.
  - `this._tournamentRestoreFailures: WeakMap<entry, number>` — per-entry consecutive-failure count.
  - Module constant `TOURNAMENT_RESTORE_MAX_ATTEMPTS = 2`.

> ⚠️ **Read this before writing any test.** The existing test `clears isLoading in finally when the disk
> restore fails mid-flight` (`tests/media-viewer-utils.test.js:4650`) **enters the catch block** you are
> about to change. The new code calls `this._tournamentRestoreFailures.get(pending)`, and the shared
> `makeCtx` factory does not define that field — so that test would die with
> `TypeError: Cannot read properties of undefined (reading 'get')` instead of failing an assertion.
> **Step 1 adds the field to `makeCtx`.** With a fresh `WeakMap` the count goes 0 → 1, which is below the
> threshold, so that test takes the retry branch and its `expect(ctx.showError).toHaveBeenCalled()` stays
> green.

- [ ] **Step 1: Add the missing ctx field, then write the failing tests**

First, in `tests/media-viewer-utils.test.js`, add one line to the `makeCtx` return object inside
`describe('handleTournamentUndo (unified undo stack)')` (~L4534), after `moveHistory: [],`:

```javascript
            _tournamentRestoreFailures: new WeakMap(),
```

`makeCtx`'s `engine` mock also needs the new method — add to the `engine` object literal:

```javascript
            dropEntry: vi.fn(() => true),
```

Then append these cases inside the same describe block:

```javascript
    it('keeps the entry on the stack after ONE restore failure so the user can retry', async () => {
        const pending = { kind: 'special', meta: SPECIAL_META };
        const ctx = makeCtx(pending, { moveHistory: [SPECIAL_META] });
        globalThis.window.electronAPI.moveFile = vi.fn(async () => ({ success: false, error: 'EPERM' }));

        await handleTournamentUndo.call(ctx);

        expect(ctx.tournament.engine.dropEntry).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([SPECIAL_META]); // twin preserved for the retry
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
        expect(ctx.showError).toHaveBeenCalledWith(expect.stringContaining('EPERM'));
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
        expect(ctx._tournamentRestoreFailures.get(pending)).toBe(1);
    });

    it('drops the entry and its moveHistory twin on the SECOND consecutive failure', async () => {
        // Otherwise the dead entry sits on top forever and every later Ctrl+A retries the same
        // absent path, with no way past it — the wedge this task exists to remove.
        const pending = { kind: 'special', meta: SPECIAL_META };
        const ctx = makeCtx(pending, { moveHistory: [SPECIAL_META] });
        globalThis.window.electronAPI.moveFile = vi.fn(async () => ({ success: false, error: 'ENOENT' }));

        await handleTournamentUndo.call(ctx);
        await handleTournamentUndo.call(ctx);

        expect(ctx.tournament.engine.dropEntry).toHaveBeenCalledWith(pending);
        expect(ctx.moveHistory).toEqual([]);
        expect(ctx.showError).toHaveBeenLastCalledWith(expect.stringContaining('c.jpg'));
        // Re-rendered so #tournamentUndoBtn re-reads peekUndoKind() and can disable.
        expect(ctx.showTournamentPair).toHaveBeenCalledTimes(1);
        // Never reversed — the engine entry is discarded, not undone.
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
    });

    it('counts failures per entry, not globally', async () => {
        // A failure against entry A must not push an unrelated entry B over the threshold.
        const first = { kind: 'special', meta: SPECIAL_META };
        const secondMeta = { ...SPECIAL_META, fileName: 'z.jpg', newPath: '/special/z.jpg' };
        const second = { kind: 'special', meta: secondMeta };
        const ctx = makeCtx(first, { moveHistory: [SPECIAL_META, secondMeta] });
        globalThis.window.electronAPI.moveFile = vi.fn(async () => ({ success: false, error: 'EPERM' }));

        await handleTournamentUndo.call(ctx);
        ctx.tournament.engine.peekUndoEntry = vi.fn(() => second);
        await handleTournamentUndo.call(ctx);

        expect(ctx.tournament.engine.dropEntry).not.toHaveBeenCalled();
        expect(ctx._tournamentRestoreFailures.get(first)).toBe(1);
        expect(ctx._tournamentRestoreFailures.get(second)).toBe(1);
    });

    it('clears isLoading before the post-failure re-render', async () => {
        // showTournamentPair must not run with the mutex still held.
        const pending = { kind: 'special', meta: SPECIAL_META };
        const ctx = makeCtx(pending, { moveHistory: [SPECIAL_META] });
        globalThis.window.electronAPI.moveFile = vi.fn(async () => ({ success: false, error: 'ENOENT' }));
        let loadingAtRender = null;
        ctx.showTournamentPair = vi.fn(async () => {
            loadingAtRender = ctx.isLoading;
        });

        await handleTournamentUndo.call(ctx);
        await handleTournamentUndo.call(ctx);

        expect(loadingAtRender).toBe(false);
        expect(ctx.isLoading).toBe(false);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism
```

Expected: FAIL — `dropEntry` never called, `_tournamentRestoreFailures.get(pending)` is `undefined`.

- [ ] **Step 3: Implement**

**3a.** Add the module constant near the other module-scope constants at the top of `media-viewer.js`:

```javascript
// Consecutive failed disk restores of the SAME tournament `special` undo entry before the entry
// is discarded. 1 would let a transient lock (antivirus, network drive) cost the user an undo;
// leaving it forever wedges the stack, since every later press retries the same absent path.
const TOURNAMENT_RESTORE_MAX_ATTEMPTS = 2;
```

**3b.** In the constructor, immediately after `this.isLoading = false;` (~L69):

```javascript
        // Per-entry consecutive failure count for tournament `special` undo restores. WeakMap,
        // not a field on the entry: `meta` is the only renderer-owned field on an engine entry,
        // and this is collected automatically when the entry leaves the stack.
        this._tournamentRestoreFailures = new WeakMap();
```

**3c.** In `handleTournamentUndo`, replace the existing `try { … } catch { … } finally { … }` around the
`moveFile` restore with this. The `catch` no longer returns; the drop and the re-render move **below** the
`finally`, so `showTournamentPair()` cannot run with `isLoading` still set:

```javascript
            let restoreFailed = false;
            let droppedWedged = false;
            this.isLoading = true;
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
                restoreFailed = true;
                console.error('Error undoing tournament special:', error);
                const failures = (this._tournamentRestoreFailures.get(pending) ?? 0) + 1;
                this._tournamentRestoreFailures.set(pending, failures);
                if (failures >= TOURNAMENT_RESTORE_MAX_ATTEMPTS) {
                    droppedWedged = true;
                } else {
                    this.showError(`Failed to undo move: ${error.message}`);
                }
            } finally {
                this.isLoading = false;
            }
            if (restoreFailed) {
                if (droppedWedged) {
                    this._dropWedgedSpecialEntry(pending, move);
                    this.showError(`Couldn't restore ${move.fileName} — skipping this undo`);
                    // Re-render so #tournamentUndoBtn re-reads peekUndoKind() and can disable.
                    await this.showTournamentPair();
                }
                return;
            }
```

**3d.** Add the helper as a `MediaViewer` method at **4-space indent** (required by `extractMethod`),
directly after `handleTournamentUndo`:

```javascript
    // A `special` undo entry whose disk restore keeps failing can never be reversed — the file is
    // not where the entry says it is. Discard both halves so the stack cannot wedge: the engine
    // entry (dropped, NOT undone) and its moveHistory twin, which handleCancel would otherwise
    // re-attempt from single mode. A moveHistory entry we can no longer honour is not worth keeping.
    //
    // Safe because it self-heals: the file stays out of engine.files while entries BENEATH still
    // hold filesSnapshots containing it, so undoing past this point restores a snapshot naming an
    // absent file — and showTournamentPair's -1 auto-prune removes it again, that time with
    // {trackUndo: true}. The divergence closes on the next render instead of persisting.
    _dropWedgedSpecialEntry(entry, move) {
        this.tournament.engine?.dropEntry(entry);
        const moveIdx = this.moveHistory.lastIndexOf(move);
        if (moveIdx !== -1) this.moveHistory.splice(moveIdx, 1);
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism
npx vitest run --no-file-parallelism
```

Expected: PASS; full suite **541 + 4 = 545**. Confirm the pre-existing
`clears isLoading in finally when the disk restore fails mid-flight` is still green — it is the canary for
the ctx-field problem flagged above.

- [ ] **Step 5: Re-read the whole method for the `ae98e85` regression risk**

Open `handleTournamentUndo` end to end and confirm the identity re-check
(`if (this.tournament.engine.peekUndoEntry() !== pending)`) still sits **after** the `finally` and **before**
`undoUserAction()`, unmoved and unmodified. It is the guarantee that undo reverses the entry that was
peeked; the restructure must not have displaced it. The two rollback tests at
`tests/media-viewer-utils.test.js:4683` and `:4708` pin it — both must be green.

- [ ] **Step 6: Mutation-verify**

Change `failures >= TOURNAMENT_RESTORE_MAX_ATTEMPTS` to `failures >= 99` → "drops the entry and its
moveHistory twin on the SECOND consecutive failure" must FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -F <message-file>
```

Message:

```
fix(g2): a failed special-restore no longer wedges the undo stack

A tournament `special` undo entry whose moveFile restore failed hit
showError and returned with the stack untouched, so the dead entry
stayed on top forever and every later Ctrl+A retried the same absent
path — no way to skip it. (The concurrent-mutation variant was closed
in ae98e85; this is the disk-failure variant.)

Count consecutive failures per entry in a WeakMap; on the second,
discard the engine entry via dropEntry() and its moveHistory twin,
then re-render so the undo button re-reads peekUndoKind(). One
failure still retries, so a transient lock does not cost an undo.

The catch no longer returns: the drop and the re-render moved below
the finally, so showTournamentPair() cannot run with isLoading held.
The ae98e85 identity re-check is untouched and still gates
undoUserAction().

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 4: `_tournamentRenderBusy` re-entrancy lock

**Files:**
- Modify: `media-viewer.js` — constructor (~L70), `handleTournamentPick` (~L4838), `handleTournamentDraw` (~L4849), `handleTournamentUndo` (~L4872)
- Test: `tests/media-viewer-utils.test.js` — `describe('tournament isLoading guards (Fix 2)')` (~L3407)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `this._tournamentRenderBusy: boolean` — held for the whole body of each of the three handlers, including the trailing `await this.showTournamentPair()`.

**Why not `isLoading`, which the BACKLOG entry specifies** (spec §2 F1): `showTournamentPair` →
`showTournamentPairFast` attaches `setupCompareLeftHandlers`/`setupCompareRightHandlers`, and those
**clear** `isLoading` on `bothLoaded` (`media-viewer.js:3355-3357`, `:3411-3413`) and on error (`:3374`,
`:3430`, `:3452`, `:3471`). An `isLoading`-based guard is therefore dissolved by the render itself at first
paint, and a second trigger arriving after that passes the entry check. `media-viewer.js:4896-4899` already
documents this ("ADVISORY ONLY — isLoading is not exclusively owned"). The new flag is touched by nobody
but these three handlers.

The existing `isLoading` entry guards **stay**. This adds a lock; it does not replace one.

- [ ] **Step 1: Write the failing tests**

Add to `describe('tournament isLoading guards (Fix 2)', ...)` in `tests/media-viewer-utils.test.js`. Its
`makeCtx` (~L3411) needs no new field — `this._tournamentRenderBusy` reads `undefined` (falsy) on entry,
which is the correct "not busy" state, and the implementation assigns it thereafter.

```javascript
    it('handleTournamentPick refuses to re-enter while a render is in flight', async () => {
        // isLoading cannot do this job: showTournamentPairFast's compare handlers CLEAR it on
        // bothLoaded, so an isLoading-based guard evaporates at first paint (media-viewer.js:3355).
        const ctx = makeCtx();
        let releaseRender;
        ctx.showTournamentPair = vi.fn(
            () =>
                new Promise((resolve) => {
                    releaseRender = resolve;
                })
        );

        const first = handleTournamentPick.call(ctx, 'L', 'R');
        // Simulate exactly what the real render does to the advisory flag mid-flight.
        ctx.isLoading = false;
        await handleTournamentPick.call(ctx, 'L', 'R');

        expect(ctx.tournament.handlePairResult).toHaveBeenCalledTimes(1);
        expect(ctx.showTournamentPair).toHaveBeenCalledTimes(1);

        releaseRender();
        await first;
        expect(ctx._tournamentRenderBusy).toBe(false);
    });

    it('handleTournamentDraw refuses to re-enter while a render is in flight', async () => {
        const ctx = makeCtx();
        let releaseRender;
        ctx.showTournamentPair = vi.fn(
            () =>
                new Promise((resolve) => {
                    releaseRender = resolve;
                })
        );

        const first = handleTournamentDraw.call(ctx, 'win');
        ctx.isLoading = false;
        await handleTournamentDraw.call(ctx, 'win');

        expect(ctx.tournament.handlePairDraw).toHaveBeenCalledTimes(1);

        releaseRender();
        await first;
        expect(ctx._tournamentRenderBusy).toBe(false);
    });

    it('releases the lock when the render throws', async () => {
        // finally must span the trailing await, or one failed render wedges the mode for good.
        const ctx = makeCtx();
        ctx.showTournamentPair = vi.fn(async () => {
            throw new Error('render boom');
        });

        await expect(handleTournamentPick.call(ctx, 'L', 'R')).rejects.toThrow('render boom');

        expect(ctx._tournamentRenderBusy).toBe(false);
        // The lock released, so the next pick is accepted rather than permanently refused.
        ctx.showTournamentPair = vi.fn(async () => {});
        await handleTournamentPick.call(ctx, 'L', 'R');
        expect(ctx.tournament.handlePairResult).toHaveBeenCalledTimes(2);
    });

    it('releases the lock after a normal pick', async () => {
        const ctx = makeCtx();
        await handleTournamentPick.call(ctx, 'L', 'R');
        expect(ctx._tournamentRenderBusy).toBe(false);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism
```

Expected: FAIL — `handlePairResult` called twice (no lock); `_tournamentRenderBusy` is `undefined`.

- [ ] **Step 3: Implement**

**3a.** Constructor, immediately after the `_tournamentRestoreFailures` line added in Task 3:

```javascript
        // Re-entrancy lock for the tournament handler family. NOT isLoading: showTournamentPairFast's
        // setupCompare*Handlers clear that flag on bothLoaded/onError (media-viewer.js ~3355/~3411), so
        // an isLoading-based guard dissolves at first paint and a second trigger renders concurrently.
        // Nothing outside handleTournamentPick/Draw/Undo touches this one.
        this._tournamentRenderBusy = false;
```

**3b.** `handleTournamentPick` — wrap the body, keeping the existing `isLoading` entry guard:

```javascript
    async handleTournamentPick(winner, loser) {
        if (!this.isTournamentMode || this.isLoading) return;
        if (this._tournamentRenderBusy) return;
        this._tournamentRenderBusy = true;
        try {
            this.signalUserActivity();
            try {
                await this.tournament.handlePairResult(winner, loser);
            } catch (err) {
                window.electronAPI.logError('Tournament pick failed: ' + (err && err.message ? err.message : err));
            }
            await this.showTournamentPair();
        } finally {
            this._tournamentRenderBusy = false;
        }
    }
```

**3c.** `handleTournamentDraw` — same shape. The `if (!pair) return;` early exit now sits inside the `try`,
so the `finally` still releases the lock:

```javascript
    async handleTournamentDraw(outcome) {
        if (!this.isTournamentMode || this.isLoading || !this.tournament.engine) return;
        if (this._tournamentRenderBusy) return;
        this._tournamentRenderBusy = true;
        try {
            this.signalUserActivity();
            const pair = this.tournament.engine.getCurrentPair();
            if (!pair) return;
            try {
                await this.tournament.handlePairDraw(pair.left, pair.right, outcome);
                // Confirmation toast lives INSIDE the try: only show "recorded" after the
                // draw actually persisted. A thrown record (e.g. stale pair) must NOT show a
                // false success toast — it falls to the catch, and showTournamentPair below
                // still advances the UI regardless.
                if (this.showRatingConfirmations) {
                    this.showNotification(
                        outcome === 'win' ? '🤝 Both advance (tie)' : '👎 Both stay (tie)',
                        outcome === 'win' ? 'success' : 'info'
                    );
                }
            } catch (err) {
                window.electronAPI.logError('Tournament draw failed: ' + (err && err.message ? err.message : err));
            }
            await this.showTournamentPair();
        } finally {
            this._tournamentRenderBusy = false;
        }
    }
```

**3d.** `handleTournamentUndo` — add the same two lines after the existing entry guard, wrap the remaining
body in `try { … } finally { this._tournamentRenderBusy = false; }`. The inner
`this.isLoading = true/false` around `moveFile` (Task 3) stays: the two flags are independent and both are
wanted — `isLoading` blocks a concurrent pick/draw/special *during the disk restore*, `_tournamentRenderBusy`
blocks a concurrent render *for the whole handler*.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism
npx vitest run --no-file-parallelism
```

Expected: PASS; full suite **545 + 4 = 549**. All pre-existing cases in
`describe('tournament isLoading guards (Fix 2)')` and
`describe('handleTournamentUndo (unified undo stack)')` must still be green.

- [ ] **Step 5: Mutation-verify**

Delete the `if (this._tournamentRenderBusy) return;` line from `handleTournamentPick` → "handleTournamentPick
refuses to re-enter while a render is in flight" must FAIL. Restore. Then move the
`this._tournamentRenderBusy = false;` assignment out of the `finally` to just after the trailing `await` →
"releases the lock when the render throws" must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -F <message-file>
```

Message:

```
fix(g2): add a real re-entrancy lock to the tournament handlers

handleTournamentPick/Draw/Undo all ended with an unguarded
`await this.showTournamentPair()`, so two rapid triggers could render
concurrently.

The BACKLOG entry specifies reusing the isLoading mutex, but that
cannot hold: showTournamentPairFast attaches setupCompare*Handlers,
which CLEAR isLoading on bothLoaded (media-viewer.js:3355, :3411) and
on error (:3374, :3430, :3452, :3471). An isLoading-based guard is
dissolved by the render itself at first paint. media-viewer.js:4896
already documents the flag as advisory and not exclusively owned.

Use a dedicated _tournamentRenderBusy flag instead, held across the
whole handler body including the trailing await and released in a
finally. Existing isLoading entry guards are unchanged — this adds a
lock, it does not replace one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 5: Keydown guard, `exitTournamentMode` invariant, CLAUDE.md

**Files:**
- Modify: `media-viewer.js:2075` (empty-state keydown guard), `media-viewer.js:4517` (`exitTournamentMode` comment)
- Modify: `CLAUDE.md:192` (split + correct)
- Test: `tests/media-viewer-utils.test.js` — new describe for the `canUndo` predicate

**Interfaces:**
- Consumes: `engine.peekUndoKind(): string | null` (pre-existing)
- Produces: nothing consumed by later tasks (final task)

**Repro note (spec §2 F3):** the BACKLOG says a tournament "emptied purely via the `-1` auto-prune" swallows
Ctrl+A, but the `-1` prune fires *because* `getMediaIndex(f) === -1`, i.e. the file is already gone from
`mediaFiles`. An empty `mediaFiles` is the **cause** of the prune, not its effect. The real repro is a live
engine holding picks, a folder whose files vanished externally, `mediaFiles.length === 0` and
`moveHistory.length === 0` — `#tournamentUndoBtn` reads *enabled* (it consults `peekUndoKind()`,
`media-viewer.js:4695`) while the keydown guard gates on `moveHistory.length`. Button and shortcut disagree.

- [ ] **Step 1: Write the failing tests**

The guard lives in an anonymous `document.addEventListener('keydown', …)` callback inside
`setupEventListeners`, which `extractMethod` cannot reach. Test the predicate as a standalone helper —
the same approach `ml-pair-selection.test.js` uses for heavy-DOM logic — and **assert the source text
contains the real expression**, so the replica cannot silently drift from the implementation.

```javascript
describe('empty-state undo guard (canUndo predicate)', () => {
    // Replica of the media-viewer.js:2075 predicate. The source assertion below pins it.
    const canUndo = (ctx) =>
        ctx.moveHistory.length > 0 ||
        (ctx.isTournamentMode && ctx.tournament?.engine?.peekUndoKind() != null);

    const engineWith = (kind) => ({ engine: { peekUndoKind: () => kind } });

    it('allows undo when moveHistory has an entry (pre-existing behaviour)', () => {
        expect(
            canUndo({ moveHistory: [{}], isTournamentMode: false, tournament: { engine: null } })
        ).toBe(true);
    });

    it('allows undo for a tournament whose engine still holds a user entry', () => {
        // The gap: #tournamentUndoBtn reads enabled (it consults peekUndoKind) while the
        // shortcut no-ops, because moveHistory is empty. Button and shortcut disagreed.
        expect(canUndo({ moveHistory: [], isTournamentMode: true, tournament: engineWith('pick') })).toBe(true);
    });

    it('refuses undo when the engine holds nothing undoable', () => {
        expect(canUndo({ moveHistory: [], isTournamentMode: true, tournament: engineWith(null) })).toBe(false);
    });

    it('refuses undo in SINGLE mode even with a live engine history', () => {
        // Load-bearing: executeAction('undo') resolves through the mode-keyed reverse map, so in
        // single mode it calls handleCancel — which must not run against an empty moveHistory
        // just because an exit left tournament.engine non-null (the D-4b invariant hole).
        expect(canUndo({ moveHistory: [], isTournamentMode: false, tournament: engineWith('pick') })).toBe(false);
    });

    it('tolerates a null engine and a missing tournament', () => {
        expect(canUndo({ moveHistory: [], isTournamentMode: true, tournament: { engine: null } })).toBe(false);
        expect(canUndo({ moveHistory: [], isTournamentMode: true, tournament: undefined })).toBe(false);
    });

    it('the replica matches the predicate in media-viewer.js', () => {
        // Guards against the replica drifting from the source it stands in for.
        expect(source).toContain('this.isTournamentMode && this.tournament?.engine?.peekUndoKind() != null');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism
```

Expected: FAIL — only the last case ("the replica matches…"), because `media-viewer.js` still reads
`this.moveHistory.length > 0`. The five predicate cases pass immediately (they exercise the replica). That
is expected and correct: the source assertion is the one doing real work here.

- [ ] **Step 3: Implement the keydown guard**

`media-viewer.js:2075`, replacing `if (action === 'undo' && this.moveHistory.length > 0) {`:

```javascript
                // The undo shortcut must also fire for a tournament whose engine still holds an
                // undoable entry. #tournamentUndoBtn already consults peekUndoKind() (~L4695), so
                // gating the SHORTCUT on moveHistory alone let the button read enabled while
                // Ctrl+A silently no-opped. The isTournamentMode conjunct is load-bearing:
                // executeAction('undo') resolves through the mode-keyed reverse map, so without it
                // a stale engine.history would let a SINGLE-mode Ctrl+A call handleCancel against
                // an empty moveHistory.
                const canUndo =
                    this.moveHistory.length > 0 ||
                    (this.isTournamentMode && this.tournament?.engine?.peekUndoKind() != null);
                if (action === 'undo' && canUndo) {
```

- [ ] **Step 4: Implement the `exitTournamentMode` invariant comment**

`media-viewer.js:4517`, directly above `exitTournamentMode() {`:

```javascript
    // INVARIANT: every exit path that can leave entries in `engine.history` must ALSO null
    // `tournament.engine`. The unified undo stack is session-only and mode-agnostic, so a
    // surviving engine after a mode switch is a cross-mode undo hazard. This method does NOT null
    // it — callers do: loadFolder (both branches of its empty/non-empty split), handleDiscard
    // (tournament.js:77) and handleApply (tournament.js:70).
    //
    // KNOWN HOLE: switchMode skips the leave prompt once engine.isComplete(), reachable via
    // Escape-out-of-summary-modal, and the summary modal's own Undo button calls
    // handleTournamentUndo WITHOUT exiting. The empty-state keydown guard's isTournamentMode
    // conjunct (~L2075) neutralizes the one consequence that matters today. A future exit path
    // that forgets to null the engine would silently reintroduce the hazard.
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/media-viewer-utils.test.js --no-file-parallelism
npx vitest run --no-file-parallelism
```

Expected: PASS; full suite **549 + 6 = 555**.

- [ ] **Step 6: Mutation-verify the source assertion**

Delete the `isTournamentMode &&` conjunct from `media-viewer.js` → "the replica matches the predicate in
media-viewer.js" must FAIL. Restore. (This is the only test that can catch source drift here, so it must be
proven to fire.)

- [ ] **Step 7: Update CLAUDE.md line 192**

Replace the single 964-char bullet at `CLAUDE.md:192` with these two. The current tail — *"a third
`removeFile()` call site … stays untracked, so undo crossing it … can still strand a file at Tier-0"* —
is made **false** by Task 2 and must be rewritten, not merely shortened. A live doc gets corrected.

```markdown
- `engine.files` vs `strategy.files` **diverge after an untracked `removeFile()`** — `engine.files` is authoritative for `getTierBreakdown()`/`handleApply()`. The `-1` auto-prune and the special-move removal pass `{trackUndo: true}` (kinds `'prune'` and `'special'`), recording a strategy snapshot + `filesSnapshot` so `undo()` restores `files`/`winCounts`/`byes`/`roundQueue` in full — the O(1) inverse-delta of prior picks cannot resurrect a removed file's strategy state on its own. A restored special file therefore re-pairs and reports its real tier instead of being stranded at Tier-0.
- The third `removeFile()` call site, `reconcileWithFiles` (`tournament.js`, runs on every tournament-mode entry), stays **untracked by design** and calls `engine.clearHistory()` instead: a bulk reconcile can prune hundreds of files, and one O(n) `strategy.serialize()` snapshot each would undo the PR #55 24k win. Dropping the session-only stack is O(1) and honest — `peekUndoKind()` → null, button disabled, "Nothing to undo" — and the user is told when a non-empty stack is dropped. A `special` entry whose disk restore fails twice is discarded outright (`engine.dropEntry()` + its `moveHistory` twin), so a dead entry cannot wedge the stack; the resulting `engine.files` gap self-heals via the `-1` auto-prune.
```

- [ ] **Step 8: Verify formatting, then commit**

```bash
npx prettier --check media-viewer.js
npm run lint
npx vitest run --no-file-parallelism
```

All three must be clean. Then:

```bash
git add media-viewer.js tests/media-viewer-utils.test.js CLAUDE.md
git commit -F <message-file>
```

Message:

```
fix(g2): empty-state undo guard consults engine.history; doc invariant

Three closing items for the undo-stack hardening group:

- The empty-state keydown guard gated the undo SHORTCUT on
  moveHistory.length while #tournamentUndoBtn consults peekUndoKind(),
  so a tournament with a live engine but an empty moveHistory showed an
  enabled button whose shortcut silently no-opped. The isTournamentMode
  conjunct is load-bearing: executeAction('undo') resolves through the
  mode-keyed reverse map, so without it a stale engine.history would let
  a single-mode Ctrl+A call handleCancel against an empty moveHistory.
- Documented the "every exit that can leave engine.history behind must
  also null tournament.engine" invariant at exitTournamentMode, naming
  switchMode's isComplete() bypass as the known hole.
- CLAUDE.md:192 (964 chars, the file's longest bullet) split in two. Its
  tail asserted the reconcile site "stays untracked ... can still strand
  a file at Tier-0", which this branch makes false — rewritten, not just
  shortened.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

- [ ] **Step 9: Push**

```bash
git push -u origin g2-tournament-undo-hardening
```

The pre-push hook runs the full Playwright E2E suite (these are not docs-only paths). **No PR** — task brief.

---

## Self-Review

Run after the plan is written, before execution.

- **Spec coverage**: §4 D-1 → Task 2 (+ engine method in Task 1); D-2 → Task 3; D-3 → Task 4; D-4a → Task 5 Steps 1–3; D-4b → Task 5 Step 4; D-5 → Task 5 Step 7. §2 F1 → Task 4 rationale + commit message; F2 → Task 5 Step 7 targets line 192; F3 → Task 5 repro note. DEC-1/2/3 → Tasks 4/3/2. No spec section without a task.
- **Type consistency**: `clearHistory()` → `number` and `dropEntry(entry)` → `boolean` are defined in Task 1 and consumed with those exact names in Tasks 2 and 3. `_dropWedgedSpecialEntry(entry, move)` is defined and called in Task 3 only. `TOURNAMENT_RESTORE_MAX_ATTEMPTS` defined in Task 3 Step 3a, used in Step 3c. `_tournamentRestoreFailures` (Task 3) and `_tournamentRenderBusy` (Task 4) are distinct fields with distinct purposes — do not conflate.
- **Placeholder scan**: no TBD/TODO; every code step carries real code; no "similar to Task N".
- **Known cross-task hazard**: Task 3's constructor edit and Task 4's constructor edit are adjacent lines. Task 4 Step 3a says "after the `_tournamentRestoreFailures` line added in Task 3" — if the tasks are executed out of order, place it after `this.isLoading = false;` instead.

---

## 4. Implementation Log

### [2026-08-30] — PHASE: Planning

Spec approved (`d851bf9`). Plan written; baseline 529 unit tests / 17 files verified green. Branch
`g2-tournament-undo-hardening` created off `main` (`1d072e3`) and pushed.

---

## 5. Key Discoveries

_(fill in during execution)_

---

## 6. Future Improvements

_(minimum 2 at closeout; the spec §7 out-of-scope list seeds this)_

---

## 7. Testing

**Unit** — `npx vitest run --no-file-parallelism`. Expected progression: 529 → 536 (T1) → 541 (T2) →
545 (T3) → 549 (T4) → 555 (T5). These are exact per-task case counts, not estimates; a mismatch means a
case was dropped or duplicated, so reconcile before moving on.

**E2E** — no test changes in this group; the pre-push hook runs the full Playwright suite on push.

**Manual smoke** (user-side, after push): start a tournament, make 3 picks, special-move a file, Ctrl+A to
restore it, then leave and re-enter tournament mode after deleting a file from the folder externally —
expect the "undo history cleared" toast and a disabled undo button.
