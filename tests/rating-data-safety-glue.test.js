// G3 "Rating data that can't go wrong" (spec docs/superpowers/specs/2026-11-02-g3-rating-data-safety-design.md):
// the MediaViewer methods behind each member, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable (the technique of media-viewer-utils.test.js, sync or async). */
function extract(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(((?:[^()]|\\([^()]*\\))*)\\)\\s*\\{`, 'm'));
    if (!match) {
        throw new Error(`Could not find method: ${name}`);
    }
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            const Ctor = match[1] ? AsyncFunction : Function;
            return new Ctor(match[2], source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

describe('member 6: _saveThenAllowClose', () => {
    const saveThenAllowClose = extract('_saveThenAllowClose');
    const settleSavesForClose = extract('_settleSavesForClose');
    let allowAppClose, logPerf, logError;

    function makeCtx(over = {}) {
        const ctx = {
            _fileOpInFlight: false,
            cancelBackgroundExtraction: vi.fn(),
            _bulkRatedSaver: { whenIdle: vi.fn(async () => {}) },
            featureCacheStore: { flush: vi.fn(async () => {}) },
            tournament: { flushPending: vi.fn(async () => {}) },
            showNotification: vi.fn(),
            ...over,
        };
        ctx._settleSavesForClose = settleSavesForClose.bind(ctx);
        return ctx;
    }

    const NOTE = 'Saving before closing — close again to quit now';

    beforeEach(() => {
        vi.useFakeTimers();
        allowAppClose = vi.fn();
        logPerf = vi.fn();
        logError = vi.fn();
        globalThis.window = { electronAPI: { allowAppClose, logPerf, logError } };
    });
    afterEach(() => {
        vi.useRealTimers();
        delete globalThis.window;
    });

    it('with nothing owed it closes without a note, and the timers it armed cannot fire later', async () => {
        const ctx = makeCtx();
        await saveThenAllowClose.call(ctx);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('settles all three saves before it closes, the extraction stopped first', async () => {
        const order = [];
        let finishFeatures;
        const ctx = makeCtx({
            cancelBackgroundExtraction: vi.fn(() => order.push('cancel')),
            _bulkRatedSaver: {
                whenIdle: vi.fn(async (...args) => {
                    order.push(`bulk(${args.length})`); // no folder: a queued save of a folder left behind counts
                }),
            },
            featureCacheStore: {
                flush: vi.fn(() => {
                    order.push('features');
                    return new Promise((resolve) => (finishFeatures = resolve));
                }),
            },
            tournament: { flushPending: vi.fn(async () => order.push('tournament')) },
        });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(0);
        expect(order).toEqual(['cancel', 'bulk(0)', 'features', 'tournament']);
        expect(allowAppClose).not.toHaveBeenCalled();
        finishFeatures();
        await closing;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('holds the flag a second close looks at from the first moment', () => {
        const ctx = makeCtx({ featureCacheStore: { flush: () => new Promise(() => {}) } });
        saveThenAllowClose.call(ctx);
        expect(ctx._closeSaveInFlight).toBe(true);
    });

    it('a slow save shows the sticky note at 300 ms, not before', async () => {
        const ctx = makeCtx({ featureCacheStore: { flush: () => new Promise(() => {}) } });
        saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(299);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(ctx.showNotification.mock.calls).toEqual([[NOTE, 'info', { sticky: true }]]);
    });

    it('a save that never settles closes at the 15 s cap, and the perf log says so', async () => {
        const ctx = makeCtx({ featureCacheStore: { flush: () => new Promise(() => {}) } });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(14_999);
        expect(allowAppClose).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await closing;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        expect(logPerf.mock.calls).toEqual([['Quit save: 15000ms, capped']]);
    });

    it('a finished save logs its wait as saved', async () => {
        await saveThenAllowClose.call(makeCtx());
        expect(logPerf).toHaveBeenCalledTimes(1);
        expect(logPerf.mock.calls[0][0]).toMatch(/^Quit save: \d+ms, saved$/);
    });

    it('a rejecting flush does not stop the other saves or the close', async () => {
        const ctx = makeCtx({
            featureCacheStore: {
                flush: vi.fn(async () => {
                    throw new Error('disk');
                }),
            },
        });
        await saveThenAllowClose.call(ctx);
        expect(ctx.tournament.flushPending).toHaveBeenCalledTimes(1);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('a flush or a cancel that throws synchronously still closes, and is logged', async () => {
        for (const over of [
            {
                cancelBackgroundExtraction: () => {
                    throw new Error('dom gone');
                },
            },
            {
                featureCacheStore: {
                    flush: () => {
                        throw new Error('sync');
                    },
                },
            },
        ]) {
            allowAppClose.mockClear();
            logError.mockClear();
            await saveThenAllowClose.call(makeCtx(over));
            expect(allowAppClose).toHaveBeenCalledTimes(1);
            expect(logError).toHaveBeenCalledTimes(1);
        }
    });

    it('a logPerf that throws still closes', async () => {
        logPerf.mockImplementation(() => {
            throw new Error('ipc');
        });
        await saveThenAllowClose.call(makeCtx());
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('waits for a file action to finish before it reads what is owed', async () => {
        const ctx = makeCtx({ _fileOpInFlight: true });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(100);
        expect(ctx._bulkRatedSaver.whenIdle).not.toHaveBeenCalled();
        ctx._fileOpInFlight = false;
        await vi.advanceTimersByTimeAsync(25);
        expect(ctx._bulkRatedSaver.whenIdle).toHaveBeenCalledTimes(1);
        await closing;
    });

    it('stops waiting on a stuck file action after 2 s', async () => {
        const ctx = makeCtx({ _fileOpInFlight: true });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(1_950);
        expect(ctx._bulkRatedSaver.whenIdle).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(75);
        expect(ctx._bulkRatedSaver.whenIdle).toHaveBeenCalledTimes(1);
        await closing;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });
});
