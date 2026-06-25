# Tournament Large-Folder Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** ✅ Complete — **MERGED 2026-06-25 via PR #55 (merge `51366cb`; branch deleted)**. Implemented 2026-06-24 on branch `feature/tournament-large-folder-perf`. All 7 tasks done; **374 unit tests green** (a post-PR `/code-review` caught a null-folder start-write → fix `8420a7c` + regression test, re-review "No issues found"); final whole-branch review (opus) → "Ready to merge: Yes" (no Critical/Important). **Manual 24k-folder smoke PASSED** (launch / pick→next / Save & leave / resume / Apply — all ✅). Playwright E2E deferred to the manual smoke (E2E never runs remotely; synthetic fixtures can't represent 24k). **Two in-branch fixes supersede the task code below**: Task 3's within-bucket loop was corrected to a full `(i, j)` scan (avoidable-rematch bug, fix `f79f374`), and Task 4's `flush()` was rewritten to loop until quiescent (durability-on-return bug, fix `88ee45f`).

**Goal:** Make tournament mode responsive on large (24 000+ file) folders by decoupling state persistence from the UI, slimming the persisted payload, and removing the O(n²)/O(n) hot-path costs.

**Architecture:** Four engine/manager-layer changes plus two renderer changes and one main-process change. (1) The persisted `.tournament_state.json` payload drops the per-pick history snapshots (session-only undo) and bumps to `version: 2`; (2) in-memory undo history is capped at 100 picks; (3) `_buildRoundPairings` is rewritten to consume bucket entries with markers instead of O(n) array splices; (4) `TournamentManager` writes state on a trailing-edge debounce with a single-flight (latest-wins) guard, exposing `flush()`/`cancelPending()` for exit paths; (5) the renderer maps pair paths→indices through a cached `Map`; (6) the IPC write is made atomic (temp + rename).

**Tech Stack:** Vanilla JS (ES modules in `tournament-engine.js`/`tournament.js`, browser globals in `media-viewer.js`, CommonJS in `main.js`), Vitest unit tests, Electron IPC.

## Global Constraints

- **Spec:** [docs/superpowers/specs/2026-06-24-tournament-large-folder-perf-design.md](../specs/2026-06-24-tournament-large-folder-perf-design.md). Every task implicitly inherits its decisions: **D1 session-only undo** (history not persisted), **D2 undo capped at last 100 picks**, **D3 trailing-edge debounce + single-flight persistence**.
- **No change** to Swiss pairing *quality*, tier assignment, apply/move logic, or the resume/continue/leave UX flows — only *how* state is stored and *how fast* pairs resolve.
- **Backward compatibility:** `deserialize` must accept both `version: 1` (legacy, with `history`) and `version: 2` (slim) state files.
- **Vitest v4 single-file gotcha:** run a single file by **substring**, e.g. `npx vitest run tournament-engine` — NOT `npx vitest run tests/tournament-engine.test.js` ("No test suite found").
- **Renderer extract-method tests:** MediaViewer methods are unit-tested via `extractMethod('name')` / `extractAsyncMethod('name')` in `tests/media-viewer-utils.test.js` (brace-counted source extraction). The mock `this` ctx must supply every `this.*` the method touches. In assertions use `globalThis.window.electronAPI`, never bare `window` (`no-undef` fails the pre-commit hook).
- **Commit convention:** conventional-commit subjects; end each commit message body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Pre-commit hook** runs `node scripts/check-secrets.js` → lint-staged (ESLint --fix + Prettier) → `npx vitest run` (all unit tests must pass). Keep the suite green at every commit.

---

## File-by-file responsibilities

- `tournament-engine.js` — Tasks 1, 2, 3 (serialize/deserialize payload; undo cap; `_buildRoundPairings` rewrite).
- `tournament.js` — Task 4 (debounced single-flight persistence: `_schedulePersist`/`flush`/`cancelPending`; rewire `handlePairResult`/`handlePairDraw`/`handleStartClick`/`handleResumeReconciled`/`handleDiscard`/`handleApply`).
- `media-viewer.js` — Task 1 (continue-prompt read), Task 5 (rewire renderer `_persistState` call sites to `flush`/`_schedulePersist`), Task 6 (cached path→index `Map`).
- `main.js` — Task 7 (atomic `writeTournamentState`).
- Tests: `tests/tournament-engine.test.js`, `tests/swiss-strategy.test.js`, `tests/tournament-manager.test.js`, `tests/integration/tournament-flow.test.js`, `tests/media-viewer-utils.test.js`.

---

## Task 1: Slim, versioned persisted payload (session-only undo)

**Files:**
- Modify: `tournament-engine.js` — `TournamentEngine.serialize()` (~367-378), `TournamentEngine.deserialize()` (~380-396)
- Modify: `media-viewer.js:4206` — `showTournamentContinuePrompt` progress read
- Test: `tests/tournament-engine.test.js` (update serialize/deserialize test ~176-190; add v1 + gamesPlayed tests)
- Test (fix breakage): `tests/tournament-manager.test.js:124`, `tests/integration/tournament-flow.test.js:101`

**Interfaces:**
- Produces: `engine.serialize()` returns `{ version: 2, strategy, files, options, createdAt, lastUpdatedAt, gamesPlayed, strategyState }` — **no `history` key**. `TournamentEngine.deserialize(json, files)` accepts `json.version === 1 || 2`, and the resulting engine always has `history === []`.

- [x] **Step 1: Update the serialize/deserialize roundtrip test to the session-only-undo contract**

