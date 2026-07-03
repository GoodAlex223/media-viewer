# CW-T Tournament Correctness, Persistence & Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Status:** ✅ **Complete** — implemented 2026-07-01→02 on branch `fix/cw-t-tournament-hardening` (8 code commits: `987d9e3` T1, `115539e` T2, `7040b75` T3, `5127dc9` T4, `a988caa` T5, `aa61cdb` T6, `8a472d9` final-review fix, `256726f` persistent perf log). Subagent-driven: every per-task review Approved; final whole-branch review (opus) "Ready to merge: Yes" after catching **2 cross-cutting fast-path bugs** (shared-JXL-URL revoke blanking a side; duplicate error handler) — both **fixed in-branch** (`8a472d9`) + re-reviewed clean. **Real-24k manual smoke PASSED** (both HIGH bugs confirmed fixed: resume no freeze, picks/Both-Win instant, add-media+AI-sort→enter renders a pair). 404→408 unit, lint 0, tournament E2E 6/6. **PR pending user go.** A persistent `media-viewer-perf.log` was added post-smoke so real-run `[perf]` timings survive quit. Two diagnoses deviated from the spec's stated hypotheses and were corrected during implementation: (1) bug #1's root cause was the live-engine fast-path skipping reconciliation (not the sort reorder); (2) the inverse-delta keeps `filesSnapshot` on every entry to preserve the tested `engine.files`-rewind-across-`removeFile` contract.

**Goal:** Fix the 2 HIGH-severity tournament bugs (cannot-enter-after-add-media + 24k freeze) and sweep 6 adjacent tournament debt items on one branch (`fix/cw-t-tournament-hardening`).

**Architecture:** (1) Bug #1 — reconcile the engine's file-set against `mediaFiles` on **every** tournament entry (closing the live-engine fast-path gap) + harden the `-1` branch + log divergence. (2) Bug #2 — replace the O(n)-per-pick `strategy.serialize()` undo snapshot with an O(1) inverse-delta (snapshot only at round boundaries), and add a tournament fast-path render that reuses the compare wrappers instead of teardown/rebuild; add phase instrumentation. (3) Six mechanical 🟤 debt items. Verification gates on a real-24k manual smoke (not E2E-fixturable).

**Tech Stack:** Vanilla JS (ES modules in `tournament-engine.js`/`tournament.js`, browser globals in `media-viewer.js`), Vitest unit tests, Playwright E2E, Electron IPC.

**Spec:** [docs/superpowers/specs/2026-07-01-cw-t-tournament-correctness-hardening-design.md](../specs/2026-07-01-cw-t-tournament-correctness-hardening-design.md)

## Global Constraints

- **No change** to Swiss pairing *quality*, tier assignment, apply/move logic, or the resume/continue/leave UX flows — only *how* undo is captured, *how fast* pairs render, and defensive reconciliation.
- **Undo equivalence:** the inverse-delta path must be behaviorally equivalent to the snapshot path for a pick streak. **`engine.files` rewind across a mid-tournament `removeFile` MUST stay intact** — the existing test `tests/tournament-engine.test.js` "undo restores engine.files removed between picks" (~109-132) is a regression guard and must stay green untouched.
- **Render fast-path is tournament-scoped** — do NOT change compare mode's `showCompareMedia` behavior for non-tournament use.
- **Backward compat:** `deserialize` still accepts v1 + v2; undo records are in-memory only (never persisted).
- **Vitest v4 single-file gotcha:** run one file by *substring* — `npx vitest run tournament-engine` (NOT the full path).
- **Renderer extract-method tests:** methods tested via `extractMethod`/`extractAsyncMethod` in `tests/media-viewer-utils.test.js`; the mock `this` must supply every `this.*` touched; assert `globalThis.window.electronAPI`, never bare `window`.
- **Pre-commit hook** runs secret-scan → lint-staged (ESLint --fix + Prettier) → `npx vitest run` (all unit tests pass). E2E is NOT run by the hook. Keep the suite green at every commit.
- **Commit convention:** conventional-commit subjects; end each body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Prettier:** tabWidth=4, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always.

---

## File structure

- `tournament.js` — Task 1 (`reconcileWithFiles` helper + `handleResumeReconciled` refactor), Task 4 (`handleDiscard` retry).
- `tournament-engine.js` — Task 2 (`SwissStrategy.captureUndo`/`applyUndo`; engine `recordResult`/`recordDraw`/`undo`).
- `media-viewer.js` — Task 1 (`_enterResumedTournamentUI` reconcile + `showTournamentPair` `-1` hardening/log), Task 3 (`showTournamentPairFast`/`_swapTournamentSide` + `_logSlowPhase`), Task 4 (moveToSpecialFolder comment, unsubscribe field, close re-entrancy guard), Task 5 (`getMediaIndex` micro-opt).
- `index.html` — Task 6 (aria-label).
- Tests: `tests/tournament-manager.test.js` (T1, T4), `tests/tournament-engine.test.js` (T2, T5), `tests/swiss-strategy.test.js` (T5), `tests/e2e/tournament-mode.test.js` (T6).

---

## Task 1: Bug #1 — reconcile on all entry paths + harden `-1` + divergence log

**Files:**
- Modify: `tournament.js` — add `reconcileWithFiles`; refactor `handleResumeReconciled` (~104-115)
- Modify: `media-viewer.js` — `_enterResumedTournamentUI` (~4669-4678); `showTournamentPair` (~4448-4474)
- Test: `tests/tournament-manager.test.js`

**Interfaces:**
- Produces: `TournamentManager.reconcileWithFiles(currentFiles: string[]) → number` — prunes `engine.files` to `∩ currentFiles`, schedules a persist if anything changed, returns the removed count. `0` when there is no engine. Idempotent.

