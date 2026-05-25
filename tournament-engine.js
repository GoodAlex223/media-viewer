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
                let opponentIdx = bucket.findIndex((b) => !this.playedPairs.has(this._pairKey(unmatched, b)));
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
                let opponentIdx = bucket.findIndex((b) => !this.playedPairs.has(this._pairKey(a, b)));
                if (opponentIdx === -1) opponentIdx = 0;
                const b = bucket[opponentIdx];
                bucket.splice(opponentIdx, 1);
                pairs.push([a, b]);
            }

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
        }

        // Award bye to leftover unmatched file
        if (unmatched) {
            this.byes.add(unmatched);
            this.winCounts.set(unmatched, (this.winCounts.get(unmatched) ?? 0) + 1);
        }

        return pairs;
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
