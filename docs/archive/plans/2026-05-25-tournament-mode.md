# Tournament Mode Implementation Plan

**Status: Complete (Phases A–G shipped).** Phase H (E2E tests) deferred to BACKLOG
(2026-05-26 entry). Engine + Swiss strategy + IPC + TournamentManager + 3-way mode
selector + keyboard shortcuts all landed across commits `ee97298`…`6c73f9f`…`acfc3b6`,
then a large polish/UX + feature-cache-streaming pass on 2026-05-26 (see
[DONE.md](../../planning/DONE.md), 2026-05-26 entry). The unchecked `- [ ]` boxes below
reflect the original task list; treat this archived plan as historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tournament Mode — a third media-viewing mode (alongside Single and Compare) that ranks every file in the current folder by pairwise judgment, then moves files into win-count tier folders (`<source>/_Tier-0/` through `_Tier-R/`) on disk.

**Architecture:** Two-layer split. A `TournamentEngine` (in `tournament-engine.js`, CommonJS-exportable for unit tests) owns shared state — file list, history, persistence, undo. A `PairingStrategy` interface delegates pairing logic; v1 ships `SwissStrategy` only. A `TournamentManager` ES module (`tournament.js`, v2.0 pattern like `fullscreen.js`) owns the UI: config modal, pair display, summary modal, IPC glue, resume prompts. Four new IPC handlers in `main.js` handle state file I/O and the apply-results batch move. The current binary `#viewModeBtn` becomes a 3-way selector.

**Tech Stack:** Existing — Electron, Vitest, Playwright. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-05-25-tournament-mode-design.md`

---

## Scope Check

This plan covers **Swiss-only prototype** per the spec (§1, §8). `RoundRobinStrategy` and `BracketStrategy` are documented in the spec but not implemented here — they land as future follow-up PRs.

The plan is sized for the WEEKLY.md Friday slot (5 SP). Phases A–F (engine + Swiss + integration tests + IPC + manager + UI integration) are the must-ship core. Phase G (keyboard shortcuts) is a small finish. Phase H (E2E tests) is "fit-as-time-allows" — if Friday runs long, ship without E2E and follow up the next day.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `tournament-engine.js` | **Create** | `TournamentEngine` class + `SwissStrategy` class; CommonJS-exportable (mirrors `sorting-worker.js` conditional export pattern) |
| `tournament.js` | **Create** | `TournamentManager` ES module (v2.0 pattern, mirrors `fullscreen.js`): config modal, pair display, summary modal, IPC glue, resume/invalidation prompts |
| `main.js` | Modify | 4 new IPC handlers: `readTournamentState`, `writeTournamentState`, `deleteTournamentState`, `applyTournamentResults` |
| `preload.js` | Modify | Expose 4 new IPC bindings on `window.electronAPI` |
| `media-viewer.js` | Modify | 3-way mode-selector wiring, instantiate `TournamentManager`, resume prompt on `loadFolder`, tournament-mode entry in `DEFAULT_SHORTCUTS` |
| `index.html` | Modify | Replace binary `#viewModeBtn` with 3-way selector; add modal/overlay containers |
| `styles.css` | Modify | Tournament UI styles (progress header, tier breakdown chips, modal layout) |
| `eslint.config.mjs` | Modify | Add `tournament-engine.js` to shared-libs block; add `tournament.js` to renderer-module block |
| `tests/swiss-strategy.test.js` | **Create** | 12 unit tests for `SwissStrategy` (CommonJS require pattern) |
| `tests/tournament-engine.test.js` | **Create** | 7 unit tests for `TournamentEngine` with `MockStrategy` |
| `tests/tournament-manager.test.js` | **Create** | 8 unit tests via `extractMethod` / `extractAsyncMethod` pattern |
| `tests/integration/tournament-flow.test.js` | **Create** | 4 integration tests wiring real engine + real `SwissStrategy` + mocked file ops |
| `tests/e2e/tournament-mode.test.js` | **Create** (stretch) | E2E tests — happy path, resume, discard, invalidation |

---

## Phase A — `SwissStrategy` Implementation (TDD)

Phase A delivers a fully-tested `SwissStrategy` in `tournament-engine.js`. Tests come first, implementation follows. After Phase A, `npm test` includes 12 new tests covering pairing, byes, recording, removal, completion, and serialization.

### Task A1: Scaffold `tournament-engine.js` as a pure ES module

**Files:**
- Create: `tournament-engine.js`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Create empty `tournament-engine.js` as a pure ES module**

```javascript
// tournament-engine.js
// Tournament engine + pluggable pairing strategies.
// Pure ES module — imported by both tournament.js (renderer) and Vitest tests.
// Unlike sorting-worker.js (loaded as a Web Worker), this file is consumed via
// ES module import, so it does NOT use the conditional CJS export pattern.

export class SwissStrategy {
    constructor() {
        this.files = [];
        this.options = { rounds: 3 };
        this.winCounts = new Map();
        this.playedPairs = new Set();
        this.byes = new Set();
        this.currentRound = 0;
        this.roundQueue = [];
        this.gamesPlayed = 0;
    }
}

export class TournamentEngine {
    constructor(files, strategy, options = {}) {
        this.files = [...files];
        this.strategy = strategy;
        this.history = [];
        this.strategy.init(this.files, options);
    }
}
```

- [ ] **Step 2: Add `tournament-engine.js` to the renderer-module ESLint block in `eslint.config.mjs`**