In `tests/tournament-engine.test.js`, replace the test body at ~176-190 (`'roundtrip preserves history and strategy state (with SwissStrategy)'`) with:

```javascript
    it('roundtrip preserves strategy state; history is NOT persisted (session-only undo)', () => {
        const eng1 = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });

        for (let i = 0; i < 2; i++) {
            const pair = eng1.getCurrentPair();
            eng1.recordResult(pair.left, pair.right);
        }

        const json = eng1.serialize();
        expect(json.version).toBe(2);
        expect(json.history).toBeUndefined();
        expect(json.gamesPlayed).toBe(eng1.strategy.getProgress().gamesPlayed);

        const eng2 = TournamentEngine.deserialize(json, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);

        expect(eng2.files).toEqual(eng1.files);
        expect(eng2.history).toEqual([]); // session-only undo: history is dropped on (de)serialize
        expect(eng2.strategy.gamesPlayed).toBe(eng1.strategy.gamesPlayed);
    });

    it('deserialize accepts a legacy version:1 payload (with history) and drops the history', () => {
        const eng1 = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });
        const pair = eng1.getCurrentPair();
        eng1.recordResult(pair.left, pair.right);

        // Hand-craft a v1 payload shaped like the pre-slim format.
        const v1 = {
            version: 1,
            strategy: 'swiss',
            files: [...eng1.files],
            options: { rounds: 3 },
            createdAt: eng1.createdAt,
            lastUpdatedAt: 123,
            history: [{ winner: pair.left, loser: pair.right, strategyStateSnapshot: eng1.strategy.serialize() }],
            strategyState: eng1.strategy.serialize(),
        };

        const eng2 = TournamentEngine.deserialize(v1, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        expect(eng2.history).toEqual([]);
        expect(eng2.strategy.gamesPlayed).toBe(1);
    });
```

- [x] **Step 2: Run the engine test to verify the new assertions fail**

Run: `npx vitest run tournament-engine`
Expected: FAIL — `json.version` is `1` (not `2`), `json.history` is defined, and `eng2.history` is non-empty.

- [x] **Step 3: Slim the serialize output and accept v1/v2 in deserialize**

In `tournament-engine.js`, replace `TournamentEngine.serialize()` (~367-378) with:

```javascript
    serialize() {
        return {
            version: 2,
            strategy: this.strategy.constructor.name === 'SwissStrategy' ? 'swiss' : 'unknown',
            files: [...this.files],
            options: { ...(this.strategy.options ?? {}) },
            createdAt: this.createdAt,
            lastUpdatedAt: Date.now(),
            // Session-only undo (D1): history is NOT persisted. Expose gamesPlayed so the
            // resume prompt can show progress without parsing strategyState.
            gamesPlayed: this.strategy.getProgress().gamesPlayed,
            strategyState: this.strategy.serialize(),
        };
    }
```

Replace `TournamentEngine.deserialize()` (~380-396) with:

```javascript
    static deserialize(json, files) {
        if (json.version !== 1 && json.version !== 2) {
            throw new Error(`Unsupported tournament state version: ${json.version}`);
        }
        let strategy;
        if (json.strategy === 'swiss') {
            strategy = SwissStrategy.deserialize(json.strategyState);
        } else {
            throw new Error(`Unknown strategy: ${json.strategy}`);
        }
        const eng = Object.create(TournamentEngine.prototype);
        eng.files = [...files];
        eng.strategy = strategy;
        // Session-only undo (D1): any persisted history (v1) is intentionally dropped.
        eng.history = [];
        eng.createdAt = json.createdAt;
        return eng;
    }
```

- [x] **Step 4: Run the engine test to verify it passes**

Run: `npx vitest run tournament-engine`
Expected: PASS (the two updated/added tests green).

- [x] **Step 5: Fix the two collateral history-persistence assertions**

In `tests/integration/tournament-flow.test.js:101`, change:

```javascript
        expect(eng2.history.length).toBe(eng1.history.length);
```
to:
```javascript
        expect(eng2.history).toEqual([]); // session-only undo: history is not persisted across (de)serialize
```

In `tests/tournament-manager.test.js:124`, change:

```javascript
        expect(tm2.engine.history.length).toBe(1);
```
to:
```javascript
        expect(tm2.engine.history.length).toBe(0); // resumed engine starts with empty undo history (session-only)
```

- [x] **Step 6: Update the continue-prompt progress read**

In `media-viewer.js:4206` (`showTournamentContinuePrompt`), change:

```javascript
        const progress = state.history.length;
```
to:
```javascript
        // v2 payloads carry no history; read gamesPlayed (falls back to strategyState for legacy v1 files).
        const progress = state.gamesPlayed ?? state.strategyState?.gamesPlayed ?? 0;
```

- [x] **Step 7: Run the full suite and commit**

Run: `npx vitest run`
Expected: PASS (357 tests; the engine/integration/manager assertions reflect the slim payload).

