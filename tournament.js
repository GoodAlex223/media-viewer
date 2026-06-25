// tournament.js
// TournamentManager — owns Tournament Mode UI lifecycle: config modal, pair display,
// summary modal, resume/invalidation prompts, IPC glue. Follows v2.0 modularization
// pattern (see fullscreen.js): receives MediaViewer dependencies via constructor;
// MediaViewer delegates to this.tournament.*.

import { TournamentEngine, SwissStrategy } from './tournament-engine.js';

// Trailing-edge debounce for state writes. Picks coalesce within this window into a
// single write of the latest state; a hard crash can lose at most this much progress.
const PERSIST_DEBOUNCE_MS = 500;

export class TournamentManager {
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

    async handleStartClick(folderPath, rounds, opts = {}) {
        const files = this.host.mediaFiles.map((f) => f.path);
        if (files.length < 2) {
            this.host.showNotification('Tournament needs at least 2 files.', 'warning');
            return false;
        }
        const engineOptions = { rounds };
        if (opts.seedingPairings) {
            engineOptions.round1Pairings = opts.seedingPairings;
        }
        this.engine = new TournamentEngine(files, new SwissStrategy(), engineOptions);
        // flush()/_drain() write to this._persistFolder, which is otherwise only set by
        // _schedulePersist() (never called on the start path) — set it so the initial state
        // is persisted to the real folder, not null.
        this._persistFolder = folderPath;
        await this.flush();
        return true;
    }

    async handlePairResult(winner, loser) {
        if (!this.engine) return false;
        this.engine.recordResult(winner, loser);
        this._schedulePersist(this.host.baseFolderPath);
        return true;
    }

    async handlePairDraw(a, b, outcome) {
        if (!this.engine) return false;
        this.engine.recordDraw(a, b, outcome);
        this._schedulePersist(this.host.baseFolderPath);
        return true;
    }

    async handleApply() {
        if (!this.engine || !this.engine.isComplete()) {
            return { success: false, error: 'Tournament not complete' };
        }
        this.cancelPending(); // applied state is irrelevant; don't let a queued write recreate it
        const assignments = {};
        for (const file of this.engine.files) {
            assignments[file] = this.engine.getTier(file);
        }
        const result = await window.electronAPI.applyTournamentResults(this.host.baseFolderPath, assignments);
        if (result.success) {
            this.engine = null;
        }
        return result;
    }

    async handleDiscard() {
        this.cancelPending(); // don't let a queued write recreate the file after delete
        this.engine = null;
        await window.electronAPI.deleteTournamentState(this.host.baseFolderPath);
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

    // Resume despite a file-set delta (strict validation failed): rebuild from the tournament's
    // ORIGINAL file set, then purge files that no longer exist on disk. Files added to the
    // folder since the tournament started are simply ignored — they don't join an in-progress
    // bracket. Returns { ok, removedCount }.
    async handleResumeReconciled(state, currentFiles) {
        this.engine = TournamentEngine.deserialize(state, state.files);
        const currentSet = new Set(currentFiles);
        const removed = state.files.filter((f) => !currentSet.has(f));
        for (const f of removed) {
            this.engine.removeFile(f);
        }
        if (removed.length > 0) {
            this._schedulePersist(this.host.baseFolderPath);
        }
        return { ok: true, removedCount: removed.length };
    }

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
    // paths (start, Save & leave). Loops until fully quiescent — no write in flight and
    // nothing pending — so a pick that interleaved an in-flight write (which triggers a
    // re-drain) is also awaited, guaranteeing the latest state is durable on return.
    async flush() {
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
        }
        if (!this.engine) return;
        this._persistPending = true;
        while (this._persistPending || this._writeInFlight) {
            if (this._writeInFlight) {
                await this._writeInFlight;
            } else {
                await this._drain();
            }
        }
    }

    // Drop a pending write without writing (used before delete/apply).
    cancelPending() {
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
            this._persistTimer = null;
        }
        this._persistPending = false;
    }

    async _persistState(folderPath) {
        if (!this.engine) return;
        const state = this.engine.serialize();
        await window.electronAPI.writeTournamentState(folderPath, state);
    }
}
