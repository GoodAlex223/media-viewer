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
    it('roundtrip preserves history and strategy state (with SwissStrategy)', () => {
        const eng1 = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });

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
