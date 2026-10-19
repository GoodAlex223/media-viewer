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
    // The parameter list may hold one level of parentheses (a default like `isLive = () => true`).
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

/** A stand-in for the sorting Web Worker: records what it is sent and whether it was terminated. */
class FakeWorker {
    static instances = [];
    constructor(url) {
        this.url = url;
        this.posted = [];
        this.terminated = false;
        this.onmessage = null;
        this.onerror = null;
        FakeWorker.instances.push(this);
    }
    postMessage(message) {
        this.posted.push(message);
    }
    terminate() {
        this.terminated = true;
    }
}

/** 'settled' if the promise settles (either way) within `ms`, else 'pending'. */
function settledWithin(promise, ms) {
    return Promise.race([
        promise.then(
            () => 'settled',
            () => 'settled'
        ),
        new Promise((resolve) => setTimeout(() => resolve('pending'), ms)),
    ]);
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
        _dismissSimilarityOffer: vi.fn(),
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

/** The run's globals (window.electronAPI.path, localStorage, confirm), installed per test. */
let store;
function useRunGlobals() {
    let saved;
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
}

/**
 * Three images a, b, c in /f, past every guard, with the run's collaborators stubbed. The run's end is
 * stubbed too (T4): with the real apply function the placement would hash files restored mid-run.
 */
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
        formatTimeAgo: () => 'just now',
        _logSortPerf: vi.fn(),
        kickoffBackgroundExtractionIfEnabled: vi.fn(async () => {}),
        clipVectorsNeedExtraction: () => false,
        _isStaleSimilarityRun: extract('_isStaleSimilarityRun'),
        _assertSimilarityRunLive: extract('_assertSimilarityRunLive'),
        _applySimilarityOrder: vi.fn(async () => ({
            applied: true,
            stats: { cached: 0, added: 0, removed: 0 },
            committedPaths: [],
        })),
        _offerSimilarityOrder: vi.fn(),
        _dismissSimilarityOffer: vi.fn(),
        ...overrides,
    });
}