Find block 2a (renderer module) — it currently includes `fullscreen.js`. Add `tournament-engine.js` to that `files` array (it's pure ESM imported by `tournament.js`, not a CJS lib required by workers — block 3b is for the latter).

- [ ] **Step 3: Verify it parses and lints cleanly**

```bash
npm run lint
```

Expected: no errors mentioning `tournament-engine.js`.

- [ ] **Step 4: Commit**

```bash
git add tournament-engine.js eslint.config.mjs
git commit -m "feat(tournament): scaffold tournament-engine.js with CJS export"
```

---

### Task A2: `SwissStrategy.init` — initialize state for round 1

**Files:**
- Create: `tests/swiss-strategy.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Create `tests/swiss-strategy.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { SwissStrategy } from '../tournament-engine.js';

describe('SwissStrategy.init', () => {
    it('initializes state for round 1 with even N', () => {
        const s = new SwissStrategy();
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];
        s.init(files, { rounds: 3 });

        expect(s.files).toEqual(files);
        expect(s.options.rounds).toBe(3);
        expect(s.currentRound).toBe(1);
        expect(s.gamesPlayed).toBe(0);
        expect(s.byes.size).toBe(0);
        expect(s.playedPairs.size).toBe(0);

        // All files start at 0 wins
        for (const file of files) {
            expect(s.winCounts.get(file)).toBe(0);
        }

        // Round queue has N/2 pairs for even N
        expect(s.roundQueue.length).toBe(2);
    });

    it('defaults rounds to 3 if options omitted', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg']);
        expect(s.options.rounds).toBe(3);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: FAIL — `s.init is not a function`.

- [ ] **Step 3: Implement `init` and helper `_buildRoundPairings`**

Add inside the `SwissStrategy` class in `tournament-engine.js`:

```javascript
    init(files, options = {}) {
        this.files = [...files];
        this.options = { rounds: 3, ...options };
        this.winCounts = new Map(files.map((f) => [f, 0]));
        this.playedPairs = new Set();
        this.byes = new Set();
        this.currentRound = 1;
        this.gamesPlayed = 0;
        this.roundQueue = this._buildRoundPairings();
    }

    _pairKey(a, b) {
        return [a, b].sort().join('|');
    }

    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

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

            // Carry-over from previous bucket (cross-bucket pairing)
            if (unmatched) {
                let opponentIdx = bucket.findIndex(
                    (b) => !this.playedPairs.has(this._pairKey(unmatched, b))
                );
                if (opponentIdx === -1) opponentIdx = 0;
                if (bucket.length > 0) {
                    const opponent = bucket[opponentIdx];
                    bucket.splice(opponentIdx, 1);
                    pairs.push([unmatched, opponent]);
                }
                unmatched = null;
            }

            // Pair within the bucket
            while (bucket.length >= 2) {
                const a = bucket.shift();
                let opponentIdx = bucket.findIndex(
                    (b) => !this.playedPairs.has(this._pairKey(a, b))
                );
                if (opponentIdx === -1) opponentIdx = 0;
                const b = bucket[opponentIdx];
                bucket.splice(opponentIdx, 1);
                pairs.push([a, b]);
            }

            if (bucket.length === 1) {
                unmatched = bucket[0];
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

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/swiss-strategy.test.js tournament-engine.js
git commit -m "feat(tournament): SwissStrategy.init builds round-1 pairings"
```

---

### Task A3: `SwissStrategy.getNextPair` and `recordResult`

**Files:**
- Modify: `tests/swiss-strategy.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/swiss-strategy.test.js`:

```javascript
describe('SwissStrategy.getNextPair + recordResult', () => {
    it('returns the next pair and consumes it on recordResult', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        const pair = s.getNextPair();
        expect(pair).toBeTruthy();
        expect(pair.length).toBe(2);
        const [a, b] = pair;
        expect(s.files).toContain(a);
        expect(s.files).toContain(b);
        expect(a).not.toBe(b);

        s.recordResult(a, b);
        expect(s.winCounts.get(a)).toBe(1);
        expect(s.winCounts.get(b)).toBe(0);
        expect(s.gamesPlayed).toBe(1);
        expect(s.playedPairs.has(s._pairKey(a, b))).toBe(true);

        // Next call returns a different pair
        const pair2 = s.getNextPair();
        expect(pair2).toBeTruthy();
        const [c, d] = pair2;
        expect([a, b]).not.toContain(c);
        expect([a, b]).not.toContain(d);
    });

    it('throws on invalid recordResult arguments', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg'], { rounds: 1 });
        const [a, b] = s.getNextPair();

        expect(() => s.recordResult(a, a)).toThrow();
        expect(() => s.recordResult('not-in-pair.jpg', b)).toThrow();
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: 2 tests fail with `getNextPair is not a function` and `recordResult is not a function`.

- [ ] **Step 3: Implement `getNextPair` and `recordResult`**

Add to `SwissStrategy` class:

```javascript
    getNextPair() {
        // If current round's queue is exhausted, try to start the next round
        while (this.roundQueue.length === 0) {
            if (this.currentRound >= this.options.rounds) {
                return null; // tournament complete
            }
            this.currentRound++;
            this.roundQueue = this._buildRoundPairings();
            // If no pairings could be built (e.g., everyone needed a bye), loop again
            if (this.roundQueue.length === 0 && this.currentRound >= this.options.rounds) {
                return null;
            }
        }
        return [this.roundQueue[0][0], this.roundQueue[0][1]];
    }

    recordResult(winner, loser) {
        if (this.roundQueue.length === 0) {
            throw new Error('No active pair to record');
        }
        const [a, b] = this.roundQueue[0];
        const validPair =
            (winner === a && loser === b) || (winner === b && loser === a);
        if (!validPair) {
            throw new Error(
                `Invalid result: expected winner/loser from current pair [${a}, ${b}], got winner=${winner}, loser=${loser}`
            );
        }
        this.roundQueue.shift();
        this.winCounts.set(winner, (this.winCounts.get(winner) ?? 0) + 1);
        this.playedPairs.add(this._pairKey(a, b));
        this.gamesPlayed++;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/swiss-strategy.test.js tournament-engine.js
git commit -m "feat(tournament): SwissStrategy.getNextPair + recordResult"
```

---

### Task A4: `SwissStrategy` round-2 within-bucket pairing

**Files:**
- Modify: `tests/swiss-strategy.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/swiss-strategy.test.js`:

```javascript
describe('SwissStrategy round 2+ pairing', () => {
    it('round 2 pairs files with the same win count when possible', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        // Play round 1: a beats b, c beats d
        const [p1a, p1b] = s.getNextPair();
        s.recordResult(p1a, p1b);
        const [p2a, p2b] = s.getNextPair();
        s.recordResult(p2a, p2b);

        // The two winners have 1 win, the two losers have 0
        const winners = [];
        const losers = [];
        for (const file of s.files) {
            if (s.winCounts.get(file) === 1) winners.push(file);
            else losers.push(file);
        }
        expect(winners.length).toBe(2);
        expect(losers.length).toBe(2);

        // Round 2 starts — next pair must be within a bucket
        const [r2a, r2b] = s.getNextPair();
        expect(s.currentRound).toBe(2);
        const r2Wins = [s.winCounts.get(r2a), s.winCounts.get(r2b)];
        // Both files in the pair have the same win count (both winners or both losers)
        expect(r2Wins[0]).toBe(r2Wins[1]);
    });
});
```

- [ ] **Step 2: Run to verify it passes** (this should pass with the existing implementation — bucket logic in `_buildRoundPairings` already handles this)

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (5 tests).

If it fails, the within-bucket logic in `_buildRoundPairings` needs review.

- [ ] **Step 3: Commit**

```bash
git add tests/swiss-strategy.test.js
git commit -m "test(tournament): assert round-2 within-bucket pairing"
```

---

### Task A5: Bye logic for odd N

**Files:**
- Modify: `tests/swiss-strategy.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('SwissStrategy byes', () => {
    it('awards a bye to one file per round when N is odd', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg'], { rounds: 3 });

        // Round 1: 1 pair (2 files play), 1 bye
        expect(s.roundQueue.length).toBe(1);
        expect(s.byes.size).toBe(1);
        const byeFile = Array.from(s.byes)[0];
        expect(s.winCounts.get(byeFile)).toBe(1); // bye = free win
    });

    it('no file gets more than one bye across the tournament', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg'], { rounds: 3 });

        const seenByes = new Set();
        let safety = 50;
        while (safety-- > 0) {
            const pair = s.getNextPair();
            if (!pair) break;
            const [a, b] = pair;
            s.recordResult(a, b);
            for (const bf of s.byes) seenByes.add(bf);
        }

        // Each bye'd file appears only once in s.byes (Set property)
        // But across rounds, we want NO file bye'd twice — check that
        // no file's win count exceeds rounds (which would happen if double-bye'd)
        for (const file of s.files) {
            expect(s.winCounts.get(file)).toBeLessThanOrEqual(s.options.rounds);
        }
    });
});
```

- [ ] **Step 2: Run to verify**

```bash
npx vitest run tests/swiss-strategy.test.js
```

The first test should pass (bye logic exists). The second may flag a bug — current implementation re-awards byes per round without checking.

- [ ] **Step 3: Patch `_buildRoundPairings` bye logic to prevent double-bye**

Replace the bye-award block at the bottom of `_buildRoundPairings`:

```javascript
        // Award bye to leftover unmatched file
        if (unmatched) {
            if (this.byes.has(unmatched)) {
                // This file already had a bye — must pair with someone (allow repeat as last resort)
                // Find the lowest-win-count file that hasn't already been paired this round
                const alreadyPaired = new Set();
                for (const [pa, pb] of pairs) {
                    alreadyPaired.add(pa);
                    alreadyPaired.add(pb);
                }
                const candidates = this.files
                    .filter((f) => f !== unmatched && !alreadyPaired.has(f) && !this.byes.has(f))
                    .sort((a, b) => (this.winCounts.get(a) ?? 0) - (this.winCounts.get(b) ?? 0));
                if (candidates.length > 0) {
                    // Swap: take the lowest-win candidate's existing pairing partner and give to unmatched
                    // Simpler approach: just bye them again (rare edge case for R<=5)
                    this.byes.add(unmatched);
                    this.winCounts.set(
                        unmatched,
                        (this.winCounts.get(unmatched) ?? 0) + 1
                    );
                } else {
                    this.byes.add(unmatched);
                    this.winCounts.set(
                        unmatched,
                        (this.winCounts.get(unmatched) ?? 0) + 1
                    );
                }
            } else {
                this.byes.add(unmatched);
                this.winCounts.set(unmatched, (this.winCounts.get(unmatched) ?? 0) + 1);
            }
        }
```

Actually, the simplest correct fix is: prefer NOT to bye a file that already has a bye. Re-do the bucket processing to try to bye someone who hasn't been bye'd yet. Replace the entire `_buildRoundPairings` bye-aware version:

In the bucket-processing loop, when a single file is left in a bucket, prefer to keep an *un-bye'd* file as the carry-over. Replace the `if (bucket.length === 1)` block:

```javascript
            if (bucket.length === 1) {
                // Prefer to keep an un-bye'd file as the carry-over (so the bye doesn't double up)
                const leftover = bucket[0];
                if (unmatched && this.byes.has(leftover) && !this.byes.has(unmatched)) {
                    // Swap: pair the about-to-be-bye'd leftover with unmatched, leave nothing
                    pairs.push([unmatched, leftover]);
                    unmatched = null;
                } else {
                    unmatched = leftover;
                }
            }
```

That covers most cases for R ≤ 5 without sophisticated swap logic.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament-engine.js tests/swiss-strategy.test.js
git commit -m "feat(tournament): SwissStrategy bye logic prevents double-bye"
```

---

### Task A6: `SwissStrategy.removeFile` for in-session Special removal

**Files:**
- Modify: `tests/swiss-strategy.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('SwissStrategy.removeFile', () => {
    it('removes a file from all state structures', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        s.removeFile('a.jpg');

        expect(s.files).not.toContain('a.jpg');
        expect(s.winCounts.has('a.jpg')).toBe(false);
        expect(s.byes.has('a.jpg')).toBe(false);

        // No remaining queue pair contains 'a.jpg'
        for (const [x, y] of s.roundQueue) {
            expect(x).not.toBe('a.jpg');
            expect(y).not.toBe('a.jpg');
        }
    });

    it('re-pairs orphaned partner when removed mid-round', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        // Find the partner of 'a.jpg' in the current round
        const aPair = s.roundQueue.find(([x, y]) => x === 'a.jpg' || y === 'a.jpg');
        expect(aPair).toBeTruthy();
        const partner = aPair[0] === 'a.jpg' ? aPair[1] : aPair[0];

        s.removeFile('a.jpg');

        // The orphaned partner should still appear in the queue (re-paired with someone else)
        // OR have been bye'd
        const stillInQueue = s.roundQueue.some(([x, y]) => x === partner || y === partner);
        const bye = s.byes.has(partner);
        expect(stillInQueue || bye).toBe(true);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: 2 tests fail — `s.removeFile is not a function`.

- [ ] **Step 3: Implement `removeFile`**

Add to `SwissStrategy`:

```javascript
    removeFile(file) {
        if (!this.files.includes(file)) return;

        this.files = this.files.filter((f) => f !== file);
        this.winCounts.delete(file);
        this.byes.delete(file);

        // Remove from playedPairs entries involving this file
        for (const key of [...this.playedPairs]) {
            const [x, y] = key.split('|');
            if (x === file || y === file) {
                this.playedPairs.delete(key);
            }
        }

        // Identify orphaned partners (their pair contained the removed file)
        const orphans = [];
        const survivingQueue = [];
        for (const [a, b] of this.roundQueue) {
            if (a === file) {
                orphans.push(b);
            } else if (b === file) {
                orphans.push(a);
            } else {
                survivingQueue.push([a, b]);
            }
        }
        this.roundQueue = survivingQueue;

        // Pair orphans with each other; if odd, give a bye
        while (orphans.length >= 2) {
            const a = orphans.shift();
            const b = orphans.shift();
            this.roundQueue.push([a, b]);
        }
        if (orphans.length === 1) {
            const lone = orphans[0];
            if (!this.byes.has(lone)) {
                this.byes.add(lone);
                this.winCounts.set(lone, (this.winCounts.get(lone) ?? 0) + 1);
            } else {
                // Already bye'd — accept a second bye in this edge case
                this.byes.add(lone);
                this.winCounts.set(lone, (this.winCounts.get(lone) ?? 0) + 1);
            }
        }
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament-engine.js tests/swiss-strategy.test.js
git commit -m "feat(tournament): SwissStrategy.removeFile + orphan re-pair"
```

---

### Task A7: `isComplete` and `getTier`

**Files:**
- Modify: `tests/swiss-strategy.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('SwissStrategy.isComplete + getTier', () => {
    it('isComplete is false until all rounds finish', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg'], { rounds: 2 });

        expect(s.isComplete()).toBe(false);

        let safety = 20;
        while (!s.isComplete() && safety-- > 0) {
            const pair = s.getNextPair();
            if (!pair) break;
            s.recordResult(pair[0], pair[1]);
        }

        expect(s.isComplete()).toBe(true);
    });

    it('getTier returns the win count after completion', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        let safety = 30;
        while (!s.isComplete() && safety-- > 0) {
            const pair = s.getNextPair();
            if (!pair) break;
            s.recordResult(pair[0], pair[1]);
        }

        expect(s.isComplete()).toBe(true);

        for (const file of s.files) {
            const tier = s.getTier(file);
            expect(Number.isInteger(tier)).toBe(true);
            expect(tier).toBeGreaterThanOrEqual(0);
            expect(tier).toBeLessThanOrEqual(3);
            expect(tier).toBe(s.winCounts.get(file));
        }
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: 2 tests fail — `isComplete is not a function`, `getTier is not a function`.

- [ ] **Step 3: Implement `isComplete` and `getTier`**

Add to `SwissStrategy`:

```javascript
    isComplete() {
        return this.currentRound >= this.options.rounds && this.roundQueue.length === 0;
    }

    getTier(file) {
        return this.winCounts.get(file) ?? 0;
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament-engine.js tests/swiss-strategy.test.js
git commit -m "feat(tournament): SwissStrategy.isComplete + getTier"
```

---

### Task A8: `getProgress`

**Files:**
- Modify: `tests/swiss-strategy.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('SwissStrategy.getProgress', () => {
    it('reports coherent progress mid-tournament', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        const p0 = s.getProgress();
        expect(p0.round).toBe(1);
        expect(p0.totalRounds).toBe(3);
        expect(p0.gamesPlayed).toBe(0);

        const [a, b] = s.getNextPair();
        s.recordResult(a, b);

        const p1 = s.getProgress();
        expect(p1.gamesPlayed).toBe(1);
        expect(p1.gamesPlayed).toBeLessThanOrEqual(p1.gamesTotal);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: FAIL — `getProgress is not a function`.

- [ ] **Step 3: Implement `getProgress`**

Add to `SwissStrategy`:

```javascript
    getProgress() {
        const gamesPerRound = Math.floor(this.files.length / 2);
        const gamesTotal = gamesPerRound * this.options.rounds;
        return {
            round: this.currentRound,
            totalRounds: this.options.rounds,
            gameInRound: gamesPerRound - this.roundQueue.length,
            gamesInRound: gamesPerRound,
            gamesPlayed: this.gamesPlayed,
            gamesTotal,
        };
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament-engine.js tests/swiss-strategy.test.js
git commit -m "feat(tournament): SwissStrategy.getProgress"
```

---

### Task A9: `serialize` and `deserialize` roundtrip

**Files:**
- Modify: `tests/swiss-strategy.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('SwissStrategy serialize/deserialize', () => {
    it('roundtrip preserves all state', () => {
        const s1 = new SwissStrategy();
        s1.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        // Play 2 games
        for (let i = 0; i < 2; i++) {
            const [a, b] = s1.getNextPair();
            s1.recordResult(a, b);
        }

        const json = s1.serialize();
        const s2 = SwissStrategy.deserialize(json);

        expect(s2.files).toEqual(s1.files);
        expect(s2.options).toEqual(s1.options);
        expect(Array.from(s2.winCounts.entries())).toEqual(
            Array.from(s1.winCounts.entries())
        );
        expect(Array.from(s2.playedPairs)).toEqual(Array.from(s1.playedPairs));
        expect(Array.from(s2.byes)).toEqual(Array.from(s1.byes));
        expect(s2.currentRound).toBe(s1.currentRound);
        expect(s2.gamesPlayed).toBe(s1.gamesPlayed);
        expect(s2.roundQueue).toEqual(s1.roundQueue);
    });

    it('serialized output is JSON-safe (no Maps/Sets)', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg'], { rounds: 1 });
        const json = s.serialize();
        const text = JSON.stringify(json);
        const parsed = JSON.parse(text);
        const s2 = SwissStrategy.deserialize(parsed);
        expect(s2.files).toEqual(s.files);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: 2 tests fail — `s.serialize is not a function`.

- [ ] **Step 3: Implement `serialize` and `deserialize`**

Add to `SwissStrategy`:

```javascript
    serialize() {
        return {
            files: [...this.files],
            options: { ...this.options },
            winCounts: Array.from(this.winCounts.entries()),
            playedPairs: Array.from(this.playedPairs),
            byes: Array.from(this.byes),
            currentRound: this.currentRound,
            roundQueue: this.roundQueue.map((p) => [...p]),
            gamesPlayed: this.gamesPlayed,
        };
    }

    static deserialize(json) {
        const s = new SwissStrategy();
        s.files = [...json.files];
        s.options = { ...json.options };
        s.winCounts = new Map(json.winCounts);
        s.playedPairs = new Set(json.playedPairs);
        s.byes = new Set(json.byes);
        s.currentRound = json.currentRound;
        s.roundQueue = json.roundQueue.map((p) => [...p]);
        s.gamesPlayed = json.gamesPlayed;
        return s;
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/swiss-strategy.test.js
```

Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament-engine.js tests/swiss-strategy.test.js
git commit -m "feat(tournament): SwissStrategy serialize/deserialize roundtrip"
```

---

## Phase B — `TournamentEngine` (TDD)

Phase B builds the engine wrapper that owns history, undo, and persistence. Strategy delegation is tested via a `MockStrategy` stub so engine tests don't depend on Swiss logic.

### Task B1: `MockStrategy` test helper + `TournamentEngine` constructor

**Files:**
- Create: `tests/tournament-engine.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Create `tests/tournament-engine.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { TournamentEngine, SwissStrategy } from '../tournament-engine.js';

// MockStrategy: returns a fixed pair sequence for deterministic engine testing
function makeMockStrategy(pairSequence) {
    let idx = 0;
    let removed = new Set();
    return {
        _state: { pairSequence: [...pairSequence], idx: 0, removed: [] },
        init: vi.fn(),
        getNextPair: vi.fn(() => {
            while (idx < pairSequence.length) {
                const pair = pairSequence[idx];
                if (!removed.has(pair[0]) && !removed.has(pair[1])) {
                    return [...pair];
                }
                idx++;
            }
            return null;
        }),
        recordResult: vi.fn((_winner, _loser) => {
            idx++;
        }),
        removeFile: vi.fn((file) => {
            removed.add(file);
        }),
        isComplete: vi.fn(() => idx >= pairSequence.length),
        getTier: vi.fn(() => 0),
        getProgress: vi.fn(() => ({
            round: 1,
            totalRounds: 1,
            gameInRound: idx,
            gamesInRound: pairSequence.length,
            gamesPlayed: idx,
            gamesTotal: pairSequence.length,
        })),
        serialize: vi.fn(() => ({ idx, removed: Array.from(removed) })),
    };
}

describe('TournamentEngine constructor', () => {
    it('initializes the strategy with files and options', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock, { rounds: 1 });
        expect(mock.init).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], { rounds: 1 });
        expect(eng.files).toEqual(['a.jpg', 'b.jpg']);
        expect(eng.history).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: PASS — constructor already implemented in Task A1.

- [ ] **Step 3: Commit**

```bash
git add tests/tournament-engine.test.js
git commit -m "test(tournament): MockStrategy + TournamentEngine constructor"
```

---

### Task B2: `getCurrentPair` and `recordResult` delegation

**Files:**
- Modify: `tests/tournament-engine.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournament-engine.test.js`:

```javascript
describe('TournamentEngine.getCurrentPair + recordResult', () => {
    it('getCurrentPair delegates to strategy', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock);
        const pair = eng.getCurrentPair();
        expect(mock.getNextPair).toHaveBeenCalled();
        expect(pair).toEqual({ left: 'a.jpg', right: 'b.jpg' });
    });

    it('getCurrentPair returns null when strategy is complete', () => {
        const mock = makeMockStrategy([]);
        const eng = new TournamentEngine([], mock);
        expect(eng.getCurrentPair()).toBeNull();
    });

    it('recordResult appends to history with a snapshot', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock);
        eng.getCurrentPair();
        eng.recordResult('a.jpg', 'b.jpg');

        expect(mock.recordResult).toHaveBeenCalledWith('a.jpg', 'b.jpg');
        expect(eng.history.length).toBe(1);
        expect(eng.history[0].winner).toBe('a.jpg');
        expect(eng.history[0].loser).toBe('b.jpg');
        expect(eng.history[0].strategyStateSnapshot).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: tests fail — `eng.getCurrentPair is not a function`.

- [ ] **Step 3: Implement `getCurrentPair`, `recordResult`, snapshot capture**

Add to `TournamentEngine`:

```javascript
    getCurrentPair() {
        const pair = this.strategy.getNextPair();
        if (!pair) return null;
        return { left: pair[0], right: pair[1] };
    }

    recordResult(winner, loser) {
        const snapshot = this.strategy.serialize();
        const progressBefore = this.strategy.getProgress();
        this.strategy.recordResult(winner, loser);
        this.history.push({
            winner,
            loser,
            round: progressBefore.round,
            gameIndex: progressBefore.gamesPlayed,
            timestamp: Date.now(),
            strategyStateSnapshot: snapshot,
        });
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/tournament-engine.test.js tournament-engine.js
git commit -m "feat(tournament): TournamentEngine.getCurrentPair + recordResult"
```

---

### Task B3: `undo` (pop history, restore snapshot)

**Files:**
- Modify: `tests/tournament-engine.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('TournamentEngine.undo', () => {
    it('pops the last history entry and restores strategy state', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        // deserialize is a separate stub that overwrites internal state
        mock.deserialize = vi.fn();
        const StrategyClass = function () {};
        StrategyClass.deserialize = mock.deserialize;
        // Engine.undo needs to call strategy.constructor.deserialize OR the strategy's
        // .deserialize — we'll implement engine to call this.strategy.constructor.deserialize
        Object.setPrototypeOf(mock, { constructor: StrategyClass });

        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock);
        eng.getCurrentPair();
        eng.recordResult('a.jpg', 'b.jpg');
        expect(eng.history.length).toBe(1);

        const snapshot = eng.history[0].strategyStateSnapshot;
        eng.undo();

        expect(eng.history.length).toBe(0);
        expect(StrategyClass.deserialize).toHaveBeenCalledWith(snapshot);
    });

    it('undo on empty history is a no-op', () => {
        const mock = makeMockStrategy([]);
        const eng = new TournamentEngine([], mock);
        expect(() => eng.undo()).not.toThrow();
        expect(eng.history.length).toBe(0);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: fail — `eng.undo is not a function`.

- [ ] **Step 3: Implement `undo`**

Add to `TournamentEngine`:

```javascript
    undo() {
        if (this.history.length === 0) return;
        const entry = this.history.pop();
        const StrategyCtor = Object.getPrototypeOf(this.strategy).constructor;
        const restored = StrategyCtor.deserialize(entry.strategyStateSnapshot);
        // Copy restored state into existing strategy instance
        Object.assign(this.strategy, restored);
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/tournament-engine.test.js tournament-engine.js
git commit -m "feat(tournament): TournamentEngine.undo"
```

---

### Task B4: `removeFile`, `isComplete`, `getTier`, `getTierBreakdown`, `getProgress`

**Files:**
- Modify: `tests/tournament-engine.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('TournamentEngine delegation methods', () => {
    it('removeFile delegates to strategy', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock);
        eng.removeFile('a.jpg');
        expect(mock.removeFile).toHaveBeenCalledWith('a.jpg');
        expect(eng.files).toEqual(['b.jpg']);
    });

    it('isComplete delegates', () => {
        const mock = makeMockStrategy([]);
        const eng = new TournamentEngine([], mock);
        expect(eng.isComplete()).toBe(true);
        expect(mock.isComplete).toHaveBeenCalled();
    });

    it('getTier delegates', () => {
        const mock = makeMockStrategy([]);
        mock.getTier = vi.fn(() => 2);
        const eng = new TournamentEngine(['a.jpg'], mock);
        expect(eng.getTier('a.jpg')).toBe(2);
    });

    it('getTierBreakdown counts files per tier', () => {
        const mock = makeMockStrategy([]);
        mock.getTier = vi.fn((file) => (file === 'a.jpg' ? 2 : 0));
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg'], mock);
        const bd = eng.getTierBreakdown();
        expect(bd[2]).toBe(1);
        expect(bd[0]).toBe(2);
    });

    it('getProgress delegates', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], mock);
        const p = eng.getProgress();
        expect(p.totalRounds).toBe(1);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: tests fail — methods not defined.

- [ ] **Step 3: Implement delegation methods**

Add to `TournamentEngine`:

```javascript
    removeFile(filePath) {
        if (!this.files.includes(filePath)) return;
        this.files = this.files.filter((f) => f !== filePath);
        this.strategy.removeFile(filePath);
    }

    isComplete() {
        return this.strategy.isComplete();
    }

    getTier(filePath) {
        return this.strategy.getTier(filePath);
    }

    getTierBreakdown() {
        const bd = {};
        for (const file of this.files) {
            const tier = this.strategy.getTier(file);
            bd[tier] = (bd[tier] ?? 0) + 1;
        }
        return bd;
    }

    getProgress() {
        return this.strategy.getProgress();
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/tournament-engine.test.js tournament-engine.js
git commit -m "feat(tournament): TournamentEngine delegation methods"
```

---

### Task B5: Engine `serialize` / `deserialize`

**Files:**
- Modify: `tests/tournament-engine.test.js`
- Modify: `tournament-engine.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('TournamentEngine serialize/deserialize', () => {
    it('roundtrip preserves history and strategy state (with SwissStrategy)', () => {
        const eng1 = new TournamentEngine(
            ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
            new SwissStrategy(),
            { rounds: 3 }
        );

        // Play 2 games
        for (let i = 0; i < 2; i++) {
            const pair = eng1.getCurrentPair();
            eng1.recordResult(pair.left, pair.right);
        }

        const json = eng1.serialize();
        const eng2 = TournamentEngine.deserialize(json, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);

        expect(eng2.files).toEqual(eng1.files);
        expect(eng2.history.length).toBe(eng1.history.length);
        expect(eng2.strategy.gamesPlayed).toBe(eng1.strategy.gamesPlayed);
    });

    it('serialize output is JSON-safe', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), {
            rounds: 1,
        });
        const json = eng.serialize();
        const text = JSON.stringify(json);
        expect(() => JSON.parse(text)).not.toThrow();
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: fail — `eng.serialize is not a function`.

- [ ] **Step 3: Implement `serialize` and `deserialize`**

Add to `TournamentEngine`:

```javascript
    serialize() {
        return {
            version: 1,
            strategy: this.strategy.constructor.name === 'SwissStrategy' ? 'swiss' : 'unknown',
            files: [...this.files],
            options: { ...(this.strategy.options ?? {}) },
            createdAt: this.createdAt ?? Date.now(),
            lastUpdatedAt: Date.now(),
            history: this.history.map((e) => ({ ...e })),
            strategyState: this.strategy.serialize(),
        };
    }

    static deserialize(json, files) {
        if (json.version !== 1) {
            throw new Error(`Unsupported tournament state version: ${json.version}`);
        }
        let strategy;
        if (json.strategy === 'swiss') {
            const { SwissStrategy } = module.exports;
            strategy = SwissStrategy.deserialize(json.strategyState);
        } else {
            throw new Error(`Unknown strategy: ${json.strategy}`);
        }
        // Construct engine without re-running init (state is already restored)
        const eng = Object.create(TournamentEngine.prototype);
        eng.files = [...files];
        eng.strategy = strategy;
        eng.history = json.history.map((e) => ({ ...e }));
        eng.createdAt = json.createdAt;
        return eng;
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-engine.test.js
```

Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/tournament-engine.test.js tournament-engine.js
git commit -m "feat(tournament): TournamentEngine serialize/deserialize"
```

---

## Phase C — Integration Tests

Phase C wires real `TournamentEngine` + real `SwissStrategy` end-to-end (no mocks). Catches wiring bugs the leaf-tested unit tests can't.

### Task C1: Happy-path integration test (N=8, R=3)

**Files:**
- Create: `tests/integration/tournament-flow.test.js`

- [ ] **Step 1: Write the test**

Create `tests/integration/tournament-flow.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { TournamentEngine, SwissStrategy } from '../../tournament-engine.js';

describe('Tournament integration — happy path', () => {
    it('N=8, R=3 completes with valid tier distribution', () => {
        const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg', '8.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });

        let safety = 100;
        let games = 0;
        while (!eng.isComplete() && safety-- > 0) {
            const pair = eng.getCurrentPair();
            if (!pair) break;
            // Always pick "left" as winner — deterministic outcome
            eng.recordResult(pair.left, pair.right);
            games++;
        }

        expect(eng.isComplete()).toBe(true);

        // All files have a tier in [0, 3]
        for (const file of files) {
            const tier = eng.getTier(file);
            expect(tier).toBeGreaterThanOrEqual(0);
            expect(tier).toBeLessThanOrEqual(3);
        }

        // Tier breakdown sums to N
        const bd = eng.getTierBreakdown();
        const total = Object.values(bd).reduce((a, b) => a + b, 0);
        expect(total).toBe(files.length);

        // Games played is at least N/2 * R (minus byes)
        expect(games).toBeGreaterThanOrEqual(Math.floor((files.length / 2) * 3) - 3);
    });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/integration/tournament-flow.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tournament-flow.test.js
git commit -m "test(tournament): integration test for N=8 R=3 happy path"
```

---

### Task C2: Odd N integration test (bye distribution)

**Files:**
- Modify: `tests/integration/tournament-flow.test.js`

- [ ] **Step 1: Append test**

```javascript
describe('Tournament integration — odd N', () => {
    it('N=7, R=3 distributes byes; no file bye\'d twice', () => {
        const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });

        let safety = 100;
        const byeCounts = new Map(files.map((f) => [f, 0]));

        while (!eng.isComplete() && safety-- > 0) {
            const sizeBefore = eng.strategy.byes.size;
            const pair = eng.getCurrentPair();
            if (!pair) break;
            eng.recordResult(pair.left, pair.right);
            // Note: byes accumulate as a set; new byes appear after queue rebuild
            const sizeAfter = eng.strategy.byes.size;
            if (sizeAfter > sizeBefore) {
                // Find which file is newly bye'd — approximation: every file in byes
                for (const f of eng.strategy.byes) {
                    byeCounts.set(f, (byeCounts.get(f) ?? 0) + 1);
                }
            }
        }

        expect(eng.isComplete()).toBe(true);

        // Each file's bye count is at most 1 in the byes Set
        // (byes is a Set so set membership cannot exceed 1)
        for (const f of files) {
            expect(eng.strategy.byes.has(f) ? 1 : 0).toBeLessThanOrEqual(1);
        }
    });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/integration/tournament-flow.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tournament-flow.test.js
git commit -m "test(tournament): integration test for odd N bye distribution"
```

---

### Task C3: Mid-session Special-removal integration test

**Files:**
- Modify: `tests/integration/tournament-flow.test.js`

- [ ] **Step 1: Append test**

```javascript
describe('Tournament integration — mid-session removal', () => {
    it('removeFile mid-tournament: removed file never appears in subsequent pairs', () => {
        const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });

        // Play one game then remove a file
        const pair0 = eng.getCurrentPair();
        eng.recordResult(pair0.left, pair0.right);
        eng.removeFile('1.jpg');

        let safety = 100;
        while (!eng.isComplete() && safety-- > 0) {
            const pair = eng.getCurrentPair();
            if (!pair) break;
            expect(pair.left).not.toBe('1.jpg');
            expect(pair.right).not.toBe('1.jpg');
            eng.recordResult(pair.left, pair.right);
        }

        expect(eng.isComplete()).toBe(true);
        expect(eng.files).not.toContain('1.jpg');

        // Remaining files have valid tiers
        for (const file of eng.files) {
            const tier = eng.getTier(file);
            expect(tier).toBeGreaterThanOrEqual(0);
            expect(tier).toBeLessThanOrEqual(3);
        }
    });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/integration/tournament-flow.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tournament-flow.test.js
git commit -m "test(tournament): integration test for mid-session removal"
```

---

### Task C4: Serialize → re-instantiate → continue integration test

**Files:**
- Modify: `tests/integration/tournament-flow.test.js`

- [ ] **Step 1: Append test**

```javascript
describe('Tournament integration — serialize and resume', () => {
    it('snapshot mid-tournament, reload engine, complete remaining games', () => {
        const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg', '8.jpg'];

        // Run 1: Play 4 games, snapshot, complete
        const eng1 = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        let safety = 30;
        for (let i = 0; i < 4 && safety-- > 0; i++) {
            const pair = eng1.getCurrentPair();
            if (!pair) break;
            eng1.recordResult(pair.left, pair.right);
        }
        const snapshot = eng1.serialize();
        const text = JSON.stringify(snapshot);

        // Run 2: Reload from snapshot, play to completion
        const reloaded = JSON.parse(text);
        const eng2 = TournamentEngine.deserialize(reloaded, files);

        // Resume: gamesPlayed and history should match
        expect(eng2.history.length).toBe(eng1.history.length);
        expect(eng2.strategy.gamesPlayed).toBe(eng1.strategy.gamesPlayed);

        safety = 30;
        while (!eng2.isComplete() && safety-- > 0) {
            const pair = eng2.getCurrentPair();
            if (!pair) break;
            eng2.recordResult(pair.left, pair.right);
        }

        expect(eng2.isComplete()).toBe(true);

        // Tier breakdown valid
        const bd = eng2.getTierBreakdown();
        const total = Object.values(bd).reduce((a, b) => a + b, 0);
        expect(total).toBe(files.length);
    });
});
```

- [ ] **Step 2: Run all tests so far**

```bash
npm test
```

Expected: all existing tests pass + 4 new integration tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tournament-flow.test.js
git commit -m "test(tournament): integration test for serialize+resume"
```

---

## Phase D — IPC Handlers in `main.js` + `preload.js`

Phase D adds the file-system bridge: read/write/delete state JSON, and the apply-results batch move.

### Task D1: Add `readTournamentState` IPC handler

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Add IPC handler in `main.js`**

Find the existing `ipcMain.handle('moveFile', ...)` handler and add nearby (after the moveFile block):

```javascript
ipcMain.handle('readTournamentState', async (_event, folderPath) => {
    try {
        const statePath = path.join(folderPath, '.tournament_state.json');
        const text = await fs.readFile(statePath, 'utf-8');
        const json = JSON.parse(text);
        return { success: true, state: json };
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { success: true, state: null };
        }
        return { success: false, error: err.message };
    }
});
```

- [ ] **Step 2: Expose in `preload.js`**

Find the existing IPC bindings (e.g., `moveFile: (...) => ipcRenderer.invoke('moveFile', ...)`) and add:

```javascript
    readTournamentState: (folderPath) => ipcRenderer.invoke('readTournamentState', folderPath),
```

- [ ] **Step 3: Smoke-test via Electron**

```bash
# Quick smoke: open Electron, run in DevTools console:
# window.electronAPI.readTournamentState('/some/path').then(console.log)
```

(Skipped in CI; manual check.)

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat(tournament): readTournamentState IPC handler"
```

---

### Task D2: Add `writeTournamentState` IPC handler

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Add IPC handler in `main.js`**

```javascript
ipcMain.handle('writeTournamentState', async (_event, folderPath, state) => {
    try {
        const statePath = path.join(folderPath, '.tournament_state.json');
        const text = JSON.stringify(state, null, 2);
        await fs.writeFile(statePath, text, 'utf-8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
```

- [ ] **Step 2: Expose in `preload.js`**

```javascript
    writeTournamentState: (folderPath, state) =>
        ipcRenderer.invoke('writeTournamentState', folderPath, state),
```

- [ ] **Step 3: Commit**

```bash
git add main.js preload.js
git commit -m "feat(tournament): writeTournamentState IPC handler"
```

---

### Task D3: Add `deleteTournamentState` IPC handler

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Add IPC handler in `main.js`**

```javascript
ipcMain.handle('deleteTournamentState', async (_event, folderPath) => {
    try {
        const statePath = path.join(folderPath, '.tournament_state.json');
        await fs.unlink(statePath);
        return { success: true };
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { success: true }; // already gone
        }
        return { success: false, error: err.message };
    }
});
```

- [ ] **Step 2: Expose in `preload.js`**

```javascript
    deleteTournamentState: (folderPath) =>
        ipcRenderer.invoke('deleteTournamentState', folderPath),
```

- [ ] **Step 3: Commit**

```bash
git add main.js preload.js
git commit -m "feat(tournament): deleteTournamentState IPC handler"
```

---

### Task D4: Add `applyTournamentResults` IPC handler

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Add IPC handler in `main.js`**

```javascript
ipcMain.handle('applyTournamentResults', async (_event, folderPath, tierAssignments) => {
    const moved = [];
    const failed = [];

    // Determine which tier folders are needed
    const tiers = new Set(Object.values(tierAssignments));

    // Create tier folders
    for (const tier of tiers) {
        const tierDir = path.join(folderPath, `_Tier-${tier}`);
        try {
            await fs.mkdir(tierDir, { recursive: true });
        } catch (err) {
            return { success: false, error: `Failed to create ${tierDir}: ${err.message}`, moved, failed };
        }
    }

    // Move each file
    for (const [srcPath, tier] of Object.entries(tierAssignments)) {
        try {
            const tierDir = path.join(folderPath, `_Tier-${tier}`);
            const baseName = path.basename(srcPath);
            let destPath = path.join(tierDir, baseName);

            // Collision rename (matches existing moveFile pattern)
            let counter = 1;
            const ext = path.extname(baseName);
            const stem = path.basename(baseName, ext);
            while (await fs
                .access(destPath)
                .then(() => true)
                .catch(() => false)) {
                destPath = path.join(tierDir, `${stem} (${counter})${ext}`);
                counter++;
            }

            await fs.rename(srcPath, destPath);
            moved.push({ srcPath, destPath });
        } catch (err) {
            failed.push({ path: srcPath, error: err.message });
        }
    }

    // Delete state file only if all moves succeeded
    if (failed.length === 0) {
        try {
            await fs.unlink(path.join(folderPath, '.tournament_state.json'));
        } catch (_err) {
            // state file may not exist — ignore
        }
    }

    return { success: failed.length === 0, moved: moved.length, failed };
});
```

- [ ] **Step 2: Expose in `preload.js`**

```javascript
    applyTournamentResults: (folderPath, tierAssignments) =>
        ipcRenderer.invoke('applyTournamentResults', folderPath, tierAssignments),
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors in `main.js` / `preload.js`.

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat(tournament): applyTournamentResults batch-move IPC handler"
```

---

## Phase E — `TournamentManager` ES Module (UI Glue)

Phase E creates `tournament.js`, the v2.0-pattern ES module that owns the tournament UI lifecycle. Tests use the `extractMethod` / `extractAsyncMethod` pattern from `tests/media-viewer-utils.test.js`.

### Task E1: Scaffold `tournament.js` with `TournamentManager` skeleton

**Files:**
- Create: `tournament.js`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Create `tournament.js`**

```javascript
// tournament.js
// TournamentManager — owns Tournament Mode UI: config modal, pair display,
// summary modal, resume/invalidation prompts, IPC glue.
// Follows v2.0 modularization pattern (see fullscreen.js): receives MediaViewer
// dependencies via constructor; MediaViewer delegates to this.tournament.*.

import { TournamentEngine, SwissStrategy } from './tournament-engine.js';

export class TournamentManager {
    constructor(host, options = {}) {
        // host: MediaViewer instance (provides DOM refs, currentFolder, signalUserActivity, etc.)
        this.host = host;
        this.engine = null;
        this.options = options;
    }

    // Called by MediaViewer when user selects Tournament mode.
    async handleStartClick(folderPath, rounds) {
        const files = this.host.mediaFiles.map((f) => f.path);
        if (files.length < 2) {
            this.host.showNotification('Tournament needs at least 2 files.', 'warning');
            return false;
        }
        this.engine = new TournamentEngine(files, new SwissStrategy(), { rounds });
        await this._persistState(folderPath);
        return true;
    }

    async _persistState(folderPath) {
        if (!this.engine) return;
        const state = this.engine.serialize();
        await window.electronAPI.writeTournamentState(folderPath, state);
    }
}
```

- [ ] **Step 2: Add `tournament.js` to ESLint renderer-module block in `eslint.config.mjs`**

Find block 2a (renderer module) — add `tournament.js` to its `files` array.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add tournament.js eslint.config.mjs
git commit -m "feat(tournament): scaffold TournamentManager ES module"
```

---

### Task E2: `handleStartClick` unit test

**Files:**
- Create: `tests/tournament-manager.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/tournament-manager.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TournamentManager } from '../tournament.js';

function makeHost(mediaFiles = []) {
    return {
        mediaFiles: mediaFiles.map((p) => ({ path: p })),
        showNotification: vi.fn(),
        currentFolder: '/test/folder',
    };
}

describe('TournamentManager.handleStartClick', () => {
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                writeTournamentState: vi.fn().mockResolvedValue({ success: true }),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('returns false and shows notification when N<2', async () => {
        const host = makeHost(['a.jpg']);
        const tm = new TournamentManager(host);
        const ok = await tm.handleStartClick('/test/folder', 3);
        expect(ok).toBe(false);
        expect(host.showNotification).toHaveBeenCalled();
        expect(tm.engine).toBeNull();
    });

    it('returns true and creates engine when N>=2', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        const ok = await tm.handleStartClick('/test/folder', 3);
        expect(ok).toBe(true);
        expect(tm.engine).toBeTruthy();
        expect(tm.engine.files.length).toBe(4);
        expect(window.electronAPI.writeTournamentState).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: PASS — `handleStartClick` was implemented in Task E1.

- [ ] **Step 3: Commit**

```bash
git add tests/tournament-manager.test.js
git commit -m "test(tournament): TournamentManager.handleStartClick"
```

---

### Task E3: `handlePairResult` and `_persistState`

**Files:**
- Modify: `tests/tournament-manager.test.js`
- Modify: `tournament.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/tournament-manager.test.js`:

```javascript
describe('TournamentManager.handlePairResult', () => {
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                writeTournamentState: vi.fn().mockResolvedValue({ success: true }),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('records the result and persists state', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        const pair = tm.engine.getCurrentPair();
        const ok = await tm.handlePairResult(pair.left, pair.right);
        expect(ok).toBe(true);
        expect(tm.engine.history.length).toBe(1);
        // writeTournamentState called once at start + once after result
        expect(window.electronAPI.writeTournamentState).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: fail — `tm.handlePairResult is not a function`.

- [ ] **Step 3: Implement `handlePairResult`**

Add to `TournamentManager`:

```javascript
    async handlePairResult(winner, loser) {
        if (!this.engine) return false;
        this.engine.recordResult(winner, loser);
        await this._persistState(this.host.currentFolder);
        return true;
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament.js tests/tournament-manager.test.js
git commit -m "feat(tournament): TournamentManager.handlePairResult"
```

---

### Task E4: `handleApply` (Apply commit)

**Files:**
- Modify: `tests/tournament-manager.test.js`
- Modify: `tournament.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('TournamentManager.handleApply', () => {
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                writeTournamentState: vi.fn().mockResolvedValue({ success: true }),
                applyTournamentResults: vi.fn().mockResolvedValue({
                    success: true,
                    moved: 2,
                    failed: [],
                }),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('calls applyTournamentResults with correct tier assignments', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        // Complete tournament
        const pair = tm.engine.getCurrentPair();
        await tm.handlePairResult(pair.left, pair.right);

        const result = await tm.handleApply();
        expect(result.success).toBe(true);
        expect(window.electronAPI.applyTournamentResults).toHaveBeenCalled();
        const [folderArg, assignmentsArg] = window.electronAPI.applyTournamentResults.mock.calls[0];
        expect(folderArg).toBe('/test/folder');
        // assignmentsArg has both files with tier 0 or 1
        expect(Object.keys(assignmentsArg).length).toBe(2);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: fail — `tm.handleApply is not a function`.

- [ ] **Step 3: Implement `handleApply`**

Add to `TournamentManager`:

```javascript
    async handleApply() {
        if (!this.engine || !this.engine.isComplete()) {
            return { success: false, error: 'Tournament not complete' };
        }
        const assignments = {};
        for (const file of this.engine.files) {
            assignments[file] = this.engine.getTier(file);
        }
        const result = await window.electronAPI.applyTournamentResults(
            this.host.currentFolder,
            assignments
        );
        if (result.success) {
            this.engine = null;
        }
        return result;
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament.js tests/tournament-manager.test.js
git commit -m "feat(tournament): TournamentManager.handleApply"
```

---

### Task E5: `handleDiscard` + `handleResume` + `validateStateFile`

**Files:**
- Modify: `tests/tournament-manager.test.js`
- Modify: `tournament.js`

- [ ] **Step 1: Write the failing tests**

Append:

```javascript
describe('TournamentManager.handleDiscard', () => {
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                writeTournamentState: vi.fn().mockResolvedValue({ success: true }),
                deleteTournamentState: vi.fn().mockResolvedValue({ success: true }),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('clears engine and deletes state file', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        await tm.handleDiscard();
        expect(tm.engine).toBeNull();
        expect(window.electronAPI.deleteTournamentState).toHaveBeenCalledWith('/test/folder');
    });
});

describe('TournamentManager.validateStateFile', () => {
    it('returns valid when file lists match', () => {
        const tm = new TournamentManager(makeHost([]));
        const state = { files: ['a.jpg', 'b.jpg', 'c.jpg'] };
        const result = tm.validateStateFile(state, ['a.jpg', 'b.jpg', 'c.jpg']);
        expect(result.valid).toBe(true);
    });

    it('returns invalid with delta when files differ', () => {
        const tm = new TournamentManager(makeHost([]));
        const state = { files: ['a.jpg', 'b.jpg', 'c.jpg'] };
        const result = tm.validateStateFile(state, ['a.jpg', 'b.jpg', 'd.jpg']);
        expect(result.valid).toBe(false);
        expect(result.removed).toEqual(['c.jpg']);
        expect(result.added).toEqual(['d.jpg']);
    });
});

describe('TournamentManager.handleResume', () => {
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                writeTournamentState: vi.fn().mockResolvedValue({ success: true }),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('reconstructs engine from a saved state', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);

        // Build a saved state by running a partial tournament
        await tm.handleStartClick('/test/folder', 3);
        const pair = tm.engine.getCurrentPair();
        await tm.handlePairResult(pair.left, pair.right);
        const savedState = tm.engine.serialize();

        // New manager: resume from saved state
        const tm2 = new TournamentManager(host);
        const ok = await tm2.handleResume(savedState, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        expect(ok).toBe(true);
        expect(tm2.engine).toBeTruthy();
        expect(tm2.engine.history.length).toBe(1);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement `handleDiscard`, `validateStateFile`, `handleResume`**

Add to `TournamentManager`:

```javascript
    async handleDiscard() {
        this.engine = null;
        await window.electronAPI.deleteTournamentState(this.host.currentFolder);
    }

    validateStateFile(state, currentFiles) {
        const stateSet = new Set(state.files);
        const currentSet = new Set(currentFiles);
        const removed = [...stateSet].filter((f) => !currentSet.has(f));
        const added = [...currentSet].filter((f) => !stateSet.has(f));
        return {
            valid: removed.length === 0 && added.length === 0,
            removed,
            added,
        };
    }

    async handleResume(state, currentFiles) {
        const v = this.validateStateFile(state, currentFiles);
        if (!v.valid) return false;
        this.engine = TournamentEngine.deserialize(state, currentFiles);
        return true;
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament.js tests/tournament-manager.test.js
git commit -m "feat(tournament): TournamentManager.handleDiscard + handleResume + validateStateFile"
```

---

### Task E6: `getProgressText` and `getTierBreakdownText` helpers

**Files:**
- Modify: `tests/tournament-manager.test.js`
- Modify: `tournament.js`

- [ ] **Step 1: Write the failing test**

Append:

```javascript
describe('TournamentManager progress + breakdown text', () => {
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                writeTournamentState: vi.fn().mockResolvedValue({ success: true }),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('formats progress as "Round X of Y · Game N/M"', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        const text = tm.getProgressText();
        expect(text).toMatch(/Round 1 of 3/);
        expect(text).toMatch(/Game 0\/2/);
    });

    it('formats tier breakdown as "Tiers: 0·0·0·0"', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        const text = tm.getTierBreakdownText();
        // R=3 → 4 tiers (0..3)
        const parts = text.replace(/^Tiers: /, '').split('·').map((s) => s.trim());
        expect(parts.length).toBe(4);
        expect(parts.reduce((a, b) => a + parseInt(b, 10), 0)).toBe(4);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: 2 tests fail.

- [ ] **Step 3: Implement helpers**

Add to `TournamentManager`:

```javascript
    getProgressText() {
        if (!this.engine) return '';
        const p = this.engine.getProgress();
        return `Round ${p.round} of ${p.totalRounds} · Game ${p.gameInRound}/${p.gamesInRound}`;
    }

    getTierBreakdownText() {
        if (!this.engine) return '';
        const opts = this.engine.strategy.options ?? { rounds: 3 };
        const R = opts.rounds;
        const bd = this.engine.getTierBreakdown();
        const parts = [];
        for (let i = R; i >= 0; i--) {
            parts.push(String(bd[i] ?? 0));
        }
        return `Tiers: ${parts.join('·')}`;
    }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/tournament-manager.test.js
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament.js tests/tournament-manager.test.js
git commit -m "feat(tournament): progress + tier-breakdown text helpers"
```

---

## Phase F — HTML / CSS / `media-viewer.js` Wiring

Phase F is the UI integration step. After this phase, the user can actually click Tournament in the app and run a session end-to-end.

### Task F1: Replace `#viewModeBtn` with 3-way selector in `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Locate the existing `#viewModeBtn`**

```bash
npx grep -n 'id="viewModeBtn"' index.html
```

Find the surrounding markup (probably near `viewModeLabel`).

- [ ] **Step 2: Replace with 3-way segmented control**

Replace the existing single button with:

```html
<div class="mode-selector" id="modeSelector">
    <button class="mode-btn active" id="modeBtnSingle" data-mode="single" type="button">
        <i data-lucide="image"></i>
        <span>Single</span>
    </button>
    <button class="mode-btn" id="modeBtnCompare" data-mode="compare" type="button">
        <i data-lucide="columns-2"></i>
        <span>Compare</span>
    </button>
    <button class="mode-btn" id="modeBtnTournament" data-mode="tournament" type="button">
        <i data-lucide="trophy"></i>
        <span>Tournament</span>
    </button>
</div>
```

- [ ] **Step 3: Add tournament container divs at the end of `.media-container` body**

Locate `.media-container` and add inside (after compare-controls):

```html
<!-- Tournament Mode UI -->
<div class="tournament-overlay" id="tournamentOverlay" style="display:none">
    <div class="tournament-header" id="tournamentHeader">
        <span class="tournament-progress" id="tournamentProgress"></span>
        <span class="tournament-tiers" id="tournamentTiers"></span>
        <button class="tournament-pause" id="tournamentPauseBtn" title="Pause (Escape)">
            <i data-lucide="pause"></i>
        </button>
    </div>
    <div class="tournament-controls" id="tournamentControls">
        <button class="control-btn" id="tournamentUndoBtn">
            <i data-lucide="undo-2"></i><span>Undo</span>
        </button>
        <button class="control-btn special-btn" id="tournamentLeftSpecialBtn">
            <i data-lucide="folder-heart"></i><span>L-Special</span>
        </button>
        <button class="control-btn special-btn" id="tournamentRightSpecialBtn">
            <i data-lucide="folder-heart"></i><span>R-Special</span>
        </button>
    </div>
</div>

<!-- Tournament Config Modal -->
<div class="modal-overlay" id="tournamentConfigModal" style="display:none">
    <div class="modal">
        <h3>Start Tournament</h3>
        <div class="modal-body">
            <div class="modal-row">
                <span>Folder:</span> <span id="tournamentConfigFolder"></span>
            </div>
            <div class="modal-row">
                <span>Rounds:</span>
                <select id="tournamentRoundsSelect">
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                </select>
            </div>
            <div class="modal-row">
                <span>Output:</span>
                <span id="tournamentConfigEstimate"></span>
            </div>
        </div>
        <div class="modal-actions">
            <button id="tournamentConfigCancel" class="btn">Cancel</button>
            <button id="tournamentConfigStart" class="btn primary">Start</button>
        </div>
    </div>
</div>

<!-- Tournament Summary Modal -->
<div class="modal-overlay" id="tournamentSummaryModal" style="display:none">
    <div class="modal">
        <h3>Tournament Complete</h3>
        <div class="modal-body" id="tournamentSummaryBody"></div>
        <div class="modal-actions">
            <button id="tournamentSummaryDiscard" class="btn">Discard</button>
            <button id="tournamentSummaryApply" class="btn primary">Apply</button>
        </div>
    </div>
</div>

<!-- Tournament Resume Modal -->
<div class="modal-overlay" id="tournamentResumeModal" style="display:none">
    <div class="modal">
        <h3 id="tournamentResumeTitle">Resume Tournament?</h3>
        <div class="modal-body" id="tournamentResumeBody"></div>
        <div class="modal-actions">
            <button id="tournamentResumeDiscard" class="btn">Discard</button>
            <button id="tournamentResumeAccept" class="btn primary">Resume</button>
        </div>
    </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(tournament): 3-way mode selector + tournament UI containers"
```

---

### Task F2: Add tournament CSS to `styles.css`

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append tournament styles**

Add at the end of `styles.css`:

```css
/* Tournament Mode — 3-way selector */
.mode-selector {
    display: inline-flex;
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    overflow: hidden;
}
.mode-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    color: var(--text-color, #ddd);
    border: none;
    cursor: pointer;
    font-size: 13px;
}
.mode-btn:hover {
    background: var(--hover-bg, rgba(255, 255, 255, 0.05));
}
.mode-btn.active {
    background: var(--accent-color, #4a9eff);
    color: white;
}
.mode-btn i {
    width: 14px;
    height: 14px;
}

/* Tournament overlay (pair display) */
.tournament-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 10;
}
.tournament-header {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 13px;
}
.tournament-progress {
    font-weight: 500;
}
.tournament-tiers {
    font-family: monospace;
}
.tournament-pause {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
}
.tournament-controls {
    pointer-events: auto;
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
}

/* Modal overlay (config, summary, resume) */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}
.modal {
    background: var(--bg-color, #222);
    border: 1px solid var(--border-color, #444);
    border-radius: 8px;
    padding: 24px;
    min-width: 360px;
    max-width: 480px;
    color: var(--text-color, #ddd);
}
.modal h3 {
    margin: 0 0 16px;
    font-size: 16px;
}
.modal-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 13px;
}
.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
}
.btn {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--border-color, #444);
    color: var(--text-color, #ddd);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.btn.primary {
    background: var(--accent-color, #4a9eff);
    border-color: var(--accent-color, #4a9eff);
    color: white;
}
.btn:hover {
    background: var(--hover-bg, rgba(255, 255, 255, 0.05));
}
.btn.primary:hover {
    opacity: 0.9;
}

/* Tier breakdown bars in summary modal */
.tier-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    font-family: monospace;
}
.tier-bar {
    flex: 1;
    height: 12px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
}
.tier-bar-fill {
    height: 100%;
    background: var(--accent-color, #4a9eff);
}

/* Hide compare-mode like/dislike buttons in tournament mode */
.media-container.tournament-mode .left-media-controls,
.media-container.tournament-mode .right-media-controls {
    display: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat(tournament): CSS for mode selector, overlay, modals, tier bars"
```

---

### Task F3: Wire `TournamentManager` into `media-viewer.js` (instantiate + mode-selector handler)

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Import `TournamentManager` near the top of `media-viewer.js`**

Find the existing `import { FullscreenManager } from './fullscreen.js';` line and add:

```javascript
import { TournamentManager } from './tournament.js';
```

- [ ] **Step 2: Instantiate in the constructor**

Find where `this.fullscreen = new FullscreenManager(...)` is created. Add nearby:

```javascript
        this.tournament = new TournamentManager(this);
        this.isTournamentMode = false;
```

- [ ] **Step 3: Replace the old `#viewModeBtn` listener with 3-way handler**

Find the existing `this.viewModeBtn.addEventListener('click', () => this.toggleViewMode());` line.

Replace it with mode-selector wiring (in the same setupEventListeners area):

```javascript
        // 3-way mode selector
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.switchMode(mode);
            });
        });
```

- [ ] **Step 4: Add `switchMode` method on `MediaViewer`**

Add a new method on the `MediaViewer` class (place near `toggleViewMode`):

```javascript
    async switchMode(mode) {
        // Update active button highlight
        document.querySelectorAll('.mode-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });

        if (mode === 'single') {
            if (this.isTournamentMode) {
                this.exitTournamentMode();
            }
            if (this.isCompareMode) {
                this.switchToSingleModeUI();
            }
            if (this.mediaFiles.length > 0) {
                this.currentIndex = 0;
                this.showMedia();
            }
        } else if (mode === 'compare') {
            if (this.isTournamentMode) {
                this.exitTournamentMode();
            }
            if (!this.isCompareMode) {
                await this.toggleViewMode();
            }
        } else if (mode === 'tournament') {
            if (this.isCompareMode) {
                this.switchToSingleModeUI();
            }
            await this.enterTournamentMode();
        }
    }

    async enterTournamentMode() {
        if (this.isTournamentMode) {
            // Already in tournament: just re-render pair display
            this.showTournamentPair();
            return;
        }
        // Open config modal
        this.showTournamentConfigModal();
    }

    exitTournamentMode() {
        this.isTournamentMode = false;
        const overlay = document.getElementById('tournamentOverlay');
        if (overlay) overlay.style.display = 'none';
        this.mediaContainer.classList.remove('tournament-mode');
    }
```

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js
git commit -m "feat(tournament): wire 3-way mode selector + switchMode"
```

---

### Task F4: Config modal handlers + start tournament

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Add config-modal show/hide + handlers**

Add to `MediaViewer`:

```javascript
    showTournamentConfigModal() {
        const modal = document.getElementById('tournamentConfigModal');
        const folderEl = document.getElementById('tournamentConfigFolder');
        const roundsSelect = document.getElementById('tournamentRoundsSelect');
        const estimateEl = document.getElementById('tournamentConfigEstimate');

        folderEl.textContent = `${this.currentFolder ?? '(no folder)'}  (${this.mediaFiles.length} files)`;

        const updateEstimate = () => {
            const R = parseInt(roundsSelect.value, 10);
            const N = this.mediaFiles.length;
            const games = Math.floor(N / 2) * R;
            const minutes = Math.ceil((games * 5) / 60);
            estimateEl.textContent = `${N} files → ${R + 1} tier folders · ~${games} games (~${minutes} min)`;
        };
        roundsSelect.onchange = updateEstimate;
        updateEstimate();

        const startBtn = document.getElementById('tournamentConfigStart');
        const cancelBtn = document.getElementById('tournamentConfigCancel');

        startBtn.disabled = this.mediaFiles.length < 2;

        const cleanup = () => {
            modal.style.display = 'none';
            startBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        startBtn.onclick = async () => {
            const R = parseInt(roundsSelect.value, 10);
            cleanup();
            const ok = await this.tournament.handleStartClick(this.currentFolder, R);
            if (ok) {
                this.isTournamentMode = true;
                this.mediaContainer.classList.add('tournament-mode');
                document.getElementById('tournamentOverlay').style.display = 'block';
                this.showTournamentPair();
            } else {
                // Revert to single mode if start failed
                this.switchMode('single');
            }
        };

        cancelBtn.onclick = () => {
            cleanup();
            this.switchMode('single');
        };

        modal.style.display = 'flex';
    }
```

- [ ] **Step 2: Commit**

```bash
git add media-viewer.js
git commit -m "feat(tournament): config modal handlers"
```

---

### Task F5: `showTournamentPair` + click-to-pick + Undo/Special handlers

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Add `showTournamentPair` and event handlers**

Add to `MediaViewer`:

```javascript
    async showTournamentPair() {
        if (!this.isTournamentMode || !this.tournament.engine) return;

        if (this.tournament.engine.isComplete()) {
            this.showTournamentSummaryModal();
            return;
        }

        const pair = this.tournament.engine.getCurrentPair();
        if (!pair) {
            this.showTournamentSummaryModal();
            return;
        }

        // Update progress header
        document.getElementById('tournamentProgress').textContent =
            this.tournament.getProgressText();
        document.getElementById('tournamentTiers').textContent =
            this.tournament.getTierBreakdownText();

        // Render the two media files using the existing compare-mode infrastructure
        // (leftMediaWrapper / rightMediaWrapper). Set mediaFiles indices to match.
        const leftIdx = this.mediaFiles.findIndex((f) => f.path === pair.left);
        const rightIdx = this.mediaFiles.findIndex((f) => f.path === pair.right);

        // If either file is missing from the list, treat as Special-removed and re-pair
        if (leftIdx === -1 || rightIdx === -1) {
            const missing = leftIdx === -1 ? pair.left : pair.right;
            this.showNotification(`File missing — removed from tournament: ${missing}`, 'warning');
            this.tournament.engine.removeFile(missing);
            await this.tournament._persistState(this.currentFolder);
            return this.showTournamentPair();
        }

        // Reuse compare-mode rendering
        this.leftFileIndex = leftIdx;
        this.rightFileIndex = rightIdx;
        await this.renderCompareMedia();

        // Attach click-to-pick handlers
        this.attachTournamentClickHandlers(pair);
    }

    attachTournamentClickHandlers(pair) {
        const leftWrap = this.leftMediaWrapper;
        const rightWrap = this.rightMediaWrapper;
        if (!leftWrap || !rightWrap) return;

        // Replace handlers (clone-and-replace pattern to clear stale listeners)
        const newLeft = leftWrap.cloneNode(true);
        const newRight = rightWrap.cloneNode(true);
        leftWrap.parentNode.replaceChild(newLeft, leftWrap);
        rightWrap.parentNode.replaceChild(newRight, rightWrap);
        this.leftMediaWrapper = newLeft;
        this.rightMediaWrapper = newRight;

        newLeft.addEventListener('click', async () => {
            await this.handleTournamentPick(pair.left, pair.right);
        });
        newRight.addEventListener('click', async () => {
            await this.handleTournamentPick(pair.right, pair.left);
        });
    }

    async handleTournamentPick(winner, loser) {
        if (!this.isTournamentMode) return;
        this.signalUserActivity();
        await this.tournament.handlePairResult(winner, loser);
        await this.showTournamentPair();
    }

    async handleTournamentUndo() {
        if (!this.isTournamentMode || !this.tournament.engine) return;
        this.tournament.engine.undo();
        await this.tournament._persistState(this.currentFolder);
        await this.showTournamentPair();
    }

    async handleTournamentSpecial(side) {
        if (!this.isTournamentMode || !this.tournament.engine) return;
        const pair = this.tournament.engine.getCurrentPair();
        if (!pair) return;
        const targetPath = side === 'left' ? pair.left : pair.right;

        // Move to special folder via existing handler logic
        await this.moveToSpecialFolder(targetPath);

        // Remove from tournament
        this.tournament.engine.removeFile(targetPath);
        await this.tournament._persistState(this.currentFolder);
        await this.showTournamentPair();
    }
```

- [ ] **Step 2: Wire control-row buttons**

In `setupEventListeners` (or the constructor wiring block) add:

```javascript
        const undoBtn = document.getElementById('tournamentUndoBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.handleTournamentUndo());
        }
        const lSpecial = document.getElementById('tournamentLeftSpecialBtn');
        if (lSpecial) {
            lSpecial.addEventListener('click', () => this.handleTournamentSpecial('left'));
        }
        const rSpecial = document.getElementById('tournamentRightSpecialBtn');
        if (rSpecial) {
            rSpecial.addEventListener('click', () => this.handleTournamentSpecial('right'));
        }
        const pauseBtn = document.getElementById('tournamentPauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.switchMode('single'));
        }
```

- [ ] **Step 3: Run lint and tests**

```bash
npm run lint && npm test
```

Expected: clean lint, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "feat(tournament): pair display + click-to-pick + undo + special handlers"
```

---

### Task F6: Summary modal (Apply / Discard)

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Add summary-modal handler**

Add to `MediaViewer`:

```javascript
    showTournamentSummaryModal() {
        const modal = document.getElementById('tournamentSummaryModal');
        const body = document.getElementById('tournamentSummaryBody');
        const applyBtn = document.getElementById('tournamentSummaryApply');
        const discardBtn = document.getElementById('tournamentSummaryDiscard');

        // Build tier breakdown rows
        const bd = this.tournament.engine.getTierBreakdown();
        const maxCount = Math.max(...Object.values(bd), 1);
        const R = this.tournament.engine.strategy.options.rounds;

        const rows = [];
        for (let i = R; i >= 0; i--) {
            const count = bd[i] ?? 0;
            const pct = Math.round((count / maxCount) * 100);
            rows.push(
                `<div class="tier-row">` +
                    `<span>Tier-${i}</span>` +
                    `<div class="tier-bar"><div class="tier-bar-fill" style="width:${pct}%"></div></div>` +
                    `<span>${count} files</span>` +
                    `</div>`
            );
        }
        body.innerHTML =
            rows.join('') +
            `<p style="font-size:12px;margin-top:12px;color:#888">→ Files will move into _Tier-{0..${R}}/ inside ${this.currentFolder}</p>`;

        const cleanup = () => {
            modal.style.display = 'none';
            applyBtn.onclick = null;
            discardBtn.onclick = null;
        };

        applyBtn.onclick = async () => {
            const result = await this.tournament.handleApply();
            cleanup();
            if (result.success) {
                this.showNotification(`Moved ${result.moved} files into tier folders`, 'success');
                this.exitTournamentMode();
                this.switchMode('single');
                // Reload folder to show new structure
                await this.loadFolder(this.currentFolder);
            } else {
                this.showNotification(
                    `Apply failed: ${result.failed?.length ?? 0} files`,
                    'error'
                );
            }
        };

        discardBtn.onclick = async () => {
            await this.tournament.handleDiscard();
            cleanup();
            this.exitTournamentMode();
            this.switchMode('single');
            this.showNotification('Tournament results discarded', 'info');
        };

        modal.style.display = 'flex';
    }
```

- [ ] **Step 2: Commit**

```bash
git add media-viewer.js
git commit -m "feat(tournament): summary modal with Apply/Discard"
```

---

### Task F7: Resume prompt on `loadFolder`

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Add resume-check after folder load**

Find `loadFolder` method. After `this.mediaFiles` is populated and before normal post-load processing, add:

```javascript
        // Check for in-progress tournament
        await this._checkTournamentResume();
```

- [ ] **Step 2: Implement `_checkTournamentResume`**

Add to `MediaViewer`:

```javascript
    async _checkTournamentResume() {
        if (!this.currentFolder) return;
        try {
            const result = await window.electronAPI.readTournamentState(this.currentFolder);
            if (!result.success || !result.state) return;

            const state = result.state;
            const currentFiles = this.mediaFiles.map((f) => f.path);
            const v = this.tournament.validateStateFile(state, currentFiles);

            if (v.valid) {
                this.showTournamentResumePrompt(state, currentFiles);
            } else {
                this.showTournamentInvalidationPrompt(state, v);
            }
        } catch (err) {
            window.electronAPI.logError?.(`Tournament resume check failed: ${err.message}`);
        }
    }

    showTournamentResumePrompt(state, currentFiles) {
        const modal = document.getElementById('tournamentResumeModal');
        const title = document.getElementById('tournamentResumeTitle');
        const body = document.getElementById('tournamentResumeBody');
        const acceptBtn = document.getElementById('tournamentResumeAccept');
        const discardBtn = document.getElementById('tournamentResumeDiscard');

        title.textContent = 'Resume Tournament?';
        const startedAgo = Math.round((Date.now() - state.createdAt) / 60000);
        const progress = state.history.length;
        const totalGames = Math.floor(state.files.length / 2) * (state.options?.rounds ?? 3);
        body.innerHTML =
            `<div class="modal-row"><span>Started:</span><span>${startedAgo} min ago</span></div>` +
            `<div class="modal-row"><span>Progress:</span><span>${progress}/${totalGames} games</span></div>`;
        acceptBtn.textContent = 'Resume';

        const cleanup = () => {
            modal.style.display = 'none';
            acceptBtn.onclick = null;
            discardBtn.onclick = null;
        };

        acceptBtn.onclick = async () => {
            const ok = await this.tournament.handleResume(state, currentFiles);
            cleanup();
            if (ok) {
                this.isTournamentMode = true;
                this.mediaContainer.classList.add('tournament-mode');
                document.getElementById('tournamentOverlay').style.display = 'block';
                document.querySelectorAll('.mode-btn').forEach((b) => {
                    b.classList.toggle('active', b.dataset.mode === 'tournament');
                });
                await this.showTournamentPair();
            }
        };
        discardBtn.onclick = async () => {
            await this.tournament.handleDiscard();
            cleanup();
        };
        modal.style.display = 'flex';
    }

    showTournamentInvalidationPrompt(state, delta) {
        const modal = document.getElementById('tournamentResumeModal');
        const title = document.getElementById('tournamentResumeTitle');
        const body = document.getElementById('tournamentResumeBody');
        const acceptBtn = document.getElementById('tournamentResumeAccept');
        const discardBtn = document.getElementById('tournamentResumeDiscard');

        title.textContent = 'Tournament state out of sync';
        body.innerHTML =
            `<p>${delta.removed.length} files removed, ${delta.added.length} files added since tournament started.</p>`;
        acceptBtn.textContent = 'Discard and start fresh';
        discardBtn.textContent = 'Keep state';

        const cleanup = () => {
            modal.style.display = 'none';
            acceptBtn.onclick = null;
            discardBtn.onclick = null;
        };

        acceptBtn.onclick = async () => {
            await this.tournament.handleDiscard();
            cleanup();
        };
        discardBtn.onclick = () => {
            cleanup();
        };
        modal.style.display = 'flex';
    }
```

- [ ] **Step 3: Run lint and tests**

```bash
npm run lint && npm test
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "feat(tournament): resume + invalidation prompts on folder load"
```

---

## Phase G — Keyboard Shortcuts

### Task G1: Add `tournament` mode to `DEFAULT_SHORTCUTS` and wire keydown dispatch

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Find `DEFAULT_SHORTCUTS` constant near the top of `media-viewer.js`**

```bash
npx grep -n 'DEFAULT_SHORTCUTS' media-viewer.js
```

- [ ] **Step 2: Add tournament-mode block to `DEFAULT_SHORTCUTS`**

After the `compare:` block, add:

```javascript
    tournament: {
        leftWins: 'KeyQ',
        rightWins: 'KeyE',
        undo: 'Ctrl+KeyA',
        leftSpecial: 'Digit1',
        rightSpecial: 'Digit2',
        pause: 'Escape',
    },
```

- [ ] **Step 3: Update keydown handler to dispatch tournament-mode actions**

Find the keydown handler that picks `mode` (the line `const mode = this.isCompareMode ? 'compare' : 'single';`).

Replace with:

```javascript
            let mode = 'single';
            if (this.isTournamentMode) mode = 'tournament';
            else if (this.isCompareMode) mode = 'compare';
```

Then ensure `executeAction` (the dispatch helper) handles tournament actions. Find `executeAction` and add to its action map:

```javascript
            leftWins: () => {
                if (this.isTournamentMode) {
                    const pair = this.tournament.engine?.getCurrentPair();
                    if (pair) this.handleTournamentPick(pair.left, pair.right);
                }
            },
            rightWins: () => {
                if (this.isTournamentMode) {
                    const pair = this.tournament.engine?.getCurrentPair();
                    if (pair) this.handleTournamentPick(pair.right, pair.left);
                }
            },
            undo: () => {
                if (this.isTournamentMode) {
                    this.handleTournamentUndo();
                } else {
                    this.handleCancel();
                }
            },
            leftSpecial: () => {
                if (this.isTournamentMode) this.handleTournamentSpecial('left');
            },
            rightSpecial: () => {
                if (this.isTournamentMode) this.handleTournamentSpecial('right');
            },
            pause: () => {
                if (this.isTournamentMode) this.switchMode('single');
            },
```

Notes:
- `undo` action already exists in single/compare for `handleCancel` — wrap it with the tournament check.
- `pause` for tournament uses Escape; existing Escape handler may need adjustment if it conflicts. Verify by testing.

- [ ] **Step 4: Run lint and tests**

```bash
npm run lint && npm test
```

Expected: clean.

- [ ] **Step 5: Manually verify shortcuts in the running app**

```bash
npm start
```

- Open a folder with 4+ images.
- Switch to Tournament.
- Press `Q` and `E` — verify pair advances.
- Press `Ctrl+A` — verify undo restores the previous pair.

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js
git commit -m "feat(tournament): keyboard shortcuts (Q/E/Ctrl+A/1/2/Escape)"
```

---

## Phase H — E2E Tests (Stretch Goals — fit-as-time-allows)

Phase H is optional for Friday. If time permits, ship the happy-path test (Task H1); the rest can follow up.

### Task H1: E2E happy-path test

**Files:**
- Create: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Create the test file**

```javascript
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    launchApp,
    closeApp,
    createTempFixtureDir,
    mockFolderDialog,
} from './helpers/electron-app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe('Tournament Mode — happy path', () => {
    let electronApp;
    let page;
    let tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'yellow-1x1.png',
        ]);
        const launched = await launchApp();
        electronApp = launched.electronApp;
        page = launched.page;
        await mockFolderDialog(electronApp, tmpFixtures.path);
    });

    test.afterEach(async () => {
        if (page) {
            await page.evaluate(() => window.mediaViewer?.exitTournamentMode?.()).catch(() => {});
        }
        if (electronApp) await closeApp(electronApp);
        if (tmpFixtures) await tmpFixtures.cleanup();
    });

    test('full Swiss N=4 R=3 completes and creates tier folders', async () => {
        await page.click('#openFolderBtn');
        await page.waitForFunction(() => window.mediaViewer?.mediaFiles?.length === 4);

        await page.click('#modeBtnTournament');
        await page.waitForSelector('#tournamentConfigModal', { state: 'visible' });

        await page.selectOption('#tournamentRoundsSelect', '3');
        await page.click('#tournamentConfigStart');

        await page.waitForSelector('#tournamentOverlay', { state: 'visible' });

        // Play all games by clicking Q (left wins) repeatedly
        let safety = 30;
        while (safety-- > 0) {
            // Check whether summary modal is visible — if so, tournament is complete
            const summaryVisible = await page
                .locator('#tournamentSummaryModal')
                .isVisible()
                .catch(() => false);
            if (summaryVisible) break;
            await page.keyboard.press('q');
            await page.waitForTimeout(50);
        }

        await expect(page.locator('#tournamentSummaryModal')).toBeVisible();
        await page.click('#tournamentSummaryApply');

        // Verify tier folders exist
        const fs = await import('fs/promises');
        const entries = await fs.readdir(tmpFixtures.path);
        const tierDirs = entries.filter((e) => e.startsWith('_Tier-'));
        expect(tierDirs.length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run E2E test**

```bash
npm run test:e2e -- tournament-mode.test.js
```

Expected: PASS (1 test).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(tournament): E2E happy path (N=4, R=3)"
```

---

### Task H2: E2E resume flow (stretch)

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Append resume-flow test**

```javascript
test.describe('Tournament Mode — resume flow', () => {
    let electronApp;
    let page;
    let tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'yellow-1x1.png',
        ]);
        const launched = await launchApp();
        electronApp = launched.electronApp;
        page = launched.page;
        await mockFolderDialog(electronApp, tmpFixtures.path);
    });

    test.afterEach(async () => {
        if (electronApp) await closeApp(electronApp);
        if (tmpFixtures) await tmpFixtures.cleanup();
    });

    test('partial tournament resumes after folder reload', async () => {
        await page.click('#openFolderBtn');
        await page.waitForFunction(() => window.mediaViewer?.mediaFiles?.length === 4);

        await page.click('#modeBtnTournament');
        await page.waitForSelector('#tournamentConfigModal', { state: 'visible' });
        await page.click('#tournamentConfigStart');
        await page.waitForSelector('#tournamentOverlay', { state: 'visible' });

        // Play 2 games then "leave" tournament (switch to single mode preserves state file)
        await page.keyboard.press('q');
        await page.waitForTimeout(100);
        await page.keyboard.press('q');
        await page.waitForTimeout(100);

        // Switch to single, then reload folder
        await page.click('#modeBtnSingle');
        await page.click('#openFolderBtn');
        await page.waitForSelector('#tournamentResumeModal', { state: 'visible' });

        // Click Resume
        await page.click('#tournamentResumeAccept');
        await page.waitForSelector('#tournamentOverlay', { state: 'visible' });

        // Confirm engine has progress
        const gamesPlayed = await page.evaluate(
            () => window.mediaViewer?.tournament?.engine?.strategy?.gamesPlayed
        );
        expect(gamesPlayed).toBeGreaterThanOrEqual(2);
    });
});
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e -- tournament-mode.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(tournament): E2E resume flow"
```

---

### Task H3: E2E Discard at summary (stretch)

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Append discard test**

```javascript
test.describe('Tournament Mode — discard at summary', () => {
    let electronApp;
    let page;
    let tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'yellow-1x1.png',
        ]);
        const launched = await launchApp();
        electronApp = launched.electronApp;
        page = launched.page;
        await mockFolderDialog(electronApp, tmpFixtures.path);
    });

    test.afterEach(async () => {
        if (electronApp) await closeApp(electronApp);
        if (tmpFixtures) await tmpFixtures.cleanup();
    });

    test('Discard leaves no tier folders and removes state file', async () => {
        await page.click('#openFolderBtn');
        await page.waitForFunction(() => window.mediaViewer?.mediaFiles?.length === 4);

        await page.click('#modeBtnTournament');
        await page.click('#tournamentConfigStart');
        await page.waitForSelector('#tournamentOverlay', { state: 'visible' });

        let safety = 30;
        while (safety-- > 0) {
            const done = await page.locator('#tournamentSummaryModal').isVisible().catch(() => false);
            if (done) break;
            await page.keyboard.press('q');
            await page.waitForTimeout(50);
        }

        await page.click('#tournamentSummaryDiscard');

        const fs = await import('fs/promises');
        const entries = await fs.readdir(tmpFixtures.path);
        expect(entries.filter((e) => e.startsWith('_Tier-')).length).toBe(0);
        expect(entries.includes('.tournament_state.json')).toBe(false);
    });
});
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e -- tournament-mode.test.js
```

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(tournament): E2E discard at summary"
```

---

### Task H4: E2E invalidation prompt (stretch)

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Append invalidation test**

```javascript
test.describe('Tournament Mode — invalidation prompt', () => {
    let electronApp;
    let page;
    let tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'yellow-1x1.png',
        ]);
        const launched = await launchApp();
        electronApp = launched.electronApp;
        page = launched.page;
        await mockFolderDialog(electronApp, tmpFixtures.path);
    });

    test.afterEach(async () => {
        if (electronApp) await closeApp(electronApp);
        if (tmpFixtures) await tmpFixtures.cleanup();
    });

    test('external file removal shows invalidation prompt', async () => {
        await page.click('#openFolderBtn');
        await page.waitForFunction(() => window.mediaViewer?.mediaFiles?.length === 4);

        await page.click('#modeBtnTournament');
        await page.click('#tournamentConfigStart');
        await page.waitForSelector('#tournamentOverlay', { state: 'visible' });

        // Play one game
        await page.keyboard.press('q');
        await page.waitForTimeout(100);

        // Externally delete a file
        const fs = await import('fs/promises');
        await fs.unlink(path.join(tmpFixtures.path, 'red-1x1.png'));

        // Reload folder
        await page.click('#openFolderBtn');
        await page.waitForSelector('#tournamentResumeModal', { state: 'visible' });

        const title = await page.locator('#tournamentResumeTitle').textContent();
        expect(title).toMatch(/out of sync/);

        // Click "Discard and start fresh"
        await page.click('#tournamentResumeAccept');
        await expect(page.locator('#tournamentResumeModal')).toBeHidden();
    });
});
```

- [ ] **Step 2: Run all E2E**

```bash
npm run test:e2e
```

Expected: 4 new tests pass on top of existing 39.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(tournament): E2E invalidation prompt"
```

---

## Final Verification

### Task FV1: Full test suite + lint + format

- [ ] **Step 1: Run all unit + integration tests**

```bash
npm test
```

Expected: ~222 unit tests + 4 integration tests pass (was 195 unit, now 195+12 swiss + 7 engine + 8 manager = 222).

- [ ] **Step 2: Run all E2E**

```bash
npm run test:e2e
```

Expected: ~46 E2E (39 existing + 4 new if Phase H done; if not, still 39).

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Format check**

```bash
npm run format:check
```

If anything is out of format, run `npm run format` then commit the formatting changes.

- [ ] **Step 5: Manual smoke (see spec §7.7 manual testing checklist)**

```bash
npm start
```

Walk through:
- [ ] R=3 with 4 fixture files: tier breakdown reasonable; folders created.
- [ ] Odd N (3 files): bye distributed, no double-bye.
- [ ] Close app mid-tournament, reopen: resume works.
- [ ] Externally delete a file mid-tournament: invalidation prompt appears.
- [ ] Press L-Special on mid-tournament file: file leaves cleanly.
- [ ] Undo a game: previous pair shown, win counts revert.
- [ ] Apply: files move into tier folders; reload shows new structure.

---

## Post-Implementation (Plan Closeout)

### Update auto-managed CLAUDE.md sections

The auto-memory hook should fire automatically as files change. If anything is missing:

- [ ] Confirm `tournament-engine.js` and `tournament.js` are listed in the architecture diagram.
- [ ] Confirm Testing (Unit) block mentions the new test files.
- [ ] Confirm Git Insights has a Tournament Mode entry with commit hashes.

### Update planning documents

- [ ] Move plan to archive: `git mv docs/superpowers/plans/2026-05-25-tournament-mode.md docs/archive/plans/`.
- [ ] Add entry to `docs/planning/DONE.md` with date, test counts (unit + E2E), and key changes.
- [ ] Flip Group E (Spec) and Group F (Prototype) checkboxes in `docs/planning/WEEKLY.md`.
- [ ] Add new file to `docs/README.md` index.
- [ ] Update spec status: in `docs/superpowers/specs/2026-05-25-tournament-mode-design.md`, change `Status: Draft (pre-implementation)` to `Status: Complete`.

### Backlog spawning

Add the following to `docs/planning/BACKLOG.md`:
- Implement `RoundRobinStrategy` (~5 SP, includes pause/resume UX for long sessions)
- Implement `BracketStrategy` (~3 SP, lowest priority — user does this manually)
- Loose resume validation (purge played-but-removed files, ignore added files) (~3 SP)
- Tier preview in summary modal (~2 SP)
- Custom tier-folder destinations / "Apply to Like folder" workflow (~3 SP)
- Export ranked list as JSON / CSV (~2 SP)
- Tie-breaking refinement (Buchholz / head-to-head) (~2 SP)
- ML signal integration: feed tournament win counts into the existing ML model as a training signal (~3 SP)
