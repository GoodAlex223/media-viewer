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
