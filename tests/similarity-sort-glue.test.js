// G2 hash-sort glue (spec docs/superpowers/specs, G2 PR 1): the MediaViewer methods that connect
// similarity-sort.js to the app, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as SimilaritySort from '../similarity-sort.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// media-viewer.js imports the module as a namespace. An extracted method runs in the global scope, so
// it resolves `SimilaritySort` through the global object.
globalThis.SimilaritySort = SimilaritySort;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable (the technique of media-viewer-utils.test.js, sync or async). */
function extract(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(([^)]*)\\)\\s*\\{`, 'm'));
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

const media = (...names) => names.map((n) => ({ name: n, path: `/f/${n}`, size: 10, type: 'image/jpeg' }));
const names = (files) => files.map((f) => f.name);

/** A mock `this` for the similarity / AI sort entry points, past every guard; override per test. */
function similarityCtx(overrides = {}) {
    const label = { textContent: '' };
    return {
        isTournamentMode: false,
        isPredictionSorting: false,
        isComputingHashes: false,
        isMlEnabled: true,
        isSortedBySimilarity: false,
        isSortedByPrediction: false,
        sortAbortController: null,
        mediaFiles: [],
        originalMediaFiles: [],
        currentIndex: 5,
        mlComparePairIndex: 3,
        sortSimilarityBtn: { querySelector: () => label },
        _refuseIfFileOpInFlight: vi.fn(() => false),
        _onOrderChanged: vi.fn(),
        showMedia: vi.fn(async () => {}),
        showNotification: vi.fn(),
        updateSortPredictionButton: vi.fn(),
        ...overrides,
    };
}

// On screen: [c, a, d]. b was moved since the sort; d was restored by an undo and is absent from the snapshot.
const screenState = () => ({
    mediaFiles: media('c', 'a', 'd'),
    originalMediaFiles: media('a', 'b', 'c'),
});

describe('Restore Order keeps every listed file (spec § 7, A1)', () => {
    it('similarity Restore Order: snapshot order, moved files dropped, restored files appended', async () => {
        const ctx = similarityCtx({ ...screenState(), isSortedBySimilarity: true });
        await extract('handleSortBySimilarity').call(ctx, false);
        expect(names(ctx.mediaFiles)).toEqual(['a', 'c', 'd']);
        expect(ctx._onOrderChanged).toHaveBeenCalledWith('other');
        expect(ctx.currentIndex).toBe(0);
    });

    it('AI toggle-off: the same rule', async () => {
        const ctx = similarityCtx({ ...screenState(), isSortedByPrediction: true });
        await extract('handleSortByPrediction').call(ctx);
        expect(names(ctx.mediaFiles)).toEqual(['a', 'c', 'd']);
        expect(ctx._onOrderChanged).toHaveBeenCalledWith('other');
    });

    it('Tournament entry: the same rule', () => {
        const ctx = similarityCtx({ ...screenState(), isSortedBySimilarity: true });
        extract('restoreOriginalOrderForTournament').call(ctx);
        expect(names(ctx.mediaFiles)).toEqual(['a', 'c', 'd']);
    });
});

// ---------------------------------------------------------------------------------------------------
// The run (spec § 6–7, T3): it works on a snapshot taken at the press, saves hashes as it goes, restores
// nothing on cancel or failure, and writes nothing once stale.
// ---------------------------------------------------------------------------------------------------

describe('the run (spec § 6–7, T3)', () => {
    const handleSortBySimilarity = extract('handleSortBySimilarity');
    let saved;
    let store;
    let errorSpy;

    beforeEach(() => {
        saved = { window: globalThis.window, localStorage: globalThis.localStorage, confirm: globalThis.confirm };
        store = { sortKValue: '50' };
        globalThis.window = {
            electronAPI: { path: { join: (a, b) => `${a}/${b}`, basename: (p) => p.split('/').pop() } },
        };
        globalThis.localStorage = {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => {
                store[k] = String(v);
            },
        };
        globalThis.confirm = () => true;
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        globalThis.window = saved.window;
        globalThis.localStorage = saved.localStorage;
        globalThis.confirm = saved.confirm;
        errorSpy.mockRestore();
    });

    /** Three images a, b, c in /f, past every guard, with the run's collaborators stubbed. */
    function runCtx(overrides = {}) {
        return similarityCtx({
            sortAlgorithm: 'vptree',
            baseFolderPath: '/f',
            mediaFiles: media('a', 'b', 'c'),
            currentIndex: 0,
            moveHistory: [],
            isCompareMode: false,
            perceptualHashes: new Map(),
            clipCache: new Map(),
            enableClipFeatures: false,
            _similarityRunGen: 0,
            _orderGeneration: 0,
            computePerceptualHash: vi.fn(async () => '0101'),
            runSortingWorker: vi.fn(async ({ mediaFiles }) => mediaFiles.map((f) => f.path).reverse()),
            loadSortCache: vi.fn(async () => null),
            loadHashCache: vi.fn(async () => 0),
            saveHashCache: vi.fn(async () => {}),
            saveSortCache: vi.fn(async () => {}),
            deleteSortCache: vi.fn(async () => {}),
            updateSortProgress: vi.fn(),
            clearProgressNotification: vi.fn(),
            _logSortPerf: vi.fn(),
            kickoffBackgroundExtractionIfEnabled: vi.fn(async () => {}),
            clipVectorsNeedExtraction: () => false,
            _isStaleSimilarityRun: extract('_isStaleSimilarityRun'),
            _assertSimilarityRunLive: extract('_assertSimilarityRunLive'),
            ...overrides,
        });
    }

    // Mid-run, during the first hash: b is moved out of the live list and d is restored into it.
    const moveBRestoreD = (ctx) => async () => {
        ctx.mediaFiles.splice(1, 1);
        ctx.mediaFiles.push(...media('d'));
        return '0101';
    };

    it('captures the algorithm and K at the press: a change mid-run sorts and saves with the captured ones', async () => {
        const ctx = runCtx();
        ctx.computePerceptualHash.mockImplementationOnce(async () => {
            ctx.sortAlgorithm = 'mst';
            store.sortKValue = '7';
            return '0101';
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.runSortingWorker).toHaveBeenCalledWith(
            expect.objectContaining({ algorithm: 'vptree', maxComparisons: 50 })
        );
        expect(ctx.saveSortCache.mock.calls[0][0]).toBe('vptree');
    });

    it('hashes the snapshot taken at the press, not the live list', async () => {
        const ctx = runCtx();
        ctx.computePerceptualHash.mockImplementationOnce(moveBRestoreD(ctx));
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.computePerceptualHash.mock.calls.map((c) => c[0])).toEqual(['/f/a', '/f/b', '/f/c']);
        expect(ctx.runSortingWorker.mock.calls[0][0].mediaFiles).toEqual([
            { path: '/f/a' },
            { path: '/f/b' },
            { path: '/f/c' },
        ]);
    });

    it('the commit drops files moved during the run and keeps files restored during it', async () => {
        const ctx = runCtx();
        ctx.computePerceptualHash.mockImplementationOnce(moveBRestoreD(ctx));
        await handleSortBySimilarity.call(ctx, false);
        expect(names(ctx.mediaFiles)).toEqual(['c', 'a', 'd']);
    });

    it('Cancel leaves the list as it is and saves the hashes computed so far', async () => {
        const ctx = runCtx();
        const listBefore = ctx.mediaFiles;
        ctx.computePerceptualHash
            .mockImplementationOnce(async () => '0101')
            .mockImplementationOnce(async () => {
                ctx.sortAbortController.abort();
                return '0101';
            });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._onOrderChanged).not.toHaveBeenCalled();
        expect(ctx._orderGeneration).toBe(0);
        expect(ctx.saveHashCache).toHaveBeenCalledWith('/f');
        expect(ctx.saveSortCache).not.toHaveBeenCalled();
        expect(ctx.perceptualHashes.has('/f/b')).toBe(false); // the in-flight result is dropped
        expect(ctx.showNotification).toHaveBeenCalledWith('❌ Sorting cancelled', 'info');
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('cancelled');
        expect([ctx.isComputingHashes, ctx.sortAbortController]).toEqual([false, null]);
    });

    it('a failure leaves the list as it is, saves the hashes and reports the error', async () => {
        const ctx = runCtx();
        const listBefore = ctx.mediaFiles;
        ctx.computePerceptualHash.mockImplementation(async (p) => {
            if (p !== '/f/a') {
                throw new Error('decode failed');
            }
            return '0101';
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx.saveHashCache).toHaveBeenCalledWith('/f');
        expect(ctx.showNotification).toHaveBeenCalledWith(
            '❌ Error: Only 1 files have valid hashes. Need at least 2 to sort.',
            'error'
        );
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('failed');
    });

    it.each([
        [
            'another folder opened',
            (ctx) => {
                ctx._similarityRunGen++;
                ctx.baseFolderPath = '/g';
            },
        ],
        [
            'the same folder reopened',
            (ctx) => {
                ctx._similarityRunGen++;
            },
        ],
    ])('a run made stale (%s) writes nothing', async (_label, switchFolder) => {
        const ctx = runCtx();
        const newList = media('x', 'y');
        ctx.computePerceptualHash.mockImplementationOnce(async () => {
            switchFolder(ctx);
            ctx.mediaFiles = newList;
            ctx.perceptualHashes = new Map();
            return '0101';
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.mediaFiles).toBe(newList);
        expect(ctx.perceptualHashes.size).toBe(0);
        for (const m of ['saveHashCache', 'saveSortCache', 'runSortingWorker', 'clearProgressNotification']) {
            expect(ctx[m], m).not.toHaveBeenCalled();
        }
        expect(ctx.showNotification.mock.calls.filter((c) => /cancelled|Error/.test(c[0]))).toEqual([]);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('stale');
        expect([ctx.isComputingHashes, ctx.sortAbortController]).toEqual([false, null]);
    });

    it('saves every 1,000 new hashes and once at the end', async () => {
        const many = Array.from({ length: 2500 }, (_, i) => `f${i}`);
        const ctx = runCtx({ mediaFiles: media(...many) });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.saveHashCache).toHaveBeenCalledTimes(3);
    });

    it('skips the end save when nothing new was hashed', async () => {
        const ctx = runCtx({
            perceptualHashes: new Map([
                ['/f/a', '0101'],
                ['/f/b', '0110'],
                ['/f/c', '1100'],
            ]),
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.saveHashCache).not.toHaveBeenCalled();
        expect(ctx.runSortingWorker).toHaveBeenCalledOnce();
    });

    function clipCtx(overrides = {}) {
        const vec = () => new Float32Array([1, 0]);
        return runCtx({
            sortAlgorithm: 'clip',
            enableClipFeatures: true,
            clipVectorsNeedExtraction: () => true,
            currentIndex: 1,
            clipCache: new Map(['a', 'b', 'c', 'd'].map((n) => [`/f/${n}`, vec()])),
            ...overrides,
        });
    }

    it('a CLIP run sorts the snapshot from the captured start file', async () => {
        const ctx = clipCtx();
        // d is restored into the live list while the run waits on the extraction.
        ctx.kickoffBackgroundExtractionIfEnabled = vi.fn(async () => {
            ctx.mediaFiles = [...ctx.mediaFiles, ...media('d')];
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.runSortingWorker).toHaveBeenCalledWith(
            expect.objectContaining({ algorithm: 'clip', currentIndex: 1 })
        );
        expect(Object.keys(ctx.runSortingWorker.mock.calls[0][0].clipVectors)).toEqual(['/f/a', '/f/b', '/f/c']);
    });

    it.each(['cancelled', 'stale'])('a CLIP run %s during its extraction wait writes nothing', async (how) => {
        const ctx = clipCtx();
        const listBefore = ctx.mediaFiles;
        ctx.kickoffBackgroundExtractionIfEnabled = vi.fn(async () => {
            if (how === 'cancelled') {
                ctx.sortAbortController.abort();
            } else {
                ctx._similarityRunGen++;
            }
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.runSortingWorker).not.toHaveBeenCalled();
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx.saveHashCache).not.toHaveBeenCalled();
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe(how);
    });

    it('writes one perf record per run', async () => {
        const ctx = runCtx();
        await handleSortBySimilarity.call(ctx, false);
        const [perf] = ctx._logSortPerf.mock.calls[0];
        expect(ctx._logSortPerf).toHaveBeenCalledOnce();
        expect(perf).toMatchObject({ label: 'Similarity sort', outcome: 'done', files: 3 });
        expect(perf.phases.map((p) => p[0])).toEqual(['load', 'hash', 'save', 'sort', 'apply']);
        expect(perf.phases[1][2]).toBe('new 3, skipped 0');
    });
});

describe('_invalidateSimilarityRun', () => {
    it('bumps the gen; while a run computes, also aborts it and clears its card', () => {
        const invalidate = extract('_invalidateSimilarityRun');
        const ctx = {
            _similarityRunGen: 3,
            isComputingHashes: false,
            sortAbortController: new AbortController(),
            clearProgressNotification: vi.fn(),
        };
        invalidate.call(ctx);
        expect(ctx._similarityRunGen).toBe(4);
        expect(ctx.sortAbortController.signal.aborted).toBe(false);
        expect(ctx.clearProgressNotification).not.toHaveBeenCalled();

        ctx.isComputingHashes = true;
        invalidate.call(ctx);
        expect(ctx._similarityRunGen).toBe(5);
        expect(ctx.sortAbortController.signal.aborted).toBe(true);
        expect(ctx.clearProgressNotification).toHaveBeenCalledOnce();
    });
});
