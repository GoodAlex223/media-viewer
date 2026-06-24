// tournament-engine.js
// Tournament engine + pluggable pairing strategies.
// Pure ES module — imported by both tournament.js (renderer) and Vitest tests.
// Unlike sorting-worker.js (loaded as a Web Worker), this file is consumed via
// ES module import, so it does NOT use the conditional CJS export pattern.

// Session-only undo is capped to bound RAM on long sessions over large folders.
// Each history entry holds a full O(n) strategy snapshot; 100 × O(n) is the ceiling.
const UNDO_HISTORY_CAP = 100;

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
        // round1Pairings is a one-shot seeding hint; it must not persist in this.options
        // (would corrupt round 2+ if re-applied, and is irrelevant on resume).
        const { round1Pairings, ...restOptions } = options;
        this.files = [...files];
        this.options = { rounds: 3, ...restOptions };
        this.winCounts = new Map(files.map((f) => [f, 0]));
        this.playedPairs = new Set();
        this.byes = new Set();
        this.currentRound = 1;
        this.gamesPlayed = 0;

        if (round1Pairings && Array.isArray(round1Pairings) && round1Pairings.length > 0) {
            this.roundQueue = round1Pairings.map((p) => [p[0], p[1]]);
            // Identify any file that didn't appear in the seeding → bye (matches the
            // unmatched-leftover behavior in _buildRoundPairings).
            const paired = new Set();
            for (const [a, b] of round1Pairings) {
                paired.add(a);
                paired.add(b);
            }
            for (const file of this.files) {
                if (!paired.has(file)) {
                    this.byes.add(file);
                    this.winCounts.set(file, 1);
                }
            }
        } else {
            this.roundQueue = this._buildRoundPairings();
        }
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

    getNextPair() {
        while (this.roundQueue.length === 0) {
            if (this.currentRound >= this.options.rounds) {
                return null;
            }
            this.currentRound++;
            this.roundQueue = this._buildRoundPairings();
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
        const validPair = (winner === a && loser === b) || (winner === b && loser === a);
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

    recordDraw(a, b, outcome) {
        if (this.roundQueue.length === 0) {
            throw new Error('No active pair to record');
        }
        const [x, y] = this.roundQueue[0];
        const validPair = (a === x && b === y) || (a === y && b === x);
        if (!validPair) {
            throw new Error(`Invalid draw: expected the current pair [${x}, ${y}], got [${a}, ${b}]`);
        }
        this.roundQueue.shift();
        if (outcome === 'win') {
            this.winCounts.set(a, (this.winCounts.get(a) ?? 0) + 1);
            this.winCounts.set(b, (this.winCounts.get(b) ?? 0) + 1);
        }
        // outcome === 'lose' → neither file gains a win
        this.playedPairs.add(this._pairKey(x, y));
        this.gamesPlayed++;
    }

    removeFile(file) {
        if (!this.files.includes(file)) return;

        this.files = this.files.filter((f) => f !== file);
        this.winCounts.delete(file);
        this.byes.delete(file);

        for (const key of [...this.playedPairs]) {
            const [x, y] = key.split('|');
            if (x === file || y === file) {
                this.playedPairs.delete(key);
            }
        }

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

        while (orphans.length >= 2) {
            const a = orphans.shift();
            const b = orphans.shift();
            this.roundQueue.push([a, b]);
        }
        if (orphans.length === 1) {
            const lone = orphans[0];
            this.byes.add(lone);
            this.winCounts.set(lone, (this.winCounts.get(lone) ?? 0) + 1);
        }
    }

    isComplete() {
        return this.currentRound >= this.options.rounds && this.roundQueue.length === 0;
    }

    getTier(file) {
        return this.winCounts.get(file) ?? 0;
    }

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
}

export class TournamentEngine {
    constructor(files, strategy, options = {}) {
        this.files = [...files];
        this.strategy = strategy;
        this.history = [];
        this.createdAt = Date.now();
        this.strategy.init(this.files, options);
    }

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
            // Engine-level files list is captured separately from strategyStateSnapshot so
            // undo() can rewind a removeFile() that happened between picks (getTierBreakdown
            // and handleApply read engine.files, not strategy.files).
            filesSnapshot: [...this.files],
        });
        if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();
    }

    recordDraw(a, b, outcome) {
        const snapshot = this.strategy.serialize();
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
            strategyStateSnapshot: snapshot,
            // Mirror recordResult: capture engine.files so undo() can rewind a removeFile()
            // that happened between picks.
            filesSnapshot: [...this.files],
        });
        if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();
    }

    undo() {
        if (this.history.length === 0) return;
        const entry = this.history.pop();
        const StrategyCtor = Object.getPrototypeOf(this.strategy).constructor;
        const restored = StrategyCtor.deserialize(entry.strategyStateSnapshot);
        Object.assign(this.strategy, restored);
        if (entry.filesSnapshot) {
            this.files = [...entry.filesSnapshot];
        }
    }

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
}