- [x] **Step 1: Write the failing `reconcileWithFiles` tests**

Append to `tests/tournament-manager.test.js`:

```javascript
describe('TournamentManager.reconcileWithFiles', () => {
    it('prunes engine files absent from currentFiles and returns the count', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();

        const removed = tm.reconcileWithFiles(['a.jpg', 'b.jpg']); // c,d gone from disk
        expect(removed).toBe(2);
        expect(tm.engine.files).toEqual(['a.jpg', 'b.jpg']);
        tm.cancelPending();
    });

    it('ignores files added since start (returns 0, engine unchanged)', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();

        const removed = tm.reconcileWithFiles(['a.jpg', 'b.jpg', 'e.jpg', 'f.jpg']);
        expect(removed).toBe(0);
        expect(tm.engine.files).toEqual(['a.jpg', 'b.jpg']);
    });

    it('returns 0 when there is no engine', () => {
        const tm = new TournamentManager(makeHost([]));
        expect(tm.reconcileWithFiles(['a.jpg'])).toBe(0);
    });

    it('is idempotent — a second call removes nothing more', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();

        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg'])).toBe(2);
        tm.cancelPending();
        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg'])).toBe(0);
        tm.cancelPending();
    });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tournament-manager`
Expected: FAIL — `tm.reconcileWithFiles is not a function`.

- [x] **Step 3: Add `reconcileWithFiles` and refactor `handleResumeReconciled`**

In `tournament.js`, replace `handleResumeReconciled` (~104-115) with:

```javascript
    // Prune the live engine's file-set to only files still present in `currentFiles` (paths).
    // Idempotent — safe to call on every tournament entry. Files added to the folder since the
    // tournament started are ignored (they don't join an in-progress bracket). Schedules a
    // debounced persist if anything changed. Returns the number of files removed.
    reconcileWithFiles(currentFiles) {
        if (!this.engine) return 0;
        const currentSet = new Set(currentFiles);
        const removed = this.engine.files.filter((f) => !currentSet.has(f));
        for (const f of removed) {
            this.engine.removeFile(f);
        }
        if (removed.length > 0) {
            this._schedulePersist(this.host.baseFolderPath);
        }
        return removed.length;
    }

    // Resume despite a file-set delta (strict validation failed): rebuild from the tournament's
    // ORIGINAL file set, then reconcile away files that no longer exist on disk. Files added to
    // the folder since the tournament started are simply ignored. Returns { ok, removedCount }.
    async handleResumeReconciled(state, currentFiles) {
        this.engine = TournamentEngine.deserialize(state, state.files);
        const removedCount = this.reconcileWithFiles(currentFiles);
        return { ok: true, removedCount };
    }
```

- [x] **Step 4: Run to verify it passes (incl. existing reconcile tests)**

Run: `npx vitest run tournament-manager`
Expected: PASS — new `reconcileWithFiles` tests + the existing `handleResumeReconciled` tests (unchanged behavior).

- [x] **Step 5: Reconcile on the resumed-UI path (covers the live-engine fast-path gap)**

In `media-viewer.js`, replace `_enterResumedTournamentUI` (~4669-4678) with:

```javascript
    // Shared UI setup for entering a resumed tournament.
    async _enterResumedTournamentUI() {
        this.isTournamentMode = true;
        this.mediaContainer.classList.add('tournament-mode');
        this.setSortControlsVisible(false);
        document.getElementById('tournamentOverlay').style.display = 'block';
        document.querySelectorAll('.mode-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === 'tournament');
        });
        // Defensive reconciliation: guarantees every engine pair resolves to a present index.
        // The disk-resume path already reconciled in handleResumeReconciled; this ALSO covers
        // the live-engine fast-path (enterTournamentMode ~4149, which skips reconciliation) and
        // is idempotent on the disk path. Root fix for "cannot enter after add-media + AI sort".
        this.tournament.reconcileWithFiles(this.mediaFiles.map((f) => f.path));
        await this.showTournamentPair();
    }
```

- [x] **Step 6: Harden the `-1` branch with a bounded retry + divergence log**

In `media-viewer.js`, change the `showTournamentPair` signature (~4448) and replace the `-1` branch (~4468-4474):

```javascript
    async showTournamentPair(_pruneDepth = 0) {
```

Replace lines ~4468-4474:

```javascript
        if (leftIdx === -1 || rightIdx === -1) {
            const missing = leftIdx === -1 ? pair.left : pair.right;
            // Capture net: unreachable after reconcileWithFiles (see _enterResumedTournamentUI).
            // If it still fires, the engine/mediaFiles diverged — log the shape so a real 24k
            // repro is diagnosable in media-viewer.log, then prune + retry (bounded).
            const absent = this.tournament.engine.files.filter((f) => this.getMediaIndex(f) === -1).length;
            window.electronAPI.logError?.(
                `Tournament divergence: pair file absent from mediaFiles. ` +
                    `engineFiles=${this.tournament.engine.files.length} mediaFiles=${this.mediaFiles.length} ` +
                    `absentEngineFiles=${absent} ` +
                    `sorted=${this.isSortedByPrediction || this.isSortedBySimilarity} sample=${missing}`
            );
            this.showNotification(`File missing — removed from tournament: ${missing}`, 'warning');
            this.tournament.engine.removeFile(missing);
            this.tournament._schedulePersist(this.baseFolderPath);
            // Bound the retry: each retry removes exactly one engine file, so recursion is
            // naturally bounded by the engine size; the depth cap is belt-and-suspenders against
            // an engine that can never resolve a present pair (fall to the summary instead).
            if (_pruneDepth > this.mediaFiles.length + 1) {
                this.showTournamentSummaryModal();
                return;
            }
            return this.showTournamentPair(_pruneDepth + 1);
        }
```

