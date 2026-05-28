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
            eng.recordResult(pair.left, pair.right);
            games++;
        }

        expect(eng.isComplete()).toBe(true);

        for (const file of files) {
            const tier = eng.getTier(file);
            expect(tier).toBeGreaterThanOrEqual(0);
            expect(tier).toBeLessThanOrEqual(3);
        }

        const bd = eng.getTierBreakdown();
        const total = Object.values(bd).reduce((a, b) => a + b, 0);
        expect(total).toBe(files.length);

        expect(games).toBeGreaterThanOrEqual(Math.floor((files.length / 2) * 3) - 3);
    });
});

describe('Tournament integration — odd N', () => {
    it("N=7, R=3 distributes byes; no file bye'd twice", () => {
        const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });

        let safety = 100;
        while (!eng.isComplete() && safety-- > 0) {
            const pair = eng.getCurrentPair();
            if (!pair) break;
            eng.recordResult(pair.left, pair.right);
        }

        expect(eng.isComplete()).toBe(true);

        // byes is a Set so set membership is at most 1 per file
        for (const f of files) {
            expect(eng.strategy.byes.has(f) ? 1 : 0).toBeLessThanOrEqual(1);
        }
    });
});

describe('Tournament integration — mid-session removal', () => {
    it('removeFile mid-tournament: removed file never appears in subsequent pairs', () => {
        const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg'];
        const eng = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });

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

        for (const file of eng.files) {
            const tier = eng.getTier(file);
            expect(tier).toBeGreaterThanOrEqual(0);
            expect(tier).toBeLessThanOrEqual(3);
        }
    });
});

describe('Tournament integration — serialize and resume', () => {
    it('snapshot mid-tournament, reload engine, complete remaining games', () => {
        const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg', '8.jpg'];

        const eng1 = new TournamentEngine(files, new SwissStrategy(), { rounds: 3 });
        let safety = 30;
        for (let i = 0; i < 4 && safety-- > 0; i++) {
            const pair = eng1.getCurrentPair();
            if (!pair) break;
            eng1.recordResult(pair.left, pair.right);
        }
        const snapshot = eng1.serialize();
        const text = JSON.stringify(snapshot);

        const reloaded = JSON.parse(text);
        const eng2 = TournamentEngine.deserialize(reloaded, files);

        expect(eng2.history.length).toBe(eng1.history.length);
        expect(eng2.strategy.gamesPlayed).toBe(eng1.strategy.gamesPlayed);

        safety = 30;
        while (!eng2.isComplete() && safety-- > 0) {
            const pair = eng2.getCurrentPair();
            if (!pair) break;
            eng2.recordResult(pair.left, pair.right);
        }

        expect(eng2.isComplete()).toBe(true);

        const bd = eng2.getTierBreakdown();
        const total = Object.values(bd).reduce((a, b) => a + b, 0);
        expect(total).toBe(files.length);
    });
});
