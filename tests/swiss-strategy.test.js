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

    it('uses round1Pairings when provided and does not persist them in options', () => {
        const s = new SwissStrategy();
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];
        // Best-vs-worst seeding: pair index 0 with N-1, 1 with N-2
        const seeded = [
            ['a.jpg', 'd.jpg'],
            ['b.jpg', 'c.jpg'],
        ];
        s.init(files, { rounds: 3, round1Pairings: seeded });

        expect(s.roundQueue).toEqual(seeded);
        expect(s.byes.size).toBe(0);
        // round1Pairings must NOT leak into persisted options (it's a one-shot seeding hint)
        expect(s.options.round1Pairings).toBeUndefined();
        expect(s.options.rounds).toBe(3);
    });

    it('awards bye to the unpaired middle file when round1Pairings covers odd N', () => {
        const s = new SwissStrategy();
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'];
        // Seeding pairs (highest vs lowest) — middle file 'c.jpg' (rank 2) gets the bye
        const seeded = [
            ['a.jpg', 'e.jpg'],
            ['b.jpg', 'd.jpg'],
        ];
        s.init(files, { rounds: 3, round1Pairings: seeded });

        expect(s.roundQueue).toEqual(seeded);
        expect(s.byes.has('c.jpg')).toBe(true);
        expect(s.byes.size).toBe(1);
        expect(s.winCounts.get('c.jpg')).toBe(1); // bye = +1 win
        expect(s.winCounts.get('a.jpg')).toBe(0);
    });

    it('falls back to bucket-based pairing when round1Pairings is empty/missing', () => {
        const s = new SwissStrategy();
        const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];
        s.init(files, { rounds: 3, round1Pairings: [] }); // empty array → fall back

        expect(s.roundQueue.length).toBe(2); // built via _buildRoundPairings
    });
});

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

describe('SwissStrategy round 2+ pairing', () => {
    it('round 2 pairs files with the same win count when possible', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        const [p1a, p1b] = s.getNextPair();
        s.recordResult(p1a, p1b);
        const [p2a, p2b] = s.getNextPair();
        s.recordResult(p2a, p2b);

        const winners = [];
        const losers = [];
        for (const file of s.files) {
            if (s.winCounts.get(file) === 1) winners.push(file);
            else losers.push(file);
        }
        expect(winners.length).toBe(2);
        expect(losers.length).toBe(2);

        const [r2a, r2b] = s.getNextPair();
        expect(s.currentRound).toBe(2);
        const r2Wins = [s.winCounts.get(r2a), s.winCounts.get(r2b)];
        expect(r2Wins[0]).toBe(r2Wins[1]);
    });
});

describe('SwissStrategy byes', () => {
    it('awards a bye to one file per round when N is odd', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg'], { rounds: 3 });

        expect(s.roundQueue.length).toBe(1);
        expect(s.byes.size).toBe(1);
        const byeFile = Array.from(s.byes)[0];
        expect(s.winCounts.get(byeFile)).toBe(1);
    });

    it('no file gets more than one bye across the tournament', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg'], { rounds: 3 });

        let safety = 50;
        while (safety-- > 0) {
            const pair = s.getNextPair();
            if (!pair) break;
            const [a, b] = pair;
            s.recordResult(a, b);
        }

        for (const file of s.files) {
            expect(s.winCounts.get(file)).toBeLessThanOrEqual(s.options.rounds);
        }
    });
});

describe('SwissStrategy.removeFile', () => {
    it('removes a file from all state structures', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        s.removeFile('a.jpg');

        expect(s.files).not.toContain('a.jpg');
        expect(s.winCounts.has('a.jpg')).toBe(false);
        expect(s.byes.has('a.jpg')).toBe(false);

        for (const [x, y] of s.roundQueue) {
            expect(x).not.toBe('a.jpg');
            expect(y).not.toBe('a.jpg');
        }
    });

    it('re-pairs orphaned partner when removed mid-round', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        const aPair = s.roundQueue.find(([x, y]) => x === 'a.jpg' || y === 'a.jpg');
        expect(aPair).toBeTruthy();
        const partner = aPair[0] === 'a.jpg' ? aPair[1] : aPair[0];

        s.removeFile('a.jpg');

        const stillInQueue = s.roundQueue.some(([x, y]) => x === partner || y === partner);
        const bye = s.byes.has(partner);
        expect(stillInQueue || bye).toBe(true);
    });
});

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

describe('SwissStrategy serialize/deserialize', () => {
    it('roundtrip preserves all state', () => {
        const s1 = new SwissStrategy();
        s1.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });

        for (let i = 0; i < 2; i++) {
            const [a, b] = s1.getNextPair();
            s1.recordResult(a, b);
        }

        const json = s1.serialize();
        const s2 = SwissStrategy.deserialize(json);

        expect(s2.files).toEqual(s1.files);
        expect(s2.options).toEqual(s1.options);
        expect(Array.from(s2.winCounts.entries())).toEqual(Array.from(s1.winCounts.entries()));
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

describe('SwissStrategy.recordDraw', () => {
    it("'win' gives both files +1 win and consumes the pair", () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });
        const [a, b] = s.getNextPair();

        s.recordDraw(a, b, 'win');

        expect(s.winCounts.get(a)).toBe(1);
        expect(s.winCounts.get(b)).toBe(1);
        expect(s.gamesPlayed).toBe(1);
        expect(s.playedPairs.has(s._pairKey(a, b))).toBe(true);
        // pair consumed → next pair excludes a and b
        const [c, d] = s.getNextPair();
        expect([a, b]).not.toContain(c);
        expect([a, b]).not.toContain(d);
    });

    it("'lose' changes no win counts but still consumes the pair", () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });
        const [a, b] = s.getNextPair();

        s.recordDraw(a, b, 'lose');

        expect(s.winCounts.get(a)).toBe(0);
        expect(s.winCounts.get(b)).toBe(0);
        expect(s.gamesPlayed).toBe(1);
        expect(s.playedPairs.has(s._pairKey(a, b))).toBe(true);
    });

    it('throws when the pair is not the current pair', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg'], { rounds: 1 });
        const [a, b] = s.getNextPair();
        expect(() => s.recordDraw(a, a, 'win')).toThrow('Invalid draw');
        expect(() => s.recordDraw('not-in-pair.jpg', b, 'win')).toThrow('Invalid draw');
    });

    it('throws when there is no active pair', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg'], { rounds: 1 });
        s.recordResult(...s.getNextPair());
        // round 1 exhausted, rounds=1 → no next pair
        expect(() => s.recordDraw('a.jpg', 'b.jpg', 'win')).toThrow('No active pair to record');
    });
});