- [x] **Step 7: Run lint + full suite and commit**

Run: `npm run lint && npx vitest run`
Expected: clean lint; PASS (389 baseline + 4 new reconcile tests).

```bash
git add tournament.js media-viewer.js tests/tournament-manager.test.js
git commit -m "$(cat <<'EOF'
fix(tournament): reconcile engine file-set on every entry + harden -1 branch

Bug #1 (cannot enter after add-media + AI sort): the live-engine fast-path in
enterTournamentMode skipped reconciliation, so engine.files could diverge from
mediaFiles and showTournamentPair's getMediaIndex returned -1. Extract
reconcileWithFiles() and call it in _enterResumedTournamentUI (covers both the
disk-resume and live-engine paths, idempotent). Harden the -1 branch with a
bounded retry + a structured divergence log so any residual 24k trigger is
captured in media-viewer.log.

Subsumes the [2026-06-25] handleResumeReconciled + showTournamentPair
missing-file durability items.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Bug #2 Part A — O(1) inverse-delta undo

**Files:**
- Modify: `tournament-engine.js` — add `SwissStrategy.captureUndo`/`applyUndo`; rewrite engine `recordResult` (~325-342), `recordDraw` (~344-362), `undo` (~364-373)
- Test: `tests/tournament-engine.test.js` (update the mock strategy + 2 existing assertions; add new real-strategy tests)

**Interfaces:**
- Produces: `SwissStrategy.captureUndo() → { kind: 'snapshot', strategyStateSnapshot } | { kind: 'delta', pair: [a,b] }` — a snapshot when the current pick empties the round (`roundQueue.length <= 1`), else a compact delta. `SwissStrategy.applyUndo(record)` reverses it (the engine augments a delta with `winner` for a result or `outcome` for a draw).
- Engine `history` entries now carry `undo` (the augmented record) + `filesSnapshot` (unchanged); `engine.undo()` calls `strategy.applyUndo(entry.undo)`.

- [x] **Step 1: Update the mock strategy + the two snapshot-coupled tests**

In `tests/tournament-engine.test.js`, inside `makeMockStrategy` (the returned `mock` object ~10-39), add two methods immediately after the `serialize` line (mind the trailing commas):

```javascript
        serialize: vi.fn(() => ({ idx, removed: Array.from(removed) })),
        captureUndo: vi.fn(() => ({ kind: 'delta', pair: pairSequence[idx] ? [...pairSequence[idx]] : [] })),
        applyUndo: vi.fn(() => {
            idx = Math.max(0, idx - 1);
        }),
```

Replace the ENTIRE "recordResult appends to history with a snapshot" test (~70-81) with:

```javascript
    it('recordResult appends to history with an undo record', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock);
        eng.getCurrentPair();
        eng.recordResult('a.jpg', 'b.jpg');

        expect(mock.recordResult).toHaveBeenCalledWith('a.jpg', 'b.jpg');
        expect(eng.history.length).toBe(1);
        expect(eng.history[0].winner).toBe('a.jpg');
        expect(eng.history[0].loser).toBe('b.jpg');
        expect(eng.history[0].undo).toBeTruthy();
        expect(eng.history[0].undo.winner).toBe('a.jpg');
    });
```

Replace the ENTIRE "pops the last history entry and restores strategy state" test (~84-100) with:

```javascript
    it('pops the last history entry and calls the strategy applyUndo', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock);
        eng.getCurrentPair();
        eng.recordResult('a.jpg', 'b.jpg');
        expect(eng.history.length).toBe(1);

        const entry = eng.history[0];
        eng.undo();

        expect(eng.history.length).toBe(0);
        expect(mock.applyUndo).toHaveBeenCalledWith(entry.undo);
    });
```

In the `recordDraw` block, the "pushes a draw history entry with outcome and a snapshot" test (~245-259) asserts the removed top-level field at ~255. Change that one line:

```javascript
        expect(eng.history[0].undo).toBeTruthy();
```
(from `expect(eng.history[0].strategyStateSnapshot).toBeTruthy();` — this is a 2-file/rounds:1 draw, so the pick empties the round → `undo.kind === 'snapshot'`. The two behavioral draw-undo tests below it, ~261 and ~280, pass unchanged.)

- [x] **Step 2: Run to verify the two updated tests now fail against the old engine**

Run: `npx vitest run tournament-engine`
Expected: FAIL — the old `recordResult`/`undo` still write `strategyStateSnapshot` and call `StrategyCtor.deserialize`, so `eng.history[0].undo` is `undefined` and `mock.applyUndo` is never called (both new assertions fail). Engine is updated in Steps 3-4.

- [x] **Step 3: Add `captureUndo`/`applyUndo` to `SwissStrategy`**

In `tournament-engine.js`, add these two methods to `SwissStrategy` (e.g. just after `serialize`/`deserialize`, ~307):

```javascript
    // Capture a cheap undo token for the pick ABOUT to be recorded (call before
    // recordResult/recordDraw mutates). Returns a full snapshot when this pick empties the
    // round (so undo can also rewind the subsequent non-deterministic round rebuild), else a
    // compact inverse-delta holding just the current pair. The engine augments a delta with
    // `winner` (result) or `outcome` (draw) before storing it.
    captureUndo() {
        if (this.roundQueue.length <= 1) {
            return { kind: 'snapshot', strategyStateSnapshot: this.serialize() };
        }
        return { kind: 'delta', pair: [...this.roundQueue[0]] };
    }

    // Reverse a pick from a captureUndo() record (augmented by the engine).
    applyUndo(record) {
        if (record.kind === 'snapshot') {
            const restored = SwissStrategy.deserialize(record.strategyStateSnapshot);
            Object.assign(this, restored);
            return;
        }
        const [a, b] = record.pair;
        this.roundQueue.unshift([a, b]);
        this.playedPairs.delete(this._pairKey(a, b));
        this.gamesPlayed--;
        if (record.winner !== undefined) {
            // result: the winner gained one win
            this.winCounts.set(record.winner, (this.winCounts.get(record.winner) ?? 0) - 1);
        } else if (record.outcome === 'win') {
            // draw 'win': both files gained a win
            this.winCounts.set(a, (this.winCounts.get(a) ?? 0) - 1);
            this.winCounts.set(b, (this.winCounts.get(b) ?? 0) - 1);
        }
        // draw 'lose': neither gained a win → nothing to decrement
    }