describe('the run (spec § 6–7, T3)', () => {
    const handleSortBySimilarity = extract('handleSortBySimilarity');
    useRunGlobals();

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

    // Fix round 1: sorting-worker.js's loops are synchronous, so its abort flag is read only after the loop
    // ends and it keeps posting progress. A run made stale while the worker sorts must end at once, silently.
    it('a run made stale while the worker sorts ends at once and writes nothing more', async () => {
        const savedWorker = globalThis.Worker;
        globalThis.Worker = FakeWorker;
        FakeWorker.instances = [];
        try {
            const ctx = runCtx({
                sortingWorker: null,
                runSortingWorker: extract('runSortingWorker'),
                _invalidateSimilarityRun: extract('_invalidateSimilarityRun'),
            });
            const done = handleSortBySimilarity.call(ctx, false);
            await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
            const [worker] = FakeWorker.instances;

            // loadFolder for another folder: it invalidates the run while the worker is still sorting.
            ctx.baseFolderPath = '/g';
            ctx._invalidateSimilarityRun();
            const progressCalls = ctx.updateSortProgress.mock.calls.length;
            const hashSaves = ctx.saveHashCache.mock.calls.length;
            worker.onmessage?.({ data: { type: 'progress', message: 'Sorting…', current: 1, total: 3 } });

            expect(await settledWithin(done, 50)).toBe('settled');
            expect(worker.terminated).toBe(true);
            expect(ctx.updateSortProgress.mock.calls.length).toBe(progressCalls);
            expect(ctx.clearProgressNotification).toHaveBeenCalledOnce(); // the invalidate's own clear
            expect(ctx.saveHashCache.mock.calls.length).toBe(hashSaves);
            expect(ctx.saveSortCache).not.toHaveBeenCalled();
            expect(ctx.showNotification.mock.calls.filter((c) => /cancelled|Error/.test(c[0]))).toEqual([]);
            expect([ctx.isComputingHashes, ctx.sortAbortController]).toEqual([false, null]);
            expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('stale');
        } finally {
            globalThis.Worker = savedWorker;
        }
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
            _dismissSimilarityOffer: vi.fn(),
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

// Fix round 1 (T3 review): the worker's sort loops are synchronous, so its abort flag is read only after the
// loop ends. runSortingWorker itself must stop on abort: terminate, reject at once, ignore late messages.
describe('runSortingWorker stops on abort (T3 fix round 1)', () => {
    const runSortingWorker = extract('runSortingWorker');
    let savedWorker;
    beforeEach(() => {
        savedWorker = globalThis.Worker;
        globalThis.Worker = FakeWorker;
        FakeWorker.instances = [];
    });
    afterEach(() => {
        globalThis.Worker = savedWorker;
    });

    const progress = { data: { type: 'progress', message: 'Sorting…', current: 1, total: 3 } };

    it('an abort mid-sort terminates the worker, rejects at once and ignores a later progress message', async () => {
        const ctx = { sortingWorker: null, sortAbortController: new AbortController(), updateSortProgress: vi.fn() };
        const sorting = runSortingWorker.call(ctx, { algorithm: 'vptree' });
        const [worker] = FakeWorker.instances;
        worker.onmessage(progress);
        expect(ctx.updateSortProgress).toHaveBeenCalledOnce();

        ctx.sortAbortController.abort();
        expect(await settledWithin(sorting, 50)).toBe('settled');
        await expect(sorting).rejects.toThrow('Sorting cancelled by user');
        expect(worker.terminated).toBe(true);
        expect(ctx.sortingWorker).toBeNull();

        worker.onmessage(progress);
        expect(ctx.updateSortProgress).toHaveBeenCalledOnce();
    });

    it('rejects without starting a worker when the controller is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const ctx = { sortingWorker: null, sortAbortController: controller, updateSortProgress: vi.fn() };
        const sorting = runSortingWorker.call(ctx, { algorithm: 'vptree' });
        expect(await settledWithin(sorting, 50)).toBe('settled');
        await expect(sorting).rejects.toThrow('Sorting cancelled by user');
        expect(FakeWorker.instances).toHaveLength(0);
    });

    it('leaves the worker of a newer call in place when an older call is aborted', async () => {
        const controller = new AbortController();
        const ctx = { sortingWorker: null, sortAbortController: controller, updateSortProgress: vi.fn() };
        const sorting = runSortingWorker.call(ctx, { algorithm: 'vptree' });
        const newer = new FakeWorker('sorting-worker.js');
        ctx.sortingWorker = newer;
        controller.abort();
        await expect(sorting).rejects.toThrow('Sorting cancelled by user');
        expect(ctx.sortingWorker).toBe(newer);
    });

    it('without a controller it still resolves on complete', async () => {
        const ctx = { sortingWorker: null, sortAbortController: null, updateSortProgress: vi.fn() };
        const sorting = runSortingWorker.call(ctx, { algorithm: 'vptree' });
        FakeWorker.instances[0].onmessage({ data: { type: 'complete', sortedPaths: ['/f/b', '/f/a'] } });
        await expect(sorting).resolves.toEqual(['/f/b', '/f/a']);
        expect(ctx.sortingWorker).toBeNull();
    });
});

// ---------------------------------------------------------------------------------------------------
// How a run ends (spec § 8, D3, my calls 2–3, A4, A7, A9; T4): one apply function, or Show.
// ---------------------------------------------------------------------------------------------------

const hamming = (h1, h2) => {
    if (!h1 || !h2 || h1.length !== h2.length) {
        return Infinity;
    }
    let d = 0;
    for (let i = 0; i < h1.length; i++) {
        if (h1[i] !== h2[i]) {
            d++;
        }
    }
    return d;
};

const sortEntry = (overrides = {}) => ({
    gen: 1,
    folder: '/f',
    algorithm: 'vptree',
    sortedPaths: ['c', 'a', 'b', 'e'],
    startFile: 'c',
    doneMessage: '✅ Sorted 4 files with VP-Tree (fastest)!',
    ...overrides,
});

describe('_applySimilarityOrder (spec § 8, A4)', () => {
    const apply = extract('_applySimilarityOrder');
    useRunGlobals();

    /** Live [a, c, d, e] in /f; the real placement (applyCachedSortOrder + insertNewFilesInSortedOrder). */
    function applyCtx(overrides = {}) {
        return similarityCtx({
            baseFolderPath: '/f',
            _similarityRunGen: 1,
            _fileOpInFlight: false,
            mediaFiles: media('a', 'c', 'd', 'e'),
            currentIndex: 2,
            perceptualHashes: new Map([
                ['/f/c', '1111'],
                ['/f/a', '0000'],
                ['/f/e', '0011'],
                ['/f/d', '0001'],
            ]),
            clipCache: new Map(),
            calculateHammingDistance: hamming,
            computePerceptualHash: vi.fn(async () => '0001'),
            updateSortProgress: vi.fn(),
            applyCachedSortOrder: extract('applyCachedSortOrder'),
            insertNewFilesInSortedOrder: extract('insertNewFilesInSortedOrder'),
            _waitForRenderIdle: vi.fn(async () => {}),
            _isStaleSimilarityRun: extract('_isStaleSimilarityRun'),
            ...overrides,
        });
    }

    it('drops files moved since, places files restored since by similarity, and lands on the start file', async () => {
        const ctx = applyCtx();
        const r = await apply.call(ctx, sortEntry());
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['c', 'a', 'd', 'e']);
        expect(r).toMatchObject({ applied: true, committedPaths: ['/f/c', '/f/a', '/f/d', '/f/e'] });
        expect(r.stats).toEqual({ cached: 3, removed: 1, added: 1 });
        expect(ctx.currentIndex).toBe(0);
        expect(ctx._onOrderChanged).toHaveBeenCalledWith('other');
        expect(ctx.isSortedBySimilarity).toBe(true);
        expect(ctx.sortSimilarityBtn.querySelector('.btn-label').textContent).toBe('Restore Order');
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('computes, waits for an in-flight render, then commits', async () => {
        const seq = [];
        const ctx = applyCtx({
            applyCachedSortOrder: vi.fn(async function () {
                seq.push('compute');
                return { order: [...this.mediaFiles].reverse(), stats: { cached: 4, added: 0, removed: 0 } };
            }),
            _waitForRenderIdle: vi.fn(async () => {
                seq.push('wait');
            }),
            _onOrderChanged: vi.fn(() => seq.push('commit')),
        });
        await apply.call(ctx, sortEntry());
        expect(seq).toEqual(['compute', 'wait', 'commit']);
    });

    it.each([
        [
            'busy',
            (ctx) => {
                ctx._fileOpInFlight = true;
            },
        ],
        [
            'stale',
            (ctx) => {
                ctx._similarityRunGen++;
            },
        ],
        [
            'tournament',
            (ctx) => {
                ctx.isTournamentMode = true;
            },
        ],
    ])('declines (%s) when the state changed during the wait, writing nothing', async (reason, change) => {
        const ctx = applyCtx();
        ctx._waitForRenderIdle = vi.fn(async () => change(ctx));
        const listBefore = ctx.mediaFiles;
        expect(await apply.call(ctx, sortEntry())).toEqual({ applied: false, reason });
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._onOrderChanged).not.toHaveBeenCalled();
        expect(ctx.originalMediaFiles).toEqual([]);
        expect(ctx.isSortedBySimilarity).toBe(false);
        expect(ctx.currentIndex).toBe(2);
        expect(ctx.showMedia).not.toHaveBeenCalled();
    });

    it('an emptied list is left alone', async () => {
        // every file moved away during the run
        const ctx = applyCtx({ mediaFiles: [] });
        expect(await apply.call(ctx, sortEntry())).toEqual({ applied: false, reason: 'empty' });
        expect(ctx.showMedia).not.toHaveBeenCalled();
        expect(ctx._onOrderChanged).not.toHaveBeenCalled();
    });

    it.each([
        [false, 'takes the Restore Order snapshot now'],
        [true, 'keeps the existing snapshot (forced re-sort)'],
    ])('already sorted %s: %s', async (sorted) => {
        const earlier = media('z');
        const ctx = applyCtx({ isSortedBySimilarity: sorted, originalMediaFiles: earlier });
        // A file is restored during the wait: the snapshot is the live list AT THE COMMIT.
        ctx._waitForRenderIdle = vi.fn(async () => {
            ctx.mediaFiles = [...ctx.mediaFiles, ...media('f')];
        });
        await apply.call(ctx, sortEntry());
        if (sorted) {
            expect(ctx.originalMediaFiles).toBe(earlier);
        } else {
            expect(names(ctx.originalMediaFiles)).toEqual(['a', 'c', 'd', 'e', 'f']);
        }
    });

    // R-T4a: a placement made stale mid-await stores no hash and makes no progress call after that point.
    it('a placement made stale mid-hash stores no hash, makes no progress call after it and commits nothing', async () => {
        let progressAtStale = null;
        const ctx = applyCtx({
            perceptualHashes: new Map([
                ['/f/c', '1111'],
                ['/f/a', '0000'],
                ['/f/e', '0011'],
            ]),
        });
        ctx.computePerceptualHash = vi.fn(async () => {
            ctx._similarityRunGen++; // a folder switch while d is hashed
            progressAtStale = ctx.updateSortProgress.mock.calls.length;
            return '0001';
        });
        const listBefore = ctx.mediaFiles;
        await expect(apply.call(ctx, sortEntry())).rejects.toThrow('Sorting cancelled by user');
        expect(ctx.computePerceptualHash).toHaveBeenCalledOnce();
        expect(ctx.perceptualHashes.has('/f/d')).toBe(false);
        expect(ctx.updateSortProgress.mock.calls.length).toBe(progressAtStale);
        expect(ctx._waitForRenderIdle).not.toHaveBeenCalled();
        expect(ctx.mediaFiles).toBe(listBefore);
    });
});

describe('the offer and Show (spec D3, my call 2, A7)', () => {
    const offer = extract('_offerSimilarityOrder');
    const onShow = extract('_onSimilarityShow');

    function showCtx(overrides = {}) {
        const entry = sortEntry();
        const ctx = similarityCtx({
            baseFolderPath: '/f',
            _similarityRunGen: 1,
            _fileOpInFlight: false,
            _folderLoadInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _refuseIfFolderLoadInFlight: extract('_refuseIfFolderLoadInFlight'),
            _isStaleSimilarityRun: extract('_isStaleSimilarityRun'),
            _dismissSimilarityOffer: extract('_dismissSimilarityOffer'),
            _offerSimilarityOrder: vi.fn(),
            _applySimilarityOrder: vi.fn(async () => ({
                applied: true,
                stats: { cached: 4, added: 0, removed: 0 },
                committedPaths: [],
            })),
            clearProgressNotification: vi.fn(),
            _similarityOffer: { entry, element: { remove: vi.fn() } },
            ...overrides,
        });
        return { ctx, entry };
    }

    it('a new offer replaces an earlier one', () => {
        const first = { remove: vi.fn() };
        const second = { remove: vi.fn() };
        const ctx = similarityCtx({
            _similarityOffer: null,
            _dismissSimilarityOffer: extract('_dismissSimilarityOffer'),
            _onSimilarityShow: vi.fn(),
            showNotification: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
        });
        const e1 = sortEntry();
        const e2 = sortEntry({ gen: 2 });
        offer.call(ctx, e1);
        offer.call(ctx, e2);
        expect(first.remove).toHaveBeenCalledOnce();
        expect(second.remove).not.toHaveBeenCalled();
        expect(ctx._similarityOffer).toEqual({ entry: e2, element: second });
        expect(ctx.showNotification).toHaveBeenCalledWith(
            'Similarity order ready',
            'success',
            expect.objectContaining({ sticky: true, actionButton: 'Show' })
        );
        ctx.showNotification.mock.calls[1][2].actionCallback();
        expect(ctx._onSimilarityShow).toHaveBeenCalledOnce();
    });

    it.each([
        ['in Tournament mode', { isTournamentMode: true }, []],
        ['during a file action', { _fileOpInFlight: true }, [['Wait for the move to finish', 'info']]],
        ['during a folder load', { _folderLoadInFlight: true }, [['Wait for the folder to finish loading', 'info']]],
        ['while a sort runs', { isComputingHashes: true }, [['Wait for the sort to finish', 'info']]],
        ['while an AI sort runs', { isPredictionSorting: true }, [['Wait for the sort to finish', 'info']]],
    ])('Show refuses %s and keeps the offer', async (_l, state, notices) => {
        const { ctx } = showCtx(state);
        await onShow.call(ctx);
        expect(ctx._applySimilarityOrder).not.toHaveBeenCalled();
        expect(ctx._similarityOffer).not.toBeNull();
        expect(ctx.showNotification.mock.calls).toEqual(notices);
    });

    it('Show on a stale offer dismisses it and applies nothing', async () => {
        const { ctx } = showCtx({ _similarityRunGen: 2 });
        const { element } = ctx._similarityOffer;
        await onShow.call(ctx);
        expect(element.remove).toHaveBeenCalledOnce();
        expect(ctx._similarityOffer).toBeNull();
        expect(ctx._applySimilarityOrder).not.toHaveBeenCalled();
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    it('Show applies the offered order and reports it', async () => {
        const { ctx, entry } = showCtx();
        await onShow.call(ctx);
        expect(ctx._applySimilarityOrder).toHaveBeenCalledWith(entry);
        expect(ctx.showNotification).toHaveBeenCalledWith(entry.doneMessage, 'success');
        expect(ctx._similarityOffer).toBeNull();
    });

    it('a busy commit puts the offer back', async () => {
        const { ctx, entry } = showCtx();
        ctx._applySimilarityOrder = vi.fn(async () => ({ applied: false, reason: 'busy' }));
        await onShow.call(ctx);
        expect(ctx._offerSimilarityOrder).toHaveBeenCalledWith(entry);
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    it('a failed apply reports the error', async () => {
        const { ctx } = showCtx();
        ctx._applySimilarityOrder = vi.fn(async () => {
            throw new Error('boom');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await onShow.call(ctx);
        } finally {
            errorSpy.mockRestore();
        }
        expect(ctx.showNotification.mock.calls).toEqual([['❌ Error: boom', 'error']]);
    });

    // R-T4a: a folder switch during Show's apply makes the entry stale; its placement throws, silently.
    it('a throw on an entry gone stale during the apply shows no notice', async () => {
        const { ctx } = showCtx();
        ctx._applySimilarityOrder = vi.fn(async () => {
            ctx._similarityRunGen++;
            throw new Error('Sorting cancelled by user');
        });
        await onShow.call(ctx);
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    // P1: Show runs outside any run; after its apply it clears the card unless a sort started meanwhile.
    it.each([
        ['after an applied order', async () => ({ applied: true, stats: {}, committedPaths: [] }), true],
        [
            'after a throw',
            async () => {
                throw new Error('boom');
            },
            true,
        ],
        [
            'not when a similarity sort started meanwhile',
            async function () {
                this.isComputingHashes = true;
                return { applied: true, stats: {}, committedPaths: [] };
            },
            false,
        ],
        [
            'not when an AI sort started meanwhile',
            async function () {
                this.isPredictionSorting = true;
                return { applied: true, stats: {}, committedPaths: [] };
            },
            false,
        ],
    ])('Show clears the card %s', async (_l, applyImpl, clears) => {
        const { ctx } = showCtx();
        const seq = [];
        ctx._applySimilarityOrder = vi.fn(async function (...args) {
            seq.push('apply');
            return applyImpl.apply(this, args);
        });
        ctx.clearProgressNotification = vi.fn(() => seq.push('clear'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await onShow.call(ctx);
        } finally {
            errorSpy.mockRestore();
        }
        expect(seq).toEqual(clears ? ['apply', 'clear'] : ['apply']);
    });
});

describe('how a run ends (my call 3)', () => {
    const handleSortBySimilarity = extract('handleSortBySimilarity');
    useRunGlobals();

    it('a computed run applies directly when the user did nothing', async () => {
        const ctx = runCtx();
        const seq = [];
        ctx._applySimilarityOrder.mockImplementation(async () => {
            seq.push('apply');
            return { applied: true, stats: { cached: 3, added: 0, removed: 0 }, committedPaths: [] };
        });
        ctx.clearProgressNotification = vi.fn(() => seq.push('clear'));
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx._applySimilarityOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                algorithm: 'vptree',
                sortedPaths: ['c', 'b', 'a'],
                startFile: 'a',
                gen: ctx._similarityRunGen,
                folder: '/f',
            })
        );
        expect(ctx._offerSimilarityOrder).not.toHaveBeenCalled();
        expect(ctx.showNotification).toHaveBeenCalledWith('✅ Sorted 3 files with VP-Tree (fastest)!', 'success');
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('done');
        // P1: the card is cleared after the apply (whose placement may re-create it), never before.
        expect(seq).toEqual(['apply', 'clear']);
    });

    it.each([
        [
            'navigated',
            (ctx) => {
                ctx.currentIndex = 1;
            },
        ],
        [
            'rated a file',
            (ctx) => {
                ctx.moveHistory.push({});
            },
        ],
        [
            'switched to compare',
            (ctx) => {
                ctx.isCompareMode = true;
            },
        ],
    ])('a computed run offers Show when the user %s during it', async (_l, act) => {
        const ctx = runCtx();
        const listBefore = ctx.mediaFiles;
        ctx.computePerceptualHash.mockImplementationOnce(async () => {
            act(ctx);
            return '0101';
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx._offerSimilarityOrder).toHaveBeenCalledOnce();
        expect(ctx._offerSimilarityOrder.mock.calls[0][0]).toMatchObject({
            sortedPaths: ['c', 'b', 'a'],
            doneMessage: '✅ Sorted 3 files with VP-Tree (fastest)!',
        });
        expect(ctx._applySimilarityOrder).not.toHaveBeenCalled();
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('offered');
        expect(ctx.clearProgressNotification).toHaveBeenCalledOnce();
    });

    it('a busy direct apply falls back to Show', async () => {
        const ctx = runCtx();
        ctx._applySimilarityOrder.mockResolvedValue({ applied: false, reason: 'busy' });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx._offerSimilarityOrder).toHaveBeenCalledWith(ctx._applySimilarityOrder.mock.calls[0][0]);
        expect(ctx.showNotification.mock.calls.filter((c) => /✅/.test(c[0]))).toEqual([]);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('offered');
    });

    it.each(['empty', 'tournament'])('a direct apply declined (%s) ends done with nothing written', async (reason) => {
        const ctx = runCtx();
        ctx._applySimilarityOrder.mockResolvedValue({ applied: false, reason });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx._offerSimilarityOrder).not.toHaveBeenCalled();
        expect(ctx.showNotification.mock.calls.filter((c) => /✅|❌/.test(c[0]))).toEqual([]);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('done');
    });

    it('a cache hit applies through the apply function with the captured algorithm', async () => {
        const ctx = runCtx({
            loadSortCache: vi.fn(async () => ({ algorithm: 'mst', sortedPaths: ['c', 'b', 'a'], timestamp: 1 })),
        });
        ctx._applySimilarityOrder.mockResolvedValue({
            applied: true,
            stats: { cached: 3, added: 0, removed: 0 },
            committedPaths: ['/f/c', '/f/b', '/f/a'],
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx._applySimilarityOrder.mock.calls[0][0]).toMatchObject({
            algorithm: 'vptree',
            gen: ctx._similarityRunGen,
            folder: '/f',
            sortedPaths: ['c', 'b', 'a'],
        });
        expect(ctx.showNotification).toHaveBeenCalledWith(
            '✅ Restored cached VP-Tree (fastest) order (3 cached) — cached just now',
            'success'
        );
        expect(ctx.saveHashCache).not.toHaveBeenCalled();
        expect(ctx.saveSortCache).not.toHaveBeenCalled();
        expect(ctx.computePerceptualHash).not.toHaveBeenCalled();
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('done');
    });

    it('a cache hit with new files saves both caches from the committed order', async () => {
        const ctx = runCtx({
            loadSortCache: vi.fn(async () => ({ algorithm: 'vptree', sortedPaths: ['c', 'a'], timestamp: 1 })),
        });
        const committedPaths = ['/f/c', '/f/b', '/f/a'];
        ctx._applySimilarityOrder.mockResolvedValue({
            applied: true,
            stats: { cached: 2, added: 1, removed: 0 },
            committedPaths,
        });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.saveHashCache).toHaveBeenCalledWith('/f');
        expect(ctx.saveSortCache).toHaveBeenCalledWith('vptree', committedPaths, '/f/c', '/f');
    });

    it('a busy cache-hit apply falls back to Show', async () => {
        const ctx = runCtx({
            loadSortCache: vi.fn(async () => ({ algorithm: 'vptree', sortedPaths: ['c', 'a'], timestamp: 1 })),
        });
        ctx._applySimilarityOrder.mockResolvedValue({ applied: false, reason: 'busy' });
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx._offerSimilarityOrder).toHaveBeenCalledWith(ctx._applySimilarityOrder.mock.calls[0][0]);
        expect(ctx.saveSortCache).not.toHaveBeenCalled();
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('offered');
    });

    it('a cancel during the cache-hit placement leaves the list as it is', async () => {
        const ctx = runCtx({
            loadSortCache: vi.fn(async () => ({ algorithm: 'vptree', sortedPaths: ['c', 'a'], timestamp: 1 })),
            _applySimilarityOrder: extract('_applySimilarityOrder'),
            _waitForRenderIdle: vi.fn(async () => {}),
            _fileOpInFlight: false,
        });
        ctx.applyCachedSortOrder = vi.fn(async () => {
            ctx.sortAbortController.abort();
            throw new Error('Sorting cancelled by user');
        });
        const listBefore = ctx.mediaFiles;
        await handleSortBySimilarity.call(ctx, false);
        expect(ctx.applyCachedSortOrder).toHaveBeenCalledOnce();
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._onOrderChanged).not.toHaveBeenCalled();
        expect(ctx.saveSortCache).not.toHaveBeenCalled();
        expect(ctx.showNotification).toHaveBeenCalledWith('❌ Sorting cancelled', 'info');
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('cancelled');
    });

    it('a sort press that passes the refusals dismisses a pending offer; a refused one keeps it', async () => {
        const passed = runCtx();
        await handleSortBySimilarity.call(passed, false);
        expect(passed._dismissSimilarityOffer).toHaveBeenCalledOnce();

        const restore = runCtx({ isSortedBySimilarity: true, originalMediaFiles: media('a', 'b', 'c') });
        await handleSortBySimilarity.call(restore, false);
        expect(restore._dismissSimilarityOffer).toHaveBeenCalledOnce();

        const refused = runCtx({ _refuseIfFileOpInFlight: vi.fn(() => true) });
        await handleSortBySimilarity.call(refused, false);
        expect(refused._dismissSimilarityOffer).not.toHaveBeenCalled();

        const declined = runCtx({ mediaFiles: media(...Array.from({ length: 1001 }, (_, i) => `f${i}`)) });
        globalThis.confirm = () => false;
        await handleSortBySimilarity.call(declined, false);
        expect(declined._dismissSimilarityOffer).not.toHaveBeenCalled();
    });

    it('Tournament entry and a folder switch dismiss the offer', () => {
        const tournament = similarityCtx();
        extract('restoreOriginalOrderForTournament').call(tournament);
        expect(tournament._dismissSimilarityOffer).toHaveBeenCalledOnce();

        const folder = {
            _similarityRunGen: 0,
            isComputingHashes: false,
            sortAbortController: null,
            clearProgressNotification: vi.fn(),
            _dismissSimilarityOffer: vi.fn(),
        };
        extract('_invalidateSimilarityRun').call(folder);
        expect(folder._dismissSimilarityOffer).toHaveBeenCalledOnce();
    });
});

describe('showNotification: sticky (spec D3)', () => {
    // Vitest runs in node: this block stands up the few DOM pieces showNotification touches.
    let savedDocument;
    let savedSetTimeout;
    let timers;

    function el(tag) {
        const listeners = {};
        const node = {
            tag,
            className: '',
            textContent: '',
            title: '',
            style: {},
            children: [],
            parentNode: null,
            appendChild(child) {
                child.parentNode = node;
                node.children.push(child);
                return child;
            },
            remove() {
                if (node.parentNode) {
                    node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
                    node.parentNode = null;
                }
            },
            addEventListener(type, fn) {
                (listeners[type] ??= []).push(fn);
            },
            click() {
                for (const fn of listeners.click ?? []) {
                    fn({ stopPropagation() {} });
                }
            },
        };
        return node;
    }

    function container() {
        const c = el('div');
        const classes = (n) => n.className.split(' ');
        c.querySelectorAll = (selector) => {
            const all = c.children;
            if (selector === '.notification:not(.sticky)') {
                return all.filter((n) => !classes(n).includes('sticky'));
            }
            if (selector === '.notification.info:not(.sticky)') {
                return all.filter((n) => !classes(n).includes('sticky') && classes(n).includes('info'));
            }
            if (selector === '.notification') {
                return all;
            }
            if (selector === '.notification.info') {
                return all.filter((n) => classes(n).includes('info'));
            }
            throw new Error(`unexpected selector ${selector}`);
        };
        return c;
    }

    beforeEach(() => {
        savedDocument = globalThis.document;
        savedSetTimeout = globalThis.setTimeout;
        timers = [];
        globalThis.document = { createElement: (tag) => el(tag) };
        globalThis.setTimeout = (fn, ms) => {
            timers.push({ fn, ms });
            return timers.length;
        };
    });
    afterEach(() => {
        globalThis.document = savedDocument;
        globalThis.setTimeout = savedSetTimeout;
    });

    const showNotification = extract('showNotification');

    it('returns its element; a sticky one has the class, no auto-close, and survives both prunes', () => {
        const ctx = { notificationContainer: container(), autoCloseErrors: true };
        const callback = vi.fn();
        const sticky = showNotification.call(ctx, 'Similarity order ready', 'success', {
            sticky: true,
            actionButton: 'Show',
            actionCallback: callback,
        });
        expect(sticky.className).toBe('notification success sticky');
        expect(timers).toEqual([]); // no auto-close
        for (let i = 0; i < 6; i++) {
            showNotification.call(ctx, `info ${i}`, 'info');
        }
        for (let i = 0; i < 6; i++) {
            showNotification.call(ctx, `ok ${i}`, 'success');
        }
        expect(ctx.notificationContainer.children).toContain(sticky);

        // The action button runs the callback and leaves the notification open.
        timers = [];
        const actionBtn = sticky.children.find((c) => c.className === 'notification-action');
        actionBtn.click();
        expect(callback).toHaveBeenCalledOnce();
        expect(timers).toEqual([]);

        // × still closes it.
        const closeBtn = sticky.children.find((c) => c.className === 'notification-close');
        closeBtn.click();
        const close = timers.find((t) => t.ms === 300);
        expect(close).toBeDefined();
        close.fn();
        expect(ctx.notificationContainer.children).not.toContain(sticky);
    });

    it('a non-sticky notification is returned too and still auto-closes', () => {
        const ctx = { notificationContainer: container(), autoCloseErrors: true };
        const n = showNotification.call(ctx, 'hello', 'success');
        expect(n.className).toBe('notification success');
        expect(timers.map((t) => t.ms)).toEqual([2000]);
    });
});
