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

describe('TournamentEngine.undo', () => {
    it('pops the last history entry and restores strategy state', () => {
        const mock = makeMockStrategy([['a.jpg', 'b.jpg']]);
        const StrategyClass = Object.getPrototypeOf(mock).constructor;
        StrategyClass.deserialize = vi.fn(() => ({}));

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
        expect(eng.history[0].strategyStateSnapshot).toBeTruthy();
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
