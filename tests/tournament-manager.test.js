import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TournamentManager } from '../tournament.js';
import { TournamentEngine, SwissStrategy } from '../tournament-engine.js';

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

    it('persists the initial state to the given folder (not null) on start', async () => {
        // Regression: handleStartClick must set _persistFolder before flush(), else _drain()
        // writes to a null folder, path.join(null,…) throws in main, the error is swallowed,
        // and the started tournament is not persisted until the first pick.
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);

        const calls = globalThis.window.electronAPI.writeTournamentState.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const [folderArg, stateArg] = calls[0];
        expect(folderArg).toBe('/test/folder'); // null before the fix
        expect(stateArg).toBeTruthy();
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
        await tm.flush(); // debounced write — force it for the assertion
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

    it('retries the state delete once when the first delete fails', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);
        const del = globalThis.window.electronAPI.deleteTournamentState;
        del.mockReset();
        del.mockResolvedValueOnce({ success: false, error: 'EBUSY' }).mockResolvedValueOnce({ success: true });

        await tm.handleDiscard();
        expect(del).toHaveBeenCalledTimes(2);
        expect(tm.engine).toBeNull();
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
        tm.cancelPending(); // clear the debounce timer so it can't fire post-test
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
        await tm2.flush(); // reconcile schedules a debounced write — force it
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
        await tm.flush(); // debounced write — force it for the assertion
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

describe('TournamentManager debounced persistence', () => {
    it('coalesces multiple scheduled persists within the debounce window into one write', async () => {
        vi.useFakeTimers();
        try {
            const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
            const tm = new TournamentManager(host);
            await tm.handleStartClick('/test/folder', 3); // 1 write (start flush)
            const writeSpy = globalThis.window.electronAPI.writeTournamentState;
            writeSpy.mockClear();

            tm._schedulePersist('/test/folder');
            tm._schedulePersist('/test/folder');
            tm._schedulePersist('/test/folder');
            expect(writeSpy).not.toHaveBeenCalled(); // nothing written before the timer fires

            await vi.advanceTimersByTimeAsync(600);
            expect(writeSpy).toHaveBeenCalledTimes(1); // three schedules → one write
        } finally {
            vi.useRealTimers();
        }
    });

    // PR #95 review 1: Save & leave of a tournament resumed without a pick wrote it over the previous folder's save.
    it.each(['handleResume', 'handleResumeReconciled'])('%s points later writes at its own folder', async (method) => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/A', 3);
        const state = tm.engine.serialize();
        tm.engine = null;
        host.baseFolderPath = '/B';
        await tm[method](state, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const writeSpy = globalThis.window.electronAPI.writeTournamentState;
        writeSpy.mockClear();
        await tm.flush();
        expect(writeSpy.mock.calls.map((c) => c[0])).toEqual(['/B']);
    });

    // PR #95 review 5: a load nulling the engine during a write with a pick pending made flush() spin on microtasks,
    // which starved the quit's cap and a second close.
    it('flush() settles when the engine goes away during a write, and leaves no flag for the next tournament', async () => {
        const tm = new TournamentManager(makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']));
        await tm.handleStartClick('/A', 3);
        let finish;
        globalThis.window.electronAPI.writeTournamentState = vi.fn(
            () => new Promise((resolve) => (finish = () => resolve({ success: true })))
        );
        const drain = tm._drain.bind(tm);
        let drains = 0;
        tm._drain = () => {
            if (++drains > 50) {
                throw new Error('flush() is spinning');
            }
            return drain();
        };
        tm._schedulePersist('/A');
        const flushing = tm.flush();
        await new Promise((resolve) => setTimeout(resolve, 0));
        tm._schedulePersist('/A'); // a pick during the held write
        tm.engine = null; // what loadFolder does
        finish();
        await flushing;
        expect(tm._persistPending).toBe(false);
    });

    // PR #95 review 6: Save & leave treated a refused write as durable, and nothing logged it.
    it('a write main refuses is logged', async () => {
        const logError = vi.fn();
        globalThis.window.electronAPI.logError = logError;
        const tm = new TournamentManager(makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']));
        await tm.handleStartClick('/A', 3);
        globalThis.window.electronAPI.writeTournamentState = vi.fn(async () => ({ success: false, error: 'EPERM' }));
        await tm.flush();
        expect(logError).toHaveBeenCalledTimes(1);
        expect(logError.mock.calls[0][0]).toContain('EPERM');
    });

    // PR #95 review 16: a write between main's writeFile and rename recreated the file the delete had just removed.
    it('a discard waits for a running write before it deletes', async () => {
        const tm = new TournamentManager(makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']));
        await tm.handleStartClick('/A', 3);
        let finish;
        globalThis.window.electronAPI.writeTournamentState = vi.fn(
            () => new Promise((resolve) => (finish = () => resolve({ success: true })))
        );
        const remove = globalThis.window.electronAPI.deleteTournamentState;
        tm._schedulePersist('/A');
        const draining = tm._drain();
        const discarding = tm.handleDiscard();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(remove).not.toHaveBeenCalled();
        finish();
        await Promise.all([draining, discarding]);
        expect(remove).toHaveBeenCalledTimes(1);
    });

    // G3 member 6: flush() forces a write of the engine as it stands. A quit must write what is owed, and nothing else.
    it('flushPending() writes a queued pick and clears its timer', async () => {
        vi.useFakeTimers();
        try {
            const tm = new TournamentManager(makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']));
            await tm.handleStartClick('/test/folder', 3);
            const writeSpy = globalThis.window.electronAPI.writeTournamentState;
            writeSpy.mockClear();
            tm._schedulePersist('/test/folder');
            await tm.flushPending();
            expect(writeSpy).toHaveBeenCalledTimes(1);
            expect(tm._persistTimer).toBeNull();
            await vi.advanceTimersByTimeAsync(600);
            expect(writeSpy).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('flushPending() waits for a write already running', async () => {
        const tm = new TournamentManager(makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']));
        await tm.handleStartClick('/test/folder', 3);
        let finish;
        globalThis.window.electronAPI.writeTournamentState = vi.fn(
            () => new Promise((resolve) => (finish = () => resolve({ success: true })))
        );
        tm._schedulePersist('/test/folder');
        const draining = tm._drain();
        let flushed = false;
        const flush = tm.flushPending().then(() => {
            flushed = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(flushed).toBe(false);
        finish();
        await Promise.all([draining, flush]);
    });

    it('flushPending() also waits for the write a pick during the running one starts', async () => {
        const tm = new TournamentManager(makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']));
        await tm.handleStartClick('/test/folder', 3);
        const finish = [];
        globalThis.window.electronAPI.writeTournamentState = vi.fn(
            () => new Promise((resolve) => finish.push(() => resolve({ success: true })))
        );
        tm._schedulePersist('/test/folder');
        const draining = tm._drain();
        const flush = tm.flushPending();
        tm._persistPending = true; // a pick during the write: its finally starts the next one
        let flushed = false;
        flush.then(() => {
            flushed = true;
        });
        finish[0]();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(finish).toHaveLength(2);
        expect(flushed).toBe(false);
        finish[1]();
        await Promise.all([draining, flush]);
    });

    it('flushPending() writes nothing with nothing owed, an engine in place or not', async () => {
        const tm = new TournamentManager(makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']));
        await tm.flushPending();
        await tm.handleStartClick('/test/folder', 3);
        const writeSpy = globalThis.window.electronAPI.writeTournamentState;
        writeSpy.mockClear();
        await tm.flushPending();
        expect(writeSpy).not.toHaveBeenCalled();
    });

    it('flush() writes immediately and clears the pending timer', async () => {
        vi.useFakeTimers();
        try {
            const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
            const tm = new TournamentManager(host);
            await tm.handleStartClick('/test/folder', 3);
            const writeSpy = globalThis.window.electronAPI.writeTournamentState;
            writeSpy.mockClear();

            tm._schedulePersist('/test/folder');
            await tm.flush();
            expect(writeSpy).toHaveBeenCalledTimes(1);

            // the armed timer must not fire a second write afterwards
            await vi.advanceTimersByTimeAsync(600);
            expect(writeSpy).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancelPending() drops a scheduled write (discard does not resurrect the file)', async () => {
        vi.useFakeTimers();
        try {
            const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
            const tm = new TournamentManager(host);
            await tm.handleStartClick('/test/folder', 3);
            const writeSpy = globalThis.window.electronAPI.writeTournamentState;
            writeSpy.mockClear();

            tm._schedulePersist('/test/folder');
            tm.cancelPending();
            await vi.advanceTimersByTimeAsync(600);
            expect(writeSpy).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('single-flight: concurrent flushes never run two writes at once', async () => {
        // Real timers here (no fake-timer setup) so setTimeout(0) drains microtasks between writes.
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);

        // Each write blocks until its resolver is called; resolvers are drained one at a time.
        let concurrent = 0;
        let maxConcurrent = 0;
        const resolvers = [];
        const writeSpy = vi.fn(() => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            return new Promise((resolve) => {
                resolvers.push(() => {
                    concurrent--;
                    resolve({ success: true });
                });
            });
        });
        globalThis.window.electronAPI.writeTournamentState = writeSpy;

        // Three overlapping flushes — the single-flight guard must serialize them.
        const flushes = [tm.flush(), tm.flush(), tm.flush()];
        await Promise.resolve();

        // Drain blocked writes; resolving one may queue the next (latest-wins re-drain).
        for (let guard = 0; guard < 50 && resolvers.length; guard++) {
            resolvers.shift()();
            await new Promise((res) => setTimeout(res, 0)); // let chained microtasks settle
        }
        await Promise.all(flushes);

        expect(maxConcurrent).toBe(1); // the single-flight guard held throughout
        expect(writeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('flush() awaits a durable write of the latest state when a pick interleaves an in-flight write', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);

        // Controlled write mock: ALL writes block until individually released. This ensures
        // write #2 (triggered by the re-drain in write #1's finally) is still in-flight when
        // the buggy flush() exits, exposing the quiescence gap.
        const releases = [];
        const writes = [];
        globalThis.window.electronAPI.writeTournamentState = vi.fn((folder, state) => {
            writes.push(state);
            return new Promise((resolve) => {
                releases.push(() => resolve({ success: true }));
            });
        });

        // Begin write #1 (it will block).
        tm._persistPending = true;
        tm._persistFolder = '/test/folder';
        tm._drain();
        // Let the async _drain() run until write #1 blocks.
        await new Promise((r) => setTimeout(r, 0));
        expect(writes.length).toBe(1); // write #1 started

        // A pick lands mid-write → pending becomes true.
        tm._persistPending = true;
        tm._persistFolder = '/test/folder';

        // flush() must NOT resolve until the latest state is durably written.
        let flushResolved = false;
        const flushP = tm.flush().then(() => {
            flushResolved = true;
        });
        // Give the event loop a turn — flush is blocked awaiting write #1.
        await new Promise((r) => setTimeout(r, 0));
        expect(flushResolved).toBe(false);

        // Release write #1. This triggers write #2 (re-drain in write #1's finally).
        // The bug: buggy flush() returns here before write #2 completes.
        releases[0]();
        // Yield once to let write #1's finally start write #2.
        await new Promise((r) => setTimeout(r, 0));

        // Write #2 must have started (the re-drain or flush's own drain should have triggered it).
        expect(writes.length).toBeGreaterThanOrEqual(2);

        // flush() must still be pending — it must not resolve until write #2 is durable.
        expect(flushResolved).toBe(false);

        // Release write #2. Now flush() can resolve.
        releases[1]();
        await flushP;

        expect(flushResolved).toBe(true);
        expect(tm._writeInFlight).toBeNull(); // fully quiescent
        expect(tm._persistPending).toBe(false); // nothing left pending
        expect(writes.length).toBeGreaterThanOrEqual(2); // latest state written after the pick
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

describe('TournamentManager.reconcileWithFiles', () => {
    it('prunes engine files absent from currentFiles and returns the count', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();

        const removed = tm.reconcileWithFiles(['a.jpg', 'b.jpg']); // c,d gone from disk
        expect(removed).toBe(2);
        expect(tm.engine.files).toEqual(['a.jpg', 'b.jpg']);
        tm.cancelPending();
    });

    it('ignores files added since start (returns 0, engine unchanged)', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();

        const removed = tm.reconcileWithFiles(['a.jpg', 'b.jpg', 'e.jpg', 'f.jpg']);
        expect(removed).toBe(0);
        expect(tm.engine.files).toEqual(['a.jpg', 'b.jpg']);
    });

    it('returns 0 when there is no engine', () => {
        const tm = new TournamentManager(makeHost([]));
        expect(tm.reconcileWithFiles(['a.jpg'])).toBe(0);
    });

    it('is idempotent — a second call removes nothing more', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();

        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg'])).toBe(2);
        tm.cancelPending();
        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg'])).toBe(0);
        tm.cancelPending();
    });

    it('drops the session-only undo history when it prunes anything', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        expect(tm.engine.history.length).toBe(1);

        tm.reconcileWithFiles(['a.jpg', 'b.jpg']); // c,d gone from disk
        tm.cancelPending();

        // Untracked removal + a live history would strand a file at Tier-0 on undo-past.
        expect(tm.engine.history).toEqual([]);
        expect(tm.engine.peekUndoKind()).toBeNull();
    });

    it('notifies exactly once when a non-empty history is dropped', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        host.showNotification.mockClear();

        tm.reconcileWithFiles(['a.jpg', 'b.jpg']);
        tm.cancelPending();

        expect(host.showNotification).toHaveBeenCalledTimes(1);
        expect(host.showNotification).toHaveBeenCalledWith(expect.stringContaining('undo history cleared'), 'info');
    });

    it('stays silent when it prunes but the history was already empty', async () => {
        // The disk-resume path: deserialize() sets history = [] (session-only undo), so a
        // reconcile there must not toast about an undo stack the user never had.
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        host.showNotification.mockClear();

        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg'])).toBe(2);
        tm.cancelPending();

        expect(host.showNotification).not.toHaveBeenCalled();
    });

    it('leaves the history intact when it prunes nothing', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        host.showNotification.mockClear();

        expect(tm.reconcileWithFiles(['a.jpg', 'b.jpg', 'e.jpg'])).toBe(0);

        expect(tm.engine.history.length).toBe(1);
        expect(host.showNotification).not.toHaveBeenCalled();
    });

    it('singularises the notification for a one-file prune', async () => {
        const host = makeHost(['a.jpg', 'b.jpg', 'c.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 3);
        tm.cancelPending();
        const p = tm.engine.getCurrentPair();
        tm.engine.recordResult(p.left, p.right);
        host.showNotification.mockClear();

        tm.reconcileWithFiles(['a.jpg', 'b.jpg']);
        tm.cancelPending();

        expect(host.showNotification).toHaveBeenCalledWith(expect.stringContaining('1 file left'), 'info');
    });
});

// G1: the resume path asks this before showing anything from a saved state.
describe('TournamentManager.isLoadableState (G1)', () => {
    function savedState() {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg'], new SwissStrategy(), { rounds: 2 });
        const pair = eng.getCurrentPair();
        eng.recordResult(pair.left, pair.right);
        return JSON.parse(JSON.stringify(eng.serialize()));
    }

    it('accepts a state the engine serialized', () => {
        const tm = new TournamentManager(makeHost());
        expect(tm.isLoadableState(savedState())).toBe(true);
    });

    it('refuses an invalid state without throwing, and logs why', () => {
        globalThis.window.electronAPI.logError = vi.fn();
        const tm = new TournamentManager(makeHost());
        const s = savedState();
        s.options.rounds = '<b data-probe="1">7</b>';
        expect(tm.isLoadableState(s)).toBe(false);
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith(
            expect.objectContaining({ level: 'warn', message: expect.stringContaining('Invalid tournament state') })
        );
    });

    it('lets an unexpected error through rather than reading it as "invalid"', () => {
        const tm = new TournamentManager(makeHost());
        const trap = {};
        Object.defineProperty(trap, 'version', {
            get() {
                throw new RangeError('not a validation failure');
            },
        });
        expect(() => tm.isLoadableState(trap)).toThrow(RangeError);
    });
});
