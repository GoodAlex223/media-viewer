// tournament.js
// TournamentManager — owns Tournament Mode UI lifecycle: config modal, pair display,
// summary modal, resume/invalidation prompts, IPC glue. Follows v2.0 modularization
// pattern (see fullscreen.js): receives MediaViewer dependencies via constructor;
// MediaViewer delegates to this.tournament.*.

import { TournamentEngine, SwissStrategy } from './tournament-engine.js';

export class TournamentManager {
    constructor(host, options = {}) {
        // host: MediaViewer instance — provides mediaFiles, currentFolder, showNotification, etc.
        this.host = host;
        this.engine = null;
        this.options = options;
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
        await this._persistState(folderPath);
        return true;
    }

    async handlePairResult(winner, loser) {
        if (!this.engine) return false;
        this.engine.recordResult(winner, loser);
        await this._persistState(this.host.baseFolderPath);
        return true;
    }

    async handlePairDraw(a, b, outcome) {
        if (!this.engine) return false;
        this.engine.recordDraw(a, b, outcome);
        await this._persistState(this.host.baseFolderPath);
        return true;
    }

    async handleApply() {
        if (!this.engine || !this.engine.isComplete()) {
            return { success: false, error: 'Tournament not complete' };
        }
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
            await this._persistState(this.host.baseFolderPath);
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

    async _persistState(folderPath) {
        if (!this.engine) return;
        const state = this.engine.serialize();
        await window.electronAPI.writeTournamentState(folderPath, state);
    }
}
