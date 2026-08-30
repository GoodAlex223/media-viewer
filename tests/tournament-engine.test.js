import { describe, it, expect, vi } from 'vitest';
import { TournamentEngine, SwissStrategy } from '../tournament-engine.js';

function makeMockStrategy(pairSequence) {
    let idx = 0;
    const removed = new Set();
    const StrategyClass = function () {};
    StrategyClass.deserialize = vi.fn();

    const mock = {
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
        recordResult: vi.fn(() => {
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
        captureUndo: vi.fn(() => ({ kind: 'delta', pair: pairSequence[idx] ? [...pairSequence[idx]] : [] })),
        applyUndo: vi.fn(() => {
            idx = Math.max(0, idx - 1);
        }),
    };

    Object.setPrototypeOf(mock, { constructor: StrategyClass });
    return mock;
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
});

describe('TournamentEngine.undo', () => {
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

    it('undo on empty history is a no-op', () => {
        const mock = makeMockStrategy([]);
        const eng = new TournamentEngine([], mock);
        expect(() => eng.undo()).not.toThrow();
        expect(eng.history.length).toBe(0);
    });

    it('undo restores engine.files removed between picks (removeFile + recordResult + undo)', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });

        const firstPair = eng.getCurrentPair();
        eng.recordResult(firstPair.left, firstPair.right);
        expect(eng.files).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);

        // File vanishes mid-tournament (e.g., Special-moved to disk-elsewhere)
        eng.removeFile('c.jpg');
        expect(eng.files).toEqual(['a.jpg', 'b.jpg', 'd.jpg']);

        const secondPair = eng.getCurrentPair();
        eng.recordResult(secondPair.left, secondPair.right);

        // Undo the second pick — engine.files must rewind to include c.jpg again,
        // otherwise getTierBreakdown() and handleApply() under-count.
        eng.undo();
        expect(eng.files).toEqual(['a.jpg', 'b.jpg', 'd.jpg']);

        // Undo the first pick — engine.files must rewind to the pre-removeFile state.
        eng.undo();
        expect(eng.files).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        expect(Object.values(eng.getTierBreakdown()).reduce((a, b) => a + b, 0)).toBe(4);
    });
});

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

describe('TournamentEngine serialize/deserialize', () => {
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

    it('serialize output is JSON-safe', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), {
            rounds: 1,
        });
        const json = eng.serialize();
        const text = JSON.stringify(json);
        expect(() => JSON.parse(text)).not.toThrow();
    });

    it('deserialize throws on an unsupported version', () => {
        expect(() => TournamentEngine.deserialize({ version: 3, strategy: 'swiss' }, [])).toThrow(
            'Unsupported tournament state version: 3'
        );
    });

    it('serialize embeds gamesPlayed in strategyState (resume-prompt progress source)', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });
        const pair = eng.getCurrentPair();
        eng.recordResult(pair.left, pair.right);

        const json = eng.serialize();
        expect(json.gamesPlayed).toBe(1); // top-level (v2)
        expect(json.strategyState.gamesPlayed).toBe(1); // fallback source for legacy v1 files
    });
});

describe('TournamentEngine.recordDraw', () => {
    it('pushes a draw history entry with outcome and a snapshot', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), { rounds: 1 });
        const pair = eng.getCurrentPair();
        eng.recordDraw(pair.left, pair.right, 'win');

        expect(eng.history.length).toBe(1);
        expect(eng.history[0].draw).toBe(true);
        expect(eng.history[0].outcome).toBe('win');
        expect(eng.history[0].a).toBe(pair.left);
        expect(eng.history[0].b).toBe(pair.right);
        expect(eng.history[0].undo).toBeTruthy();
        expect(eng.history[0].filesSnapshot).toBeTruthy();
        expect(eng.strategy.winCounts.get(pair.left)).toBe(1);
        expect(eng.strategy.winCounts.get(pair.right)).toBe(1);
    });

    it('undo() after a draw restores win counts and the round queue', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });
        const pair = eng.getCurrentPair();
        eng.recordDraw(pair.left, pair.right, 'win');
        expect(eng.strategy.winCounts.get(pair.left)).toBe(1);
        expect(eng.strategy.winCounts.get(pair.right)).toBe(1);
        expect(eng.strategy.gamesPlayed).toBe(1);

        eng.undo();

        expect(eng.history.length).toBe(0);
        expect(eng.strategy.winCounts.get(pair.left)).toBe(0);
        expect(eng.strategy.winCounts.get(pair.right)).toBe(0);
        expect(eng.strategy.gamesPlayed).toBe(0);
        // the same pair is current again
        const again = eng.getCurrentPair();
        expect([again.left, again.right].sort()).toEqual([pair.left, pair.right].sort());
    });

    it("'lose' draw then undo leaves all win counts at zero throughout", () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), { rounds: 1 });
        const pair = eng.getCurrentPair();
        eng.recordDraw(pair.left, pair.right, 'lose');
        expect(eng.strategy.winCounts.get(pair.left)).toBe(0);
        eng.undo();
        expect(eng.strategy.winCounts.get(pair.left)).toBe(0);
        expect(eng.history.length).toBe(0);
    });
});

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

describe('TournamentEngine removeFile trackUndo (undo across a mid-tournament removal)', () => {
    it('undoing past a trackUndo removal restores full strategy state, not just engine.files', () => {
        // 6 files → round-1 picks are non-boundary deltas (the case that cannot resurrect a
        // removed file's strategy state without a snapshot). Mirrors the -1 auto-prune path.
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });

        const p1 = eng.getCurrentPair();
        eng.recordResult(p1.left, p1.right); // delta

        eng.removeFile('c.jpg', { trackUndo: true }); // records a snapshot-based undo entry
        expect(eng.files).not.toContain('c.jpg');
        expect(eng.strategy.files).not.toContain('c.jpg');

        const p2 = eng.getCurrentPair();
        eng.recordResult(p2.left, p2.right); // delta

        eng.undo(); // reverse pick 2 (delta)
        eng.undo(); // reverse the removal (snapshot) — strategy AND files must have c.jpg back
        expect(eng.files).toContain('c.jpg');
        expect(eng.strategy.files).toContain('c.jpg'); // the regression this guards against
        expect(eng.strategy.winCounts.has('c.jpg')).toBe(true);

        eng.undo(); // reverse pick 1 (delta) → fully pristine
        expect(eng.strategy.files.slice().sort()).toEqual([...files].sort());
        expect(eng.strategy.gamesPlayed).toBe(0);
        expect(eng.strategy.byes.size).toBe(0); // no phantom bye left by the removal
        for (const f of files) expect(eng.strategy.winCounts.get(f)).toBe(0);
    });

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
});

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

    it('undoUserAction absorbs two consecutive trailing prunes on top of one pick', () => {
        const eng = makeEngine();
        const p1 = eng.getCurrentPair();
        eng.recordResult(p1.left, p1.right);
        eng.removeFile('e.jpg', { trackUndo: true }); // first system prune
        eng.removeFile('f.jpg', { trackUndo: true }); // second prune stacks directly on top, no pick between them

        const entry = eng.undoUserAction();
        expect(entry.kind).toBe('pick');
        expect(eng.history.length).toBe(0); // the pick and both prunes are all consumed by one Undo press
        expect(eng.files).toContain('e.jpg');
        expect(eng.files).toContain('f.jpg');
        expect(eng.strategy.files).toContain('e.jpg'); // both prunes reversed, not just the top one
        expect(eng.strategy.files).toContain('f.jpg');
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
