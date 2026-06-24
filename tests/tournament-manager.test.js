import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TournamentManager } from '../tournament.js';

function makeHost(mediaFiles = []) {
    return {
        mediaFiles: mediaFiles.map((p) => ({ path: p })),
        showNotification: vi.fn(),
        baseFolderPath: '/test/folder',
    };
}

let origWindow;
beforeEach(() => {
    origWindow = globalThis.window;
    globalThis.window = {
        electronAPI: {
            writeTournamentState: vi.fn().mockResolvedValue({ success: true }),
            deleteTournamentState: vi.fn().mockResolvedValue({ success: true }),
            applyTournamentResults: vi.fn().mockResolvedValue({ success: true, moved: 2, failed: [] }),
        },
    };
});
afterEach(() => {
    globalThis.window = origWindow;
});

describe('TournamentManager.handleStartClick', () => {
    it('returns false and shows notification when N<2', async () => {
        const host = makeHost(['a.jpg']);
        const tm = new TournamentManager(host);
        const ok = await tm.handleStartClick('/test/folder', 3);
        expect(ok).toBe(false);
        expect(host.showNotification).toHaveBeenCalled();
        expect(tm.engine).toBeNull();
    });

    it('returns true and creates engine when N>=2', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        const ok = await tm.handleStartClick('/test/folder', 3);
        expect(ok).toBe(true);
        expect(tm.engine).toBeTruthy();
        expect(tm.engine.files.length).toBe(4);
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalled();
    });
});

describe('TournamentManager.handlePairResult', () => {
    it('records the result and persists state', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        const pair = tm.engine.getCurrentPair();
        const ok = await tm.handlePairResult(pair.left, pair.right);
        expect(ok).toBe(true);
        expect(tm.engine.history.length).toBe(1);
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalledTimes(2);
    });
});

describe('TournamentManager.handleApply', () => {
    it('calls applyTournamentResults with correct tier assignments', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        const pair = tm.engine.getCurrentPair();
        await tm.handlePairResult(pair.left, pair.right);

        const result = await tm.handleApply();
        expect(result.success).toBe(true);
        expect(globalThis.window.electronAPI.applyTournamentResults).toHaveBeenCalled();
        const [folderArg, assignmentsArg] = globalThis.window.electronAPI.applyTournamentResults.mock.calls[0];
        expect(folderArg).toBe('/test/folder');
        expect(Object.keys(assignmentsArg).length).toBe(2);
    });
});

describe('TournamentManager.handleDiscard', () => {
    it('clears engine and deletes state file', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        await tm.handleDiscard();
        expect(tm.engine).toBeNull();
        expect(globalThis.window.electronAPI.deleteTournamentState).toHaveBeenCalledWith('/test/folder');
    });
});

describe('TournamentManager.validateStateFile', () => {
    it('returns valid when file lists match', () => {
        const tm = new TournamentManager(makeHost([]));
        const state = { files: ['a.jpg', 'b.jpg', 'c.jpg'] };
        const result = tm.validateStateFile(state, ['a.jpg', 'b.jpg', 'c.jpg']);
        expect(result.valid).toBe(true);
    });

    it('returns invalid with delta when files differ', () => {
        const tm = new TournamentManager(makeHost([]));
        const state = { files: ['a.jpg', 'b.jpg', 'c.jpg'] };
        const result = tm.validateStateFile(state, ['a.jpg', 'b.jpg', 'd.jpg']);
        expect(result.valid).toBe(false);
        expect(result.removed).toEqual(['c.jpg']);
        expect(result.added).toEqual(['d.jpg']);
    });
});

describe('TournamentManager.handleResume', () => {
    it('reconstructs engine from a saved state', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);

        await tm.handleStartClick('/test/folder', 3);
        const pair = tm.engine.getCurrentPair();
        await tm.handlePairResult(pair.left, pair.right);
        const savedState = tm.engine.serialize();

        const tm2 = new TournamentManager(host);
        const ok = await tm2.handleResume(savedState, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        expect(ok).toBe(true);
        expect(tm2.engine).toBeTruthy();
        expect(tm2.engine.history.length).toBe(0); // resumed engine starts with empty undo history (session-only)
    });
});

describe('TournamentManager.handleResumeReconciled', () => {
    it('resumes and ignores files added since the tournament started', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        const savedState = tm.engine.serialize();

        // Current folder has 2 extra files (added since tournament started)
        const currentFiles = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
        const tm2 = new TournamentManager(host);
        const result = await tm2.handleResumeReconciled(savedState, currentFiles);

        expect(result.ok).toBe(true);
        expect(result.removedCount).toBe(0); // nothing removed, only added
        // Engine still tracks the original 4 — added files are not part of the bracket
        expect(tm2.engine.files.length).toBe(4);
        expect(tm2.engine.files).not.toContain('e.jpg');
    });

    it('purges files removed from disk and re-persists state', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        const savedState = tm.engine.serialize();

        // Current folder is missing 2 of the original files
        const currentFiles = ['a.jpg', 'b.jpg'];
        const tm2 = new TournamentManager(host);
        const result = await tm2.handleResumeReconciled(savedState, currentFiles);

        expect(result.ok).toBe(true);
        expect(result.removedCount).toBe(2);
        expect(tm2.engine.files.length).toBe(2);
        expect(tm2.engine.files).not.toContain('c.jpg');
        expect(tm2.engine.files).not.toContain('d.jpg');
        // Removed files trigger a re-persist
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalled();
    });
});

describe('TournamentManager.handlePairDraw', () => {
    it('records the draw and persists state', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        const pair = tm.engine.getCurrentPair();
        const ok = await tm.handlePairDraw(pair.left, pair.right, 'win');

        expect(ok).toBe(true);
        expect(tm.engine.history.length).toBe(1);
        expect(tm.engine.history[0].draw).toBe(true);
        expect(tm.engine.history[0].outcome).toBe('win');
        // once on start, once on the draw
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalledTimes(2);
    });

    it('returns false when there is no engine', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        const ok = await tm.handlePairDraw('a.jpg', 'b.jpg', 'lose');
        expect(ok).toBe(false);
    });
});

describe('TournamentManager progress + breakdown text', () => {
    it('formats progress as "Round X of Y · Game N/M"', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        const text = tm.getProgressText();
        expect(text).toMatch(/Round 1 of 3/);
        expect(text).toMatch(/Game 0\/2/);
    });

    it('formats tier breakdown as "Tiers: 0·0·0·0"', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        const text = tm.getTierBreakdownText();
        const parts = text
            .replace(/^Tiers: /, '')
            .split('·')
            .map((s) => s.trim());
        expect(parts.length).toBe(4);
        expect(parts.reduce((a, b) => a + parseInt(b, 10), 0)).toBe(4);
    });
});