```bash
git add tournament-engine.js media-viewer.js tests/tournament-engine.test.js tests/integration/tournament-flow.test.js tests/tournament-manager.test.js
git commit -m "$(cat <<'EOF'
perf(tournament): slim, versioned (v2) persisted state — drop per-pick history

Session-only undo: serialize() no longer writes the O(n·games) history
snapshots; deserialize() accepts v1 (legacy) and v2 and yields an empty undo
history. Persisted .tournament_state.json is now O(n) and constant-size.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Cap in-memory undo history at 100 picks

**Files:**
- Modify: `tournament-engine.js` — top-of-file constant; `recordResult` (~292-308); `recordDraw` (~310-327)
- Test: `tests/tournament-engine.test.js` (new describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: after any sequence of records, `engine.history.length <= UNDO_HISTORY_CAP` (100). The most recent 100 entries are retained (oldest dropped first).

- [x] **Step 1: Write the failing cap test**

Append to `tests/tournament-engine.test.js`:

```javascript
describe('TournamentEngine undo-history cap', () => {
    it('retains at most the most recent 100 picks', () => {
        // 250 files, rounds high enough to keep games flowing past 100.
        const files = Array.from({ length: 250 }, (_, i) => `f${i}.jpg`);
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });

        let recorded = 0;
        while (recorded < 101) {
            const pair = eng.getCurrentPair();
            if (!pair) break;
            eng.recordResult(pair.left, pair.right);
            recorded++;
        }

        expect(recorded).toBe(101);
        expect(eng.history.length).toBe(100); // capped — oldest dropped
    });

    it('undo still works within the cap window', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });
        const pair = eng.getCurrentPair();
        eng.recordResult(pair.left, pair.right);
        expect(eng.history.length).toBe(1);
        eng.undo();
        expect(eng.history.length).toBe(0);
        // same pair is current again
        const again = eng.getCurrentPair();
        expect([again.left, again.right].sort()).toEqual([pair.left, pair.right].sort());
    });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tournament-engine`
Expected: FAIL — `eng.history.length` is `101` (no cap yet).

- [x] **Step 3: Add the cap constant and trim after each push**

Near the top of `tournament-engine.js` (after the file header comment, before `export class SwissStrategy`), add:

```javascript
// Session-only undo is capped to bound RAM on long sessions over large folders.
// Each history entry holds a full O(n) strategy snapshot; 100 × O(n) is the ceiling.
const UNDO_HISTORY_CAP = 100;
```

In `recordResult` (~292-308), after `this.history.push({ ... });` add:

```javascript
        if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();
```

In `recordDraw` (~310-327), after its `this.history.push({ ... });` add the same line:

```javascript
        if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tournament-engine`
Expected: PASS (cap holds at 100; undo still works).

- [x] **Step 5: Run the full suite and commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add tournament-engine.js tests/tournament-engine.test.js
git commit -m "$(cat <<'EOF'
perf(tournament): cap in-memory undo history at 100 picks

Bounds RAM to ~100×O(n) on long sessions over large folders; each snapshot is
O(n) so unbounded growth could exhaust memory at 24k files.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite `_buildRoundPairings` to O(n) (no per-pair splices)

**Files:**
- Modify: `tournament-engine.js` — `SwissStrategy._buildRoundPairings` (~63-138)
- Test: `tests/swiss-strategy.test.js` (new large-N correctness test)

**Interfaces:**
- Produces: identical pairing contract — returns an array of `[a, b]` pairs; awards at most one bye per build (added to `this.byes`, `+1` win); preserves cross-bucket carry-over and the don't-double-bye swap. Selection is equivalent to the previous double-loop heuristic; only the O(n) `splice` removal is replaced by O(1) consumed-markers + a forward `head` pointer.

> **Risk note:** this is the highest-risk change. The rewrite preserves the exact bucket/carry-over/bye structure and the same "first un-played (i,j), else first available rematch" selection — it only changes *how entries are removed* (consumed-markers instead of `splice`). All existing `tests/swiss-strategy.test.js` and `tests/integration/tournament-flow.test.js` invariants must stay green; they are the behavioral guard. Performance at 24k is validated by the user's manual smoke (per spec), not a flaky timing assertion.

- [x] **Step 1: Write a large-N correctness test**

Append to `tests/swiss-strategy.test.js`:

```javascript
describe('SwissStrategy._buildRoundPairings large-N correctness', () => {
    it('even N: round 1 produces N/2 pairs covering every file exactly once, no bye', () => {
        const N = 2000;
        const files = Array.from({ length: N }, (_, i) => `f${i}.jpg`);
        const s = new SwissStrategy();
        s.init(files, { rounds: 3 });

        expect(s.roundQueue.length).toBe(N / 2);
        expect(s.byes.size).toBe(0);

        const seen = new Set();
        for (const [a, b] of s.roundQueue) {
            expect(a).not.toBe(b);
            expect(seen.has(a)).toBe(false);
            expect(seen.has(b)).toBe(false);
            seen.add(a);
            seen.add(b);
        }
        expect(seen.size).toBe(N);
    });

    it('odd N: round 1 awards exactly one bye and covers the rest', () => {
        const N = 1999;
        const files = Array.from({ length: N }, (_, i) => `f${i}.jpg`);
        const s = new SwissStrategy();
        s.init(files, { rounds: 3 });

        expect(s.roundQueue.length).toBe((N - 1) / 2);
        expect(s.byes.size).toBe(1);

        const seen = new Set();
        for (const [a, b] of s.roundQueue) {
            seen.add(a);
            seen.add(b);
        }
        const byeFile = Array.from(s.byes)[0];
        expect(seen.has(byeFile)).toBe(false);
        expect(s.winCounts.get(byeFile)).toBe(1);
        expect(seen.size).toBe(N - 1);
    });
});
```

- [x] **Step 2: Run to confirm it passes against the CURRENT implementation (characterization)**

Run: `npx vitest run swiss-strategy`
Expected: PASS — this captures the contract the rewrite must preserve. (If it fails now, stop and reconcile expectations before rewriting.)

- [x] **Step 3: Rewrite `_buildRoundPairings` with consumed-markers + head pointer**

In `tournament-engine.js`, replace the entire `_buildRoundPairings()` method (~63-138) with:

```javascript
    _buildRoundPairings() {
        // Group files by current win count
        const buckets = new Map();
        for (const file of this.files) {
            const wins = this.winCounts.get(file) ?? 0;
            if (!buckets.has(wins)) buckets.set(wins, []);
            buckets.get(wins).push(file);
        }

        // Process buckets from highest win count down
        const sortedWinCounts = Array.from(buckets.keys()).sort((a, b) => b - a);
        const pairs = [];
        let unmatched = null;

        for (const wins of sortedWinCounts) {
            const bucket = this._shuffle([...buckets.get(wins)]);
            // consumed[i] marks bucket[i] as already placed; `head` is the lowest
            // un-consumed index. Replaces O(n) array splices with O(1) marking so a
            // single giant round-1 bucket builds in O(n) instead of O(n²).
            const consumed = new Array(bucket.length).fill(false);
            let remaining = bucket.length;
            let head = 0;

            // Carry-over from previous bucket (cross-bucket pairing)
            if (unmatched !== null && remaining > 0) {
                let oppIdx = -1;
                for (let k = 0; k < bucket.length; k++) {
                    if (consumed[k]) continue;
                    if (!this.playedPairs.has(this._pairKey(unmatched, bucket[k]))) {
                        oppIdx = k;
                        break;
                    }
                }
                if (oppIdx === -1) {
                    for (let k = 0; k < bucket.length; k++) {
                        if (!consumed[k]) {
                            oppIdx = k;
                            break;
                        }
                    }
                }
                if (oppIdx !== -1) {
                    consumed[oppIdx] = true;
                    remaining--;
                    pairs.push([unmatched, bucket[oppIdx]]);
                }
                unmatched = null;
            }

            // Pair within the bucket — prefer un-played pairs, fall back to rematch only if forced
            while (remaining >= 2) {
                while (consumed[head]) head++;
                const aIdx = head;
                let bIdx = -1;
                // Prefer the first un-consumed partner forming a not-yet-played pair.
                for (let j = aIdx + 1; j < bucket.length; j++) {
                    if (consumed[j]) continue;
                    if (!this.playedPairs.has(this._pairKey(bucket[aIdx], bucket[j]))) {
                        bIdx = j;
                        break;
                    }
                }
                if (bIdx === -1) {
                    // All remaining partners have played aIdx — accept the next rematch.
                    for (let j = aIdx + 1; j < bucket.length; j++) {
                        if (!consumed[j]) {
                            bIdx = j;
                            break;
                        }
                    }
                }
                consumed[aIdx] = true;
                consumed[bIdx] = true;
                remaining -= 2;
                pairs.push([bucket[aIdx], bucket[bIdx]]);
            }

            if (remaining === 1) {
                while (consumed[head]) head++;
                const leftover = bucket[head];
                // Prefer to keep an un-bye'd file as the carry-over (so the bye doesn't double up)
                if (unmatched && this.byes.has(leftover) && !this.byes.has(unmatched)) {
                    pairs.push([unmatched, leftover]);
                    unmatched = null;
                } else {
                    unmatched = leftover;
                }
            }
        }

        // Award bye to leftover unmatched file
        if (unmatched) {
            this.byes.add(unmatched);
            this.winCounts.set(unmatched, (this.winCounts.get(unmatched) ?? 0) + 1);
        }

        return pairs;
    }