```

- [x] **Step 4: Rewrite engine `recordResult`, `recordDraw`, `undo`**

In `tournament-engine.js`, replace `recordResult` (~325-342), `recordDraw` (~344-362), and `undo` (~364-373) with:

```javascript
    recordResult(winner, loser) {
        const undo = this.strategy.captureUndo();
        undo.winner = winner; // augment a delta; ignored by applyUndo for a snapshot
        const progressBefore = this.strategy.getProgress();
        this.strategy.recordResult(winner, loser);
        this.history.push({
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
        if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();
    }

    recordDraw(a, b, outcome) {
        const undo = this.strategy.captureUndo();
        undo.outcome = outcome; // augment a delta; ignored by applyUndo for a snapshot
        const progressBefore = this.strategy.getProgress();
        this.strategy.recordDraw(a, b, outcome);
        this.history.push({
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
        if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();
    }

    undo() {
        if (this.history.length === 0) return;
        const entry = this.history.pop();
        this.strategy.applyUndo(entry.undo);
        if (entry.filesSnapshot) {
            this.files = [...entry.filesSnapshot];
        }
    }
```

- [x] **Step 5: Run to verify the updated mock tests pass**

Run: `npx vitest run tournament-engine`
Expected: PASS — including the existing removeFile+undo `engine.files`-rewind test (~109-132), which must stay green.

- [x] **Step 6: Add real-strategy inverse-delta correctness tests**

Append to `tests/tournament-engine.test.js`:

```javascript
describe('TournamentEngine inverse-delta undo (real SwissStrategy)', () => {
    it('a non-boundary pick is stored as a delta and undo restores the exact pair + win counts', () => {
        // 6 files → round 1 has 3 pairs; the first pick leaves the queue non-empty (delta).
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const p = eng.getCurrentPair();
        eng.recordResult(p.left, p.right);
        expect(eng.history[0].undo.kind).toBe('delta');
        expect(eng.strategy.winCounts.get(p.left)).toBe(1);
        expect(eng.strategy.gamesPlayed).toBe(1);

        eng.undo();
        const again = eng.getCurrentPair();
        expect([again.left, again.right].sort()).toEqual([p.left, p.right].sort());
        expect(eng.strategy.winCounts.get(p.left)).toBe(0);
        expect(eng.strategy.gamesPlayed).toBe(0);
        expect(eng.history.length).toBe(0);
    });

    it('the pick that empties a round is stored as a snapshot', () => {
        // 2 files → round 1 has exactly 1 pair; the only pick empties the round (snapshot).
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), { rounds: 3 });
        const p = eng.getCurrentPair();
        eng.recordResult(p.left, p.right);
        expect(eng.history[0].undo.kind).toBe('snapshot');
    });

    it('undoing a draw-win delta decrements both files', () => {
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const p = eng.getCurrentPair();
        eng.recordDraw(p.left, p.right, 'win');
        expect(eng.strategy.winCounts.get(p.left)).toBe(1);
        expect(eng.strategy.winCounts.get(p.right)).toBe(1);
        eng.undo();
        expect(eng.strategy.winCounts.get(p.left)).toBe(0);
        expect(eng.strategy.winCounts.get(p.right)).toBe(0);
        expect(eng.strategy.gamesPlayed).toBe(0);
    });

    it('undoing a draw-lose delta leaves win counts unchanged', () => {
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const p = eng.getCurrentPair();
        eng.recordDraw(p.left, p.right, 'lose');
        expect(eng.strategy.winCounts.get(p.left)).toBe(0);
        eng.undo();
        expect(eng.strategy.winCounts.get(p.left)).toBe(0);
        expect(eng.strategy.gamesPlayed).toBe(0);
    });

    it('a streak of picks undone in reverse returns to the initial state (delta ≡ snapshot)', () => {
        const files = Array.from({ length: 8 }, (_, i) => `f${i}.jpg`);
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        const picks = [];
        for (let i = 0; i < 3; i++) {
            const p = eng.getCurrentPair();
            picks.push([p.left, p.right].sort());
            eng.recordResult(p.left, p.right);
        }
        for (let i = 2; i >= 0; i--) {
            eng.undo();
            const p = eng.getCurrentPair();
            expect([p.left, p.right].sort()).toEqual(picks[i]);
        }
        expect(eng.strategy.gamesPlayed).toBe(0);
        for (const f of files) expect(eng.strategy.winCounts.get(f)).toBe(0);
    });
});
```

- [x] **Step 7: Run the tournament suites, then lint + full suite, and commit**

Run: `npx vitest run tournament` (engine + swiss-strategy + manager + flow integration)
Expected: PASS.

Run: `npm run lint && npx vitest run`
Expected: clean; PASS.

```bash
git add tournament-engine.js tests/tournament-engine.test.js
git commit -m "$(cat <<'EOF'
perf(tournament): O(1) inverse-delta undo (snapshot only at round boundaries)

recordResult/recordDraw captured a full strategy.serialize() every pick — O(n)
at 24k (winCounts + files + playedPairs + roundQueue copies), up to 100 retained.
Replace with a cheap inverse-delta for non-boundary picks (unshift pair, decrement
winCounts, delete playedKey, gamesPlayed--); snapshot only when the pick empties
the round (rare). filesSnapshot is kept every pick (cheap array-of-refs) so the
engine.files rewind-across-removeFile contract stays intact.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Bug #2 Part B + C — tournament fast-path render + instrumentation

**Files:**
- Modify: `media-viewer.js` — add `showTournamentPairFast`, `_swapTournamentSide`, `_logSlowPhase`; route `showTournamentPair` (~4497-4499) through the fast-path; instrument resume + per-pair.

> **Verification note:** these are renderer DOM methods, not unit-tested in this project (consistent with the P2 plan and the existing `showCompareMedia`). Verification is: `npm run lint` clean + the existing tournament E2E green + the regression-checker agent + the **24k manual smoke**. Each step is an implementation step; the test gate is the E2E + smoke at the end.

**Interfaces:**
- Consumes: existing `cleanupCompareMedia`, `setupCompareImageHandlers`, `setupCompareVideoHandlers`, `pathToFileURL`, `isJxl`, `decodeJxl`, `jxlFrameToObjectURL`, `resetZoom`, `updateBulkRateButtonsVisibility`, `updateCompareFileInfo`, `updateNavigationInfo`, `removeFileFromList`.
- Produces: `showTournamentPairFast(leftFile, rightFile)`, `_swapTournamentSide(side, file)`, `_logSlowPhase(label, startMs)`.

- [x] **Step 1: Add the instrumentation helper**

In `media-viewer.js`, add near the other small helpers (e.g. just above `showTournamentPair`):

```javascript
    // Fire-and-forget phase timing for the 24k smoke. Logs only slow phases so the log isn't
    // spammed on small folders. Reads the main-process log at app.getPath('logs')/media-viewer.log.
    _logSlowPhase(label, startMs) {
        const ms = performance.now() - startMs;
        if (ms > 100) {
            window.electronAPI.logError?.(`[perf] ${label}: ${Math.round(ms)}ms`);
        }
    }
```

- [x] **Step 2: Add the fast-path render + per-side swap**

In `media-viewer.js`, add these two methods (e.g. just after `showTournamentPair`):

```javascript
    // Fast per-pair render for tournament mode: reuse the existing compare wrappers + overlay
    // controls, swapping only the inner media element. Avoids showCompareMedia's full teardown
    // (.remove() + 50ms reflow grace + 2× checkFileExists IPC + 2× lucide.createIcons), which
    // makes pair changes sluggish at 24k. Falls back to showCompareMedia for the first pair
    // (no wrappers yet). Both sides re-render atomically (shared-_jxlObjectURLs invariant).
    async showTournamentPairFast(leftFile, rightFile) {
        if (!this.leftMediaWrapper || !this.rightMediaWrapper) {
            this._restoredPairFiles = { left: leftFile, right: rightFile };
            await this.showCompareMedia();
            return;
        }
        const t0 = performance.now();
        this.resetZoom('left');
        this.resetZoom('right');
        this.compareLeftFile = leftFile;
        this.compareRightFile = rightFile;
        this.updateBulkRateButtonsVisibility();
        await Promise.all([
            this._swapTournamentSide('left', leftFile),
            this._swapTournamentSide('right', rightFile),
        ]);
        this.updateCompareFileInfo(leftFile, rightFile);
        this.updateNavigationInfo();
        this._logSlowPhase('tournament pair render (fast)', t0);
    }

    // Swap one side's media element in place, keeping the wrapper + overlay controls. A missing
    // or undecodable file is purged (mirrors showCompareMedia) and the engine pair re-rendered.
    async _swapTournamentSide(side, file) {
        const wrapper = side === 'left' ? this.leftMediaWrapper : this.rightMediaWrapper;
        await this.cleanupCompareMedia(side); // revokes prior object URLs, pauses/detaches media
        const prev = side === 'left' ? this.leftMedia : this.rightMedia;
        if (prev && prev.parentNode) prev.remove();

        let media;
        const fileUrl = this.pathToFileURL(file.path);
        if (file.type.startsWith('image/')) {
            media = document.createElement('img');
            if (this.isJxl(file.path)) {
                try {
                    const decoded = await this.decodeJxl(file.path);
                    if (!decoded.frames || decoded.frames.length === 0) {
                        throw new Error('JXL decoded with no frames');
                    }
                    media.src = this.jxlFrameToObjectURL(decoded.frames[0]);
                } catch (err) {
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.showNotification('Skipping undecodable JXL file', 'warning');
                    this.removeFileFromList(file.path);
                    return this.showTournamentPair(); // re-render the (now different) engine pair
                }
            } else {
                media.src = fileUrl;
            }
            this.setupCompareImageHandlers(media, file, side);
        } else if (file.type.startsWith('video/')) {
            media = document.createElement('video');
            media.src = fileUrl;
            media.autoplay = true;
            media.loop = true;
            media.muted = false;
            media.controls = true;
            media.volume = parseFloat(this.volumeSlider.value);
            media.preload = 'metadata';
            this.setupCompareVideoHandlers(media, file, side);
        }
        media.className = 'media-display';
        media.style.display = 'none';
        // Insert as the FIRST child so it sits behind the persistent overlay controls.
        wrapper.insertBefore(media, wrapper.firstChild);
        if (side === 'left') this.leftMedia = media;
        else this.rightMedia = media;
    }
```

- [x] **Step 3: Route `showTournamentPair` through the fast-path**

In `media-viewer.js`, replace the tail of `showTournamentPair` (~4493-4499) with:

```javascript
        this.leftFileIndex = leftIdx;
        this.rightFileIndex = rightIdx;
        // Fast-path render reuses the compare wrappers (see showTournamentPairFast); the first
        // pair (no wrappers yet) falls back to showCompareMedia via _restoredPairFiles.
        await this.showTournamentPairFast(this.mediaFiles[leftIdx], this.mediaFiles[rightIdx]);
```

(The `_restoredPairFiles` assignment moves into `showTournamentPairFast`'s fallback branch; remove the old `this._restoredPairFiles = {...}` + `showCompareMedia` lines here.)

- [x] **Step 4: Verify the missing-file error path in the fast-path**

Read `setupCompareImageHandlers` and `setupCompareVideoHandlers`. Confirm each attaches an `error` handler that removes the file / retries (so a mid-session external deletion — no longer caught by the skipped `checkFileExists` — is handled). If neither attaches an error→remove path, add one to the fast-path media element:

```javascript
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

- [x] **Step 5: Instrument the resume path**

In `media-viewer.js` `enterTournamentMode` (~4145), wrap the state read + prompt with timing. Change the `if (state)` block (~4161-4166):

```javascript
        if (state) {
            const currentFiles = this.mediaFiles.map((f) => f.path);
            this.showTournamentContinuePrompt(state, currentFiles);
        } else {
            this.showTournamentConfigModal();
        }
```
to add a timing marker around the read (place `const _tResume = performance.now();` right after the `try` that reads state, and call `this._logSlowPhase('tournament resume read', _tResume);` right before `showTournamentContinuePrompt`). Concretely, replace ~4154-4163:

```javascript
        let state = null;
        const _tResume = performance.now();
        try {
            const result = await window.electronAPI.readTournamentState(this.baseFolderPath);
            if (result.success && result.state) state = result.state;
        } catch (err) {
            window.electronAPI.logError?.(`Tournament state read failed: ${err.message}`);
        }
        if (state) {
            this._logSlowPhase('tournament state read+parse', _tResume);
            const currentFiles = this.mediaFiles.map((f) => f.path);
            this.showTournamentContinuePrompt(state, currentFiles);
        } else {
            this.showTournamentConfigModal();
        }
```

- [x] **Step 6: Lint + full unit suite + tournament E2E**

Run: `npm run lint && npx vitest run`
Expected: clean; PASS (no unit regressions — render methods aren't unit-tested).

Run: `npx playwright test tournament-mode`
Expected: PASS — pick→next-pair (fast-path), Both Win/Lose, Ctrl+A undo, leave-Save→resume all green. (If Playwright can't launch in this environment, note it and defer to the manual smoke.)

- [x] **Step 7: Commit**

```bash
git add media-viewer.js
git commit -m "$(cat <<'EOF'
perf(tournament): fast-path pair render reusing compare wrappers + instrumentation

showCompareMedia tore down + rebuilt both wrappers per pair (.remove() + a fixed
50ms reflow grace + 2× checkFileExists IPC + 2× lucide.createIcons) — sluggish at
24k. showTournamentPairFast reuses the wrappers + overlay controls and swaps only
the inner media element; the first pair still builds via showCompareMedia. Add
_logSlowPhase timing on resume + per-pair so the 24k smoke surfaces any residual
hotspot in media-viewer.log.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 🟤 Leave-flow & persistence hardening

**Files:**
- Modify: `media-viewer.js` — `moveToSpecialFolder` comment (~1555); `setupEventListeners` unsubscribe (~1974-1977); `handleAppCloseRequest` re-entrancy (~4228-4239)
- Modify: `tournament.js` — `handleDiscard` retry (~75-79)
- Test: `tests/tournament-manager.test.js`

- [x] **Step 1: Write the failing `handleDiscard` retry test**

Append to the existing `describe('TournamentManager.handleDiscard', ...)` block in `tests/tournament-manager.test.js`:

```javascript
    it('retries the state delete once when the first delete fails', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);
        const del = globalThis.window.electronAPI.deleteTournamentState;
        del.mockReset();
        del.mockResolvedValueOnce({ success: false, error: 'EBUSY' }).mockResolvedValueOnce({ success: true });

        await tm.handleDiscard();
        expect(del).toHaveBeenCalledTimes(2);
        expect(tm.engine).toBeNull();
    });
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tournament-manager`
Expected: FAIL — `deleteTournamentState` called once (no retry yet).

- [x] **Step 3: Add the retry to `handleDiscard`**

In `tournament.js`, replace `handleDiscard` (~75-79):

```javascript
    async handleDiscard() {
        this.cancelPending(); // don't let a queued write recreate the file after delete
        this.engine = null;
        const res = await window.electronAPI.deleteTournamentState(this.host.baseFolderPath);
        if (res && res.success === false) {
            // Retry once — a transient IO/lock failure shouldn't orphan .tournament_state.json
            // and re-prompt resume next time. If it still fails, log (best-effort) and move on.
            const retry = await window.electronAPI.deleteTournamentState(this.host.baseFolderPath);
            if (retry && retry.success === false) {
                window.electronAPI?.logError?.(
                    'Tournament discard: state delete failed twice: ' + (retry.error ?? 'unknown')
                );
            }
        }
    }
```

- [x] **Step 4: Run to verify it passes (incl. the existing discard test)**

Run: `npx vitest run tournament-manager`
Expected: PASS — new retry test + the existing "clears engine and deletes state file" (mock defaults to `{success:true}` → one call, no retry).

- [x] **Step 5: Fix the `moveToSpecialFolder` stale comment**

In `media-viewer.js` (~1555-1559), replace the comment:

```javascript
            // Tournament mode: also drop the moved file from the engine. The state write is
            // debounced (non-blocking) — a crash before it lands is self-healing, since the file
            // is gone from disk and resume reconciliation prunes it anyway.
            if (this.isTournamentMode && this.tournament.engine) {
                this.tournament.engine.removeFile(fileToMove.path);
                this.tournament._schedulePersist(this.baseFolderPath);
            }
```

- [x] **Step 6: Store the `onAppCloseRequested` unsubscribe fn**

In `media-viewer.js` (~1974-1977), replace:

```javascript
        // App-close confirm: main asks before quitting with a tournament in progress. Store the
        // unsubscribe fn (per the CLAUDE.md IPC-listener gotcha). The listener is app-lifetime,
        // so this is for teardown symmetry / test cleanup rather than a live leak in normal use.
        if (window.electronAPI.onAppCloseRequested) {
            this._removeAppCloseListener = window.electronAPI.onAppCloseRequested(() =>
                this.handleAppCloseRequest()
            );
        }
```

- [x] **Step 7: Add the close-confirm re-entrancy guard**

In `media-viewer.js`, replace `handleAppCloseRequest` (~4228-4239):

```javascript
    handleAppCloseRequest() {
        try {
            // Re-entrancy guard: if a leave/resume prompt is already open, a 2nd close request
            // must not re-bind its continuation. The modal's display state is the source of
            // truth — cleanup() resets it to 'none' on every exit path (Save/Discard/Cancel).
            const leaveModal = document.getElementById('tournamentResumeModal');
            if (leaveModal && leaveModal.style.display === 'flex') {
                return;
            }
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

- [x] **Step 8: Lint + full suite and commit**

Run: `npm run lint && npx vitest run`
Expected: clean; PASS.

```bash
git add media-viewer.js tournament.js tests/tournament-manager.test.js
git commit -m "$(cat <<'EOF'
fix(tournament): leave-flow & persistence hardening (4 debt items)

- handleDiscard retries the state delete once on failure (no orphaned
  .tournament_state.json re-prompting resume).
- moveToSpecialFolder: correct the stale "persist before navigation" comment to
  match the intentional debounced schedule.
- setupEventListeners: store the onAppCloseRequested unsubscribe fn (CLAUDE.md
  IPC-listener gotcha).
- handleAppCloseRequest: re-entrancy guard so a 2nd close request doesn't re-bind
  the leave-prompt continuation.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 🟤 `getMediaIndex` micro-opt + SwissStrategy / undo-cap test pins

**Files:**
- Modify: `media-viewer.js` — `getMediaIndex` (~1099)
- Test: `tests/tournament-engine.test.js` (undo-cap pins), `tests/swiss-strategy.test.js` (pairing pins)

- [x] **Step 1: `getMediaIndex` single-lookup micro-opt**

In `media-viewer.js`, replace the return (~1099):

```javascript
        const idx = this._mediaPathIndex.get(path);
        return idx === undefined ? -1 : idx;
```

Run: `npx vitest run media-viewer-utils`
Expected: PASS — the existing `getMediaIndex` present/absent/rebuild tests still hold (`get()` returns `undefined` for absent, a number for present including `0`).

- [x] **Step 2: Add undo-cap boundary + recordDraw-cap pins**

Append to `tests/tournament-engine.test.js`:

```javascript
describe('TournamentEngine undo-history cap pins', () => {
    it('undo still works at the cap boundary (most recent pick is reversible)', () => {
        const files = Array.from({ length: 250 }, (_, i) => `f${i}.jpg`);
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        let recorded = 0;
        while (recorded < 105) {
            const pair = eng.getCurrentPair();
            if (!pair) break;
            eng.recordResult(pair.left, pair.right);
            recorded++;
        }
        expect(eng.history.length).toBe(100); // capped
        const lastWinner = eng.history[eng.history.length - 1].winner;
        const winsBefore = eng.strategy.winCounts.get(lastWinner);
        eng.undo();
        expect(eng.history.length).toBe(99);
        expect(eng.strategy.winCounts.get(lastWinner)).toBe(winsBefore - 1);
    });

    it('recordDraw is also capped at 100 entries', () => {
        const files = Array.from({ length: 250 }, (_, i) => `f${i}.jpg`);
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        let recorded = 0;
        while (recorded < 101) {
            const pair = eng.getCurrentPair();
            if (!pair) break;
            eng.recordDraw(pair.left, pair.right, recorded % 2 === 0 ? 'win' : 'lose');
            recorded++;
        }
        expect(recorded).toBe(101);
        expect(eng.history.length).toBe(100);
    });
});
```

- [x] **Step 3: Add SwissStrategy round-2 pairing invariant pins**

Append to `tests/swiss-strategy.test.js`:

```javascript
describe('SwissStrategy round-2 pairing invariants', () => {
    function playOutRound(s) {
        while (s.roundQueue.length > 0) {
            const [x, y] = s.roundQueue[0];
            s.recordResult(x, y); // left always wins → deterministic win buckets
        }
    }

    it('round 2 cross-bucket carry-over: no self-pairs, every queued pair is distinct files', () => {
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const s = new SwissStrategy();
        s.init(files, { rounds: 3 });
        playOutRound(s);
        const next = s.getNextPair(); // builds round 2
        expect(next).not.toBeNull();
        for (const [x, y] of s.roundQueue) {
            expect(x).not.toBe(y);
        }
    });

    it("don't-double-bye: a file byed in round 1 is not byed again in round 2 (5 files)", () => {
        // 5 files → exactly one bye per round; the round-1 bye must rotate to a different file.
        for (let trial = 0; trial < 20; trial++) {
            const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'];
            const s = new SwissStrategy();
            s.init(files, { rounds: 2 });
            const round1Bye = [...s.byes][0];
            expect(round1Bye).toBeTruthy();
            playOutRound(s);
            s.getNextPair(); // builds round 2 (awards the round-2 bye)
            const round2Bye = [...s.byes].filter((f) => f !== round1Bye);
            // A new (different) file received the round-2 bye — the round-1 bye was not doubled.
            expect(s.byes.has(round1Bye)).toBe(true);
            expect([...s.byes].length).toBeGreaterThanOrEqual(2);
            expect(round2Bye.length).toBeGreaterThanOrEqual(1);
        }
    });
});
```

- [x] **Step 4: Run the affected suites, then lint + full suite, and commit**

Run: `npx vitest run tournament-engine && npx vitest run swiss-strategy && npx vitest run media-viewer-utils`
Expected: PASS.

Run: `npm run lint && npx vitest run`
Expected: clean; PASS.

```bash
git add media-viewer.js tests/tournament-engine.test.js tests/swiss-strategy.test.js
git commit -m "$(cat <<'EOF'
refactor(tournament): getMediaIndex single-lookup + undo-cap / SwissStrategy pins

getMediaIndex: has()+get() → one get() (idx === undefined ? -1 : idx). Add
regression pins: undo at the 100-cap boundary, recordDraw cap, round-2
cross-bucket carry-over (no self-pairs), and don't-double-bye rotation.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 🟤 E2E fixes + aria-label

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js` — "Continue resumes" assertion (~248); exit-button precondition (~187-194)
- Modify: `index.html` — `#tournamentExitBtn` aria-label

- [x] **Step 1: Fix the stale "Continue resumes" history assertion**

In `tests/e2e/tournament-mode.test.js` (~247-248), replace:

```javascript
        const historyLen = await page.evaluate(() => window.mediaViewer.tournament.engine.history.length);
        expect(historyLen).toBe(0); // session-only undo (v2): a resumed engine starts with empty history
```

Also update the comment on the line above (~239) if it says "history preserved":

```javascript
        // Continue rebuilds the engine; session-only undo means history starts empty.
```

- [x] **Step 2: Add the exit-button incomplete-tournament precondition**

In `tests/e2e/tournament-mode.test.js`, in the "exit button in the tournament header opens the leave prompt" test (~187), after `await enterAndStartTournament(page, { rounds: 1 });` add:

```javascript
        // Precondition: an incomplete tournament is active (the exit button only makes sense
        // mid-tournament — a rounds:1 2-file tournament is incomplete until the single pick).
        expect(await page.evaluate(() => window.mediaViewer.isTournamentMode)).toBe(true);
```

- [x] **Step 3: Add the `#tournamentExitBtn` aria-label**

In `index.html`, find the `#tournamentExitBtn` element and add `aria-label="Pause / leave tournament"`:

```html
<button id="tournamentExitBtn" class="tournament-exit-btn" aria-label="Pause / leave tournament" title="Pause / leave tournament">
```

(Preserve the existing attributes/classes/icon markup; only add `aria-label` if absent. Read the current element first to match its exact shape.)

- [x] **Step 4: Run E2E (if the environment allows) + lint, and commit**

Run: `npx playwright test tournament-mode`
Expected: PASS — "Continue resumes" now asserts `0`; exit-button test asserts the precondition. (If Playwright can't launch here, note it; the assertions are verified by reading + the next real E2E run.)

Run: `npm run lint`
Expected: clean.

```bash
git add tests/e2e/tournament-mode.test.js index.html
git commit -m "$(cat <<'EOF'
test(tournament): fix stale Continue-resumes assertion + exit precondition + aria

- tournament-mode E2E: a resumed v2 engine starts with empty history → expect 0
  (was 1, stale since the history-free session-only-undo change).
- Assert isTournamentMode===true before the exit-button click (precondition).
- Add aria-label="Pause / leave tournament" to #tournamentExitBtn.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [x] Full unit suite: `npx vitest run` → all green (389 baseline + ~4 reconcile + ~5 inverse-delta + ~1 discard-retry + ~4 cap/swiss pins ≈ **403+**).
- [x] Lint + format: `npm run lint && npm run format:check` → clean.
- [x] Tournament E2E: `npx playwright test tournament-mode` → green (if runnable in the environment; else note deferral to the user's manual E2E).
- [x] Grep for regressions: `npx vitest run` covers `tournament-engine`, `swiss-strategy`, `tournament-manager`, `tournament-flow`, `media-viewer-utils`.
- [x] Regression-checker agent over `media-viewer.js` changes (zoom / fullscreen / compare / extraction state).
- [x] Open the PR.
- [x] **Hand off to the user for the real-24k manual smoke** (the acceptance gate):
  - Resume a saved tournament on the 24k folder → Continue must not freeze.
  - Streak of picks + "Both Win" → each instant, no slowdown as games accumulate.
  - Add media + AI sort → enter tournament → renders a pair (no "file missing"); check `media-viewer.log` for any `Tournament divergence` capture + `[perf]` phase timings.
  - Save & leave → resume; Apply.
  - Confirm a previously-saved (v1) tournament still resumes.

## Acceptance criteria (from spec)

1. Entering/resuming tournament after add-media + AI sort renders a pair (no spurious "file missing"); any real divergence is captured in the log.
2. Pick → next-pair render time is independent of games played at 24k.
3. Resume on 24k completes without a multi-second freeze.
4. Undo behavior is equivalent to pre-change; the `engine.files`-rewind test stays green.
5. All 6 🟤 items closed; the stale E2E assertion is green; new unit pins pass.
6. Full unit suite + lint + format green; tournament E2E green.
7. No regression in non-tournament compare mode.