```

- [x] **Step 4: Run the Swiss + integration tests to verify behavior is preserved**

Run: `npx vitest run swiss-strategy`
Expected: PASS (all existing invariants + the new large-N tests).

Run: `npx vitest run tournament`
Expected: PASS (`swiss-strategy`, `tournament-engine`, `tournament-manager`, `tournament-flow` integration — byes, round 2 same-win-count pairing, removeFile re-pairing, completion all intact).

- [x] **Step 5: Run the full suite and commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add tournament-engine.js tests/swiss-strategy.test.js
git commit -m "$(cat <<'EOF'
perf(tournament): O(n) _buildRoundPairings via consumed-markers (no splices)

The per-pair bucket.splice() made round 1 (one giant bucket) O(n²). Replace
removal with consumed-markers + a forward head pointer; pairing selection and
bye/carry-over semantics are unchanged. Round 1 now builds in O(n).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Debounced single-flight persistence in `TournamentManager`

**Files:**
- Modify: `tournament.js` — constructor; `handleStartClick` (~17-30); `handlePairResult` (~32-37); `handlePairDraw` (~39-44); `handleApply` (~46-59); `handleDiscard` (~61-64); `handleResumeReconciled` (~89-100); `_persistState` (~120-124); add `_schedulePersist`/`_drain`/`flush`/`cancelPending`
- Test: `tests/tournament-manager.test.js` (new debounce describe block; update three timing assertions)

**Interfaces:**
- Produces (called by Task 5 renderer wiring):
  - `_schedulePersist(folderPath)` → void. Marks state dirty and arms a single trailing-edge timer; coalesces bursts; never throws.
  - `async flush()` → Promise. Force-writes the current engine state now and awaits completion (awaits any in-flight write first, clears the timer). No-op when there is no engine.
  - `cancelPending()` → void. Clears the timer and the dirty flag without writing.
- Consumes: `this.engine.serialize()` (slim v2 payload from Task 1), `window.electronAPI.writeTournamentState(folder, state)`.

- [x] **Step 1: Write the failing debounce tests**

Append to `tests/tournament-manager.test.js`:

```javascript
describe('TournamentManager debounced persistence', () => {
    it('coalesces multiple scheduled persists within the debounce window into one write', async () => {
        vi.useFakeTimers();
        try {
            const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
            const tm = new TournamentManager(host);
            await tm.handleStartClick('/test/folder', 3); // 1 write (start flush)
            const writeSpy = globalThis.window.electronAPI.writeTournamentState;
            writeSpy.mockClear();

            tm._schedulePersist('/test/folder');
            tm._schedulePersist('/test/folder');
            tm._schedulePersist('/test/folder');
            expect(writeSpy).not.toHaveBeenCalled(); // nothing written before the timer fires

            await vi.advanceTimersByTimeAsync(600);
            expect(writeSpy).toHaveBeenCalledTimes(1); // three schedules → one write
        } finally {
            vi.useRealTimers();
        }
    });

    it('flush() writes immediately and clears the pending timer', async () => {
        vi.useFakeTimers();
        try {
            const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
            const tm = new TournamentManager(host);
            await tm.handleStartClick('/test/folder', 3);
            const writeSpy = globalThis.window.electronAPI.writeTournamentState;
            writeSpy.mockClear();

            tm._schedulePersist('/test/folder');
            await tm.flush();
            expect(writeSpy).toHaveBeenCalledTimes(1);

            // the armed timer must not fire a second write afterwards
            await vi.advanceTimersByTimeAsync(600);
            expect(writeSpy).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancelPending() drops a scheduled write (discard does not resurrect the file)', async () => {
        vi.useFakeTimers();
        try {
            const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
            const tm = new TournamentManager(host);
            await tm.handleStartClick('/test/folder', 3);
            const writeSpy = globalThis.window.electronAPI.writeTournamentState;
            writeSpy.mockClear();

            tm._schedulePersist('/test/folder');
            tm.cancelPending();
            await vi.advanceTimersByTimeAsync(600);
            expect(writeSpy).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('single-flight: concurrent flushes never run two writes at once', async () => {
        // Real timers here (no fake-timer setup) so setTimeout(0) drains microtasks between writes.
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);

        // Each write blocks until its resolver is called; resolvers are drained one at a time.
        let concurrent = 0;
        let maxConcurrent = 0;
        const resolvers = [];
        const writeSpy = vi.fn(() => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            return new Promise((resolve) => {
                resolvers.push(() => {
                    concurrent--;
                    resolve({ success: true });
                });
            });
        });
        globalThis.window.electronAPI.writeTournamentState = writeSpy;

        // Three overlapping flushes — the single-flight guard must serialize them.
        const flushes = [tm.flush(), tm.flush(), tm.flush()];
        await Promise.resolve();

        // Drain blocked writes; resolving one may queue the next (latest-wins re-drain).
        for (let guard = 0; guard < 50 && resolvers.length; guard++) {
            resolvers.shift()();
            await new Promise((res) => setTimeout(res, 0)); // let chained microtasks settle
        }
        await Promise.all(flushes);

        expect(maxConcurrent).toBe(1); // the single-flight guard held throughout
        expect(writeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
});
```

- [x] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tournament-manager`
Expected: FAIL — `tm._schedulePersist`, `tm.flush`, `tm.cancelPending` are not functions.

- [x] **Step 3: Add the debounce constant, constructor state, and persistence methods**

In `tournament.js`, after the import line add the constant:

```javascript
import { TournamentEngine, SwissStrategy } from './tournament-engine.js';

// Trailing-edge debounce for state writes. Picks coalesce within this window into a
// single write of the latest state; a hard crash can lose at most this much progress.
const PERSIST_DEBOUNCE_MS = 500;
```

In the constructor (~10-15), add the persistence state fields:

```javascript
    constructor(host, options = {}) {
        // host: MediaViewer instance — provides mediaFiles, currentFolder, showNotification, etc.
        this.host = host;
        this.engine = null;
        this.options = options;
        // Debounced single-flight persistence state.
        this._persistTimer = null;
        this._persistPending = false;
        this._persistFolder = null;
        this._writeInFlight = null;
    }
```

Add these four methods to the class (e.g. just above `_persistState`):

```javascript
    // Mark state dirty and arm a single trailing-edge timer. Non-blocking — the next
    // tournament pair renders without waiting for disk. Coalesces a burst of picks.
    _schedulePersist(folderPath) {
        this._persistFolder = folderPath;
        this._persistPending = true;
        if (this._persistTimer) return;
        this._persistTimer = setTimeout(() => {
            this._persistTimer = null;
            this._drain();
        }, PERSIST_DEBOUNCE_MS);
    }

    // Write the latest state if dirty, with a single-flight guard (no overlapping writes).
    // _persistState (below) is the low-level write primitive; it serializes the CURRENT engine
    // state at call time, so draining always persists the latest picks.
    async _drain() {
        if (this._writeInFlight) return; // a write is running; it re-drains on completion
        if (!this._persistPending || !this.engine) return;
        this._persistPending = false;
        const folder = this._persistFolder;
        this._writeInFlight = (async () => {
            try {
                await this._persistState(folder);
            } catch (err) {
                window.electronAPI?.logError?.(
                    'Tournament persist failed: ' + (err && err.message ? err.message : err)
                );
            } finally {
                this._writeInFlight = null;
                if (this._persistPending) this._drain(); // a pick arrived during the write
            }
        })();
        await this._writeInFlight;
    }

    // Force the current engine state to disk now and await it. Used on must-be-durable
    // paths (start, Save & leave). Awaits any in-flight write first, then writes once.
    async flush() {
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
        }
        if (this._writeInFlight) await this._writeInFlight;
        if (!this.engine) return;
        this._persistPending = true;
        await this._drain();
    }

    // Drop a pending write without writing (used before delete/apply).
    cancelPending() {
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
        }
        this._persistPending = false;
    }
```

- [x] **Step 4: Rewire the manager call sites to schedule/flush/cancel**

In `tournament.js`, change `handleStartClick` (~27-29) — the persist after engine creation becomes a flush:

```javascript
        this.engine = new TournamentEngine(files, new SwissStrategy(), engineOptions);
        await this.flush();
        return true;
```

Replace `handlePairResult` (~32-37):

```javascript
    async handlePairResult(winner, loser) {
        if (!this.engine) return false;
        this.engine.recordResult(winner, loser);
        this._schedulePersist(this.host.baseFolderPath);
        return true;
    }
```

Replace `handlePairDraw` (~39-44):

```javascript
    async handlePairDraw(a, b, outcome) {
        if (!this.engine) return false;
        this.engine.recordDraw(a, b, outcome);
        this._schedulePersist(this.host.baseFolderPath);
        return true;
    }
```

In `handleApply` (~46-59), add `this.cancelPending();` as the first statement after the completeness guard (before building assignments):

```javascript
    async handleApply() {
        if (!this.engine || !this.engine.isComplete()) {
            return { success: false, error: 'Tournament not complete' };
        }
        this.cancelPending(); // applied state is irrelevant; don't let a queued write recreate it
        const assignments = {};
```

Replace `handleDiscard` (~61-64):

```javascript
    async handleDiscard() {
        this.cancelPending(); // don't let a queued write recreate the file after delete
        this.engine = null;
        await window.electronAPI.deleteTournamentState(this.host.baseFolderPath);
    }
```

In `handleResumeReconciled` (~96-98), change the conditional re-persist to a schedule:

```javascript
        if (removed.length > 0) {
            this._schedulePersist(this.host.baseFolderPath);
        }
```

(Leave `_persistState` itself unchanged — it remains the low-level write primitive, now called by `_drain()`. After Task 5 rewires the renderer, `_persistState` is internal-only to `TournamentManager`.)

- [x] **Step 5: Update the three existing timing assertions**

In `tests/tournament-manager.test.js`:

`handlePairResult` test (~55-58) — insert a flush before the write-count assertion:
```javascript
        const ok = await tm.handlePairResult(pair.left, pair.right);
        expect(ok).toBe(true);
        expect(tm.engine.history.length).toBe(1);
        await tm.flush(); // debounced write — force it for the assertion
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalledTimes(2);
```

`handlePairDraw` test (~175-182) — same insertion before the count assertion:
```javascript
        expect(ok).toBe(true);
        expect(tm.engine.history.length).toBe(1);
        expect(tm.engine.history[0].draw).toBe(true);
        expect(tm.engine.history[0].outcome).toBe('win');
        await tm.flush(); // debounced write — force it for the assertion
        // once on start, once on the draw
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalledTimes(2);
```

`handleResumeReconciled` "purges files removed from disk" test (~156-164) — flush before the called assertion:
```javascript
        const result = await tm2.handleResumeReconciled(savedState, currentFiles);

        expect(result.ok).toBe(true);
        expect(result.removedCount).toBe(2);
        expect(tm2.engine.files.length).toBe(2);
        expect(tm2.engine.files).not.toContain('c.jpg');
        expect(tm2.engine.files).not.toContain('d.jpg');
        await tm2.flush(); // reconcile schedules a debounced write — force it
        // Removed files trigger a re-persist
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalled();
```

`handleResume` test (~115-125) — `handlePairResult` now arms a real 500ms timer; cancel it so it
can't fire after the test (after `afterEach` restores `window`, a late write would throw). Insert
right after the `handlePairResult` call:
```javascript
        await tm.handlePairResult(pair.left, pair.right);
        tm.cancelPending(); // clear the debounce timer so it can't fire post-test
        const savedState = tm.engine.serialize();
```

- [x] **Step 6: Run the manager tests, then the full suite, and commit**

Run: `npx vitest run tournament-manager`
Expected: PASS (debounce coalesce/flush/cancel/single-flight + updated timing assertions).

Run: `npx vitest run`
Expected: PASS.

```bash
git add tournament.js tests/tournament-manager.test.js
git commit -m "$(cat <<'EOF'
perf(tournament): debounced single-flight state persistence

Picks now schedule a trailing-edge (500ms) write that coalesces bursts and never
overlaps (latest-wins), so the next pair renders without awaiting disk. flush()
forces a durable write on start/Save&leave; cancelPending() drops queued writes
before discard/apply.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rewire renderer persistence call sites

**Files:**
- Modify: `media-viewer.js` — Save & leave accept (~4176); `showTournamentPair` removeFile branch (~4423); `moveToSpecialFolder` tournament branch (~1542); `handleTournamentUndo` special branch (~4520) and default branch (~4536)
- Verify: grep for residual direct `_persistState` calls

**Interfaces:**
- Consumes: `this.tournament.flush()`, `this.tournament._schedulePersist(folderPath)` (Task 4).

> These are renderer DOM-context methods not covered by unit tests; their building blocks (`flush`/`_schedulePersist`) are unit-tested in Task 4. Verification here is: full unit suite green + a grep confirming every renderer persistence call now routes through `flush`/`_schedulePersist`, with the existing tournament E2E flow as the integration guard and the user's manual 24k smoke as the acceptance gate.

- [x] **Step 1: Save & leave — flush instead of `_persistState`**

In `media-viewer.js` `showTournamentLeavePrompt` accept handler (~4173-4177), change:

```javascript
        acceptBtn.onclick = async () => {
            // State is persisted per-pick; write once more to be safe, then drop the in-memory
            // engine so re-entering resumes from disk (single source of truth).
            await this.tournament._persistState(this.baseFolderPath);
            this.tournament.engine = null;
```
to:
```javascript
        acceptBtn.onclick = async () => {
            // State is persisted per-pick (debounced); flush any pending write so the latest
            // picks are durable, then drop the in-memory engine (disk is the single source of truth).
            await this.tournament.flush();
            this.tournament.engine = null;
```

- [x] **Step 2: `showTournamentPair` missing-file removal — schedule instead of await**

In `media-viewer.js` (~4422-4424), change:

```javascript
            this.tournament.engine.removeFile(missing);
            await this.tournament._persistState(this.baseFolderPath);
            return this.showTournamentPair();
```
to:
```javascript
            this.tournament.engine.removeFile(missing);
            this.tournament._schedulePersist(this.baseFolderPath);
            return this.showTournamentPair();
```

- [x] **Step 3: `moveToSpecialFolder` tournament removal — schedule instead of await**

In `media-viewer.js` (~1540-1543), change:

```javascript
            if (this.isTournamentMode && this.tournament.engine) {
                this.tournament.engine.removeFile(fileToMove.path);
                await this.tournament._persistState(this.baseFolderPath);
            }
```
to:
```javascript
            if (this.isTournamentMode && this.tournament.engine) {
                this.tournament.engine.removeFile(fileToMove.path);
                this.tournament._schedulePersist(this.baseFolderPath);
            }
```

- [x] **Step 4: `handleTournamentUndo` — schedule on both branches**

In `media-viewer.js` (~4520), change:
```javascript
                await this.tournament._persistState(this.baseFolderPath);
                if (this.showRatingConfirmations) {
```
to:
```javascript
                this.tournament._schedulePersist(this.baseFolderPath);
                if (this.showRatingConfirmations) {
```

In `media-viewer.js` (~4534-4537), change:
```javascript
        // Default: undo the engine's last pair-pick (snapshot-restored strategy state).
        this.tournament.engine.undo();
        await this.tournament._persistState(this.baseFolderPath);
        await this.showTournamentPair();
```
to:
```javascript
        // Default: undo the engine's last pair-pick (snapshot-restored strategy state).
        this.tournament.engine.undo();
        this.tournament._schedulePersist(this.baseFolderPath);
        await this.showTournamentPair();
```

- [x] **Step 5: Verify no renderer code still calls `_persistState` directly**

Run: `grep -n "_persistState" media-viewer.js`
Expected: **no matches** (all renderer persistence now routes through `flush` / `_schedulePersist`). `_persistState` should now appear only in `tournament.js`.

- [x] **Step 6: Run lint + full suite and commit**

Run: `npm run lint`
Expected: clean (no errors).

Run: `npx vitest run`
Expected: PASS (357+ tests).

```bash
git add media-viewer.js
git commit -m "$(cat <<'EOF'
perf(tournament): route renderer persistence through flush/_schedulePersist

Pick/undo/special-move paths now schedule a debounced write (non-blocking);
Save & leave flushes. The next pair renders without awaiting disk.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Cached path→index `Map` for pair display

**Files:**
- Modify: `media-viewer.js` — constructor (~59-60 region, add fields); new `getMediaIndex` method; `removeFileFromList` (~1062-1084, invalidate); `showTournamentPair` (~4416-4417)
- Test: `tests/media-viewer-utils.test.js` (new `getMediaIndex` describe block)

**Interfaces:**
- Produces: `getMediaIndex(path)` → number — index of the file in `this.mediaFiles`, or `-1` if absent. Backed by a `Map` rebuilt only when `this.mediaFiles` is reassigned (reference change) or its length changes; explicitly invalidated in `removeFileFromList`.

- [x] **Step 1: Write the failing `getMediaIndex` unit test**

In `tests/media-viewer-utils.test.js`, register the method near the other `extractMethod` declarations (~83):

```javascript
const getMediaIndex = extractMethod('getMediaIndex');
```

Then append a describe block:

```javascript
describe('getMediaIndex (cached path→index map)', () => {
    function ctx(paths) {
        return {
            mediaFiles: paths.map((p) => ({ path: p })),
            _mediaPathIndex: null,
            _mediaPathIndexSource: null,
        };
    }

    it('returns the index of a present path and -1 for an absent one', () => {
        const c = ctx(['a.jpg', 'b.jpg', 'c.jpg']);
        expect(getMediaIndex.call(c, 'b.jpg')).toBe(1);
        expect(getMediaIndex.call(c, 'missing.jpg')).toBe(-1);
    });

    it('rebuilds when mediaFiles is reassigned (reference change)', () => {
        const c = ctx(['a.jpg', 'b.jpg']);
        expect(getMediaIndex.call(c, 'a.jpg')).toBe(0);
        c.mediaFiles = [{ path: 'x.jpg' }, { path: 'a.jpg' }]; // new array (e.g. after a sort)
        expect(getMediaIndex.call(c, 'a.jpg')).toBe(1);
    });

    it('rebuilds when the array length changes (in-place splice)', () => {
        const c = ctx(['a.jpg', 'b.jpg', 'c.jpg']);
        expect(getMediaIndex.call(c, 'c.jpg')).toBe(2);
        c.mediaFiles.splice(0, 1); // remove a.jpg in place — same array reference
        expect(getMediaIndex.call(c, 'c.jpg')).toBe(1);
    });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run media-viewer-utils`
Expected: FAIL — `Could not find method: getMediaIndex`.

- [x] **Step 3: Add the cache fields, the method, and invalidation**

In `media-viewer.js` constructor, just after `this.mediaFiles = [];` (~60), add:

```javascript
        this.mediaFiles = [];
        // Cached path→index map for O(1) tournament pair lookup; rebuilt when mediaFiles changes.
        this._mediaPathIndex = null;
        this._mediaPathIndexSource = null;
```

Add the method (place it near `removeFileFromList`, ~1085, after the method's closing brace):

```javascript
    getMediaIndex(path) {
        if (
            !this._mediaPathIndex ||
            this._mediaPathIndexSource !== this.mediaFiles ||
            this._mediaPathIndex.size !== this.mediaFiles.length
        ) {
            this._mediaPathIndex = new Map(this.mediaFiles.map((f, i) => [f.path, i]));
            this._mediaPathIndexSource = this.mediaFiles;
        }
        return this._mediaPathIndex.has(path) ? this._mediaPathIndex.get(path) : -1;
    }
```

In `removeFileFromList` (~1067, right after `this.mediaFiles.splice(index, 1);`), add an explicit invalidation:

```javascript
        this.mediaFiles.splice(index, 1);
        this._mediaPathIndex = null; // invalidate cached path→index map
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run media-viewer-utils`
Expected: PASS (present/absent, reference-change rebuild, length-change rebuild).

- [x] **Step 5: Use the cache in `showTournamentPair`**

In `media-viewer.js` (~4416-4417), change:

```javascript
        const leftIdx = this.mediaFiles.findIndex((f) => f.path === pair.left);
        const rightIdx = this.mediaFiles.findIndex((f) => f.path === pair.right);
```
to:
```javascript
        const leftIdx = this.getMediaIndex(pair.left);
        const rightIdx = this.getMediaIndex(pair.right);
```

- [x] **Step 6: Run lint + full suite and commit**

Run: `npm run lint`
Expected: clean.

Run: `npx vitest run`
Expected: PASS.

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "$(cat <<'EOF'
perf(tournament): O(1) pair path→index via cached Map

showTournamentPair did a dual O(n) findIndex over mediaFiles on every pick. Use
a Map rebuilt only when mediaFiles is reassigned or resized (invalidated in
removeFileFromList).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Atomic `writeTournamentState` (main process)

**Files:**
- Modify: `main.js` — `writeTournamentState` IPC handler (~238-247)

**Interfaces:**
- Consumes/Produces: same IPC contract (`writeTournamentState(folderPath, state) → { success }`). Behavior change only: the on-disk file is replaced atomically.

> No unit test — `main.js` IPC handlers are not unit-tested in this project (consistent with the existing codebase). Verified by reading + the existing tournament E2E flow (which writes and re-reads state) + manual smoke.

- [x] **Step 1: Make the write atomic (temp + rename)**

In `main.js`, replace the `writeTournamentState` handler (~238-247) with:

```javascript
    ipcMain.handle('writeTournamentState', async (_event, folderPath, state) => {
        const statePath = path.join(folderPath, '.tournament_state.json');
        const tmpPath = statePath + '.tmp';
        try {
            const text = JSON.stringify(state, null, 2);
            await fs.writeFile(tmpPath, text, 'utf-8');
            await fs.rename(tmpPath, statePath); // atomic replace — no torn file on crash mid-write
            return { success: true };
        } catch (err) {
            await fs.unlink(tmpPath).catch(() => {}); // best-effort cleanup of the temp file
            return { success: false, error: err.message };
        }
    });
```

- [x] **Step 2: Lint + full suite (no behavior regression) and commit**

Run: `npm run lint`
Expected: clean.

Run: `npx vitest run`
Expected: PASS.

```bash
git add main.js
git commit -m "$(cat <<'EOF'
fix(tournament): atomic .tournament_state.json write (temp + rename)

A crash mid-write can no longer corrupt a resumable tournament. Matches the
feature-cache atomic-write pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [x] Run the full unit suite: `npx vitest run` → all green (357 baseline + new tests: ~2 v1/gamesPlayed engine + 2 undo-cap + 2 large-N swiss + 4 debounce manager + 3 getMediaIndex ≈ **370+**).
- [x] Run lint + format check: `npm run lint && npm run format:check` → clean.
- [x] (If feasible) Run the tournament E2E: `npx playwright test tournament-mode` → green (pick→Apply tier moves, Both Win/Lose draws, Ctrl+A undo, leave-Save→resume).
- [x] Confirm no stray direct `_persistState` calls in `media-viewer.js`: `grep -n "_persistState" media-viewer.js` → no matches.
- [x] **Hand off to user for the 24k-folder manual smoke** (the real acceptance gate, per spec): launch a tournament on the large folder (must not freeze), run a streak of picks (pick→next must feel instant and must NOT slow down as games accumulate), Save & leave (near-instant), resume (fast), Apply. Also verify a previously-saved (v1) tournament still resumes.

## Acceptance criteria (from spec)

- Pick → next-pair render time is independent of games played (no growth across a session).
- Launch/resume on 24k files complete without a multi-second freeze (O(n), not O(n·g)/O(n²)).
- `.tournament_state.json` size is O(n) and does not grow with games played.
- Save & leave is near-instant (one coalesced write, no fresh full re-serialize).
- In-memory undo RAM is bounded (~100 × O(n)).
- Old (v1) saved tournaments still resume.
- All existing + new unit tests pass.
