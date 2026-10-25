// G2 like-or-skip glue (spec docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md):
// the MediaViewer methods that connect like-or-skip.js to the app, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as LikeOrSkip from '../like-or-skip.js';
import * as SimilaritySort from '../similarity-sort.js';
import * as HashPool from '../hash-pool.js';
import { stubFeatureCacheStore } from './feature-cache-harness.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// media-viewer.js imports each module as a namespace. An extracted method runs in the global scope, so
// it resolves `LikeOrSkip` and `SimilaritySort` through the global object.
globalThis.LikeOrSkip = LikeOrSkip;
globalThis.SimilaritySort = SimilaritySort;
globalThis.HashPool = HashPool;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// The parameter list may hold one level of parentheses (a default like `isLive = () => true`).
const METHOD_HEADER = /^ {4}(async\s+)?([A-Za-z_$][\w$]*)\s*\(((?:[^()]|\([^()]*\))*)\)\s*\{\s*$/;
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);

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

const media = (...names) => names.map((n) => ({ name: n, path: `/f/${n}`, size: 10, type: 'image/jpeg' }));
const activeTracker = (...skippedPaths) => {
    const t = new LikeOrSkip.SkipTracker();
    t.activate();
    for (const p of skippedPaths) {
        t.recordSkip(p);
    }
    return t;
};

describe('_onOrderChanged — the one place a reorder is announced (spec § 4)', () => {
    const onOrderChanged = extract('_onOrderChanged');

    function hookCtx(overrides = {}) {
        return {
            _orderGeneration: 0,
            likeOrSkip: new LikeOrSkip.SkipTracker(),
            mediaFiles: media('a', 'b', 'c'),
            moveHistory: [],
            _staleMark: null,
            _pendingStaleMark: null,
            showNotification: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('a fresh AI sort turns tracking on with an empty set and bumps the generation', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a') });
        onOrderChanged.call(ctx, 'ai-fresh');
        expect(ctx.likeOrSkip.active).toBe(true);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
        expect(ctx._orderGeneration).toBe(1);
    });

    it('a re-sort keeps the skips', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a') });
        onOrderChanged.call(ctx, 'ai-resort');
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/a']);
    });

    it('leaving the AI order clears the skips and says how many', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a', '/f/c') });
        onOrderChanged.call(ctx, 'other');
        expect(ctx.likeOrSkip.active).toBe(false);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
        expect(ctx.showNotification).toHaveBeenCalledWith('Skipped list cleared (2 files)', 'info');
    });

    it('a folder change clears silently', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a') });
        onOrderChanged.call(ctx, 'folder');
        expect(ctx.likeOrSkip.active).toBe(false);
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    it('no notice when nothing was skipped', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker() });
        onOrderChanged.call(ctx, 'other');
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });
});

describe('nextMedia records a skip on the AI order (spec § 5)', () => {
    const nextMedia = extract('nextMedia');

    function navCtx(overrides = {}) {
        return {
            mediaFiles: media('a', 'b', 'c'),
            currentIndex: 0,
            isLoading: false,
            mediaNavigationInProgress: false,
            _fileOpInFlight: false,
            isCompareMode: false,
            isSortedByPrediction: true,
            mlComparePairIndex: 0,
            computeValidComparePairs: () => [],
            likeOrSkip: activeTracker(),
            signalUserActivity: vi.fn(),
            showMedia: vi.fn(),
            showDropZone: vi.fn(),
            ...overrides,
        };
    }

    it('records the file being left', () => {
        const ctx = navCtx();
        nextMedia.call(ctx);
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/a']);
        expect(ctx.currentIndex).toBe(1);
    });

    it('records nothing while tracking is off', () => {
        const ctx = navCtx({ likeOrSkip: new LikeOrSkip.SkipTracker() });
        nextMedia.call(ctx);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });

    it('records nothing for a refused Next (a render or a file action in flight)', () => {
        for (const flag of ['isLoading', 'mediaNavigationInProgress', '_fileOpInFlight']) {
            const ctx = navCtx({ [flag]: true });
            nextMedia.call(ctx);
            expect(ctx.likeOrSkip.skipped.size, flag).toBe(0);
        }
    });

    it('records nothing on a one-file list (Next goes nowhere)', () => {
        const ctx = navCtx({ mediaFiles: media('a') });
        nextMedia.call(ctx);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });

    it('records nothing in compare mode', () => {
        const ctx = navCtx({ isCompareMode: true });
        nextMedia.call(ctx);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });
});

describe('removeFileFromList forgets the skip and can defer the bulk-rated save', () => {
    const removeFileFromList = extract('removeFileFromList');

    function listCtx(overrides = {}) {
        return {
            mediaFiles: media('a', 'b'),
            currentIndex: 0,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map([['a', 'good']]),
            bulkRatedPairs: new Set(),
            _bulkPairKeysReferencing: () => [],
            saveBulkRatedFile: vi.fn(),
            likeOrSkip: activeTracker('/f/a', '/f/b'),
            ...overrides,
        };
    }

    it('drops the removed path from the skipped set', () => {
        const ctx = listCtx();
        removeFileFromList.call(ctx, '/f/a');
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/b']);
    });

    it('still saves the bulk-rated file by default', () => {
        const ctx = listCtx();
        removeFileFromList.call(ctx, '/f/a');
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('defers the save under { deferBulkSave: true }, still dropping the entry', () => {
        const ctx = listCtx();
        removeFileFromList.call(ctx, '/f/a', { deferBulkSave: true });
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
        expect(ctx.bulkRated.has('a')).toBe(false);
    });
});

describe('a failed similarity sort leaves the list and the skips as they are (spec D1; G2 PR 1, T3)', () => {
    const handleSortBySimilarity = extract('handleSortBySimilarity');
    let origStorage;
    beforeEach(() => {
        origStorage = globalThis.localStorage;
        globalThis.localStorage = { getItem: () => null };
    });
    afterEach(() => {
        globalThis.localStorage = origStorage;
    });

    it('writes nothing to the list, announces no reorder and leaves the generation alone', async () => {
        const files = media('a', 'b', 'c');
        const list = [...files];
        const ctx = {
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            isSortedBySimilarity: false,
            sortAbortController: null,
            sortAlgorithm: 'vptree',
            baseFolderPath: '/f',
            mediaFiles: list,
            originalMediaFiles: [],
            currentIndex: 0,
            moveHistory: [],
            likeOrSkip: activeTracker('/f/a', '/f/b'),
            _orderGeneration: 0,
            _similarityRunGen: 0,
            _similarityGenAbort: new AbortController(),
            _bumpSimilarityRunGen: extract('_bumpSimilarityRunGen'),
            _beginSimilarityRunState: extract('_beginSimilarityRunState'),
            _endSimilarityRunState: extract('_endSimilarityRunState'),
            _onOrderChanged: vi.fn(),
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _isStaleSimilarityRun: extract('_isStaleSimilarityRun'),
            _assertSimilarityRunLive: extract('_assertSimilarityRunLive'),
            _dismissSimilarityOffer: vi.fn(),
            _logSortPerf: vi.fn(),
            saveHashCache: vi.fn(),
            showNotification: vi.fn(),
            clearProgressNotification: vi.fn(),
            showMedia: vi.fn(),
            sortSimilarityBtn: { disabled: false, querySelector: () => ({ textContent: '' }) },
            // loadSortCache is the run's first collaborator (forceResort is false, so deleteSortCache is
            // skipped): its throw drives the catch.
            loadSortCache: vi.fn(() => {
                throw new Error('boom');
            }),
        };
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await handleSortBySimilarity.call(ctx, false);
        } finally {
            errorSpy.mockRestore();
        }

        expect(ctx.loadSortCache).toHaveBeenCalledOnce();
        expect(ctx._onOrderChanged).not.toHaveBeenCalled();
        expect(ctx._orderGeneration).toBe(0);
        expect(ctx.likeOrSkip.active).toBe(true);
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/a', '/f/b']);
        expect(ctx.mediaFiles).toBe(list);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/f/a', '/f/b', '/f/c']);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('failed');
        const messages = ctx.showNotification.mock.calls.map((c) => String(c[0]));
        expect(messages.filter((m) => m.includes('Skipped list cleared'))).toEqual([]);
    });
});

describe('every method that reassigns mediaFiles announces it through _onOrderChanged (spec § 4 control)', () => {
    // Methods that put a new ORDER of mediaFiles on screen. Each must call the hook.
    const ORDER_CHANGERS = [
        'loadFolder',
        'restoreOriginalOrderForTournament',
        'applyPredictionSortResult',
        '_applySimilarityOrder',
        // Restore Order, for both handleSortBySimilarity and the AI toggle-off in handleSortByPrediction (PR #85 #21)
        '_restoreOriginalOrder',
    ];
    // Reviewed exemptions: assignments that are not a new order on screen, and why.
    const EXEMPT = {
        constructor: 'the initial empty list',
        _switchToFolderNow:
            "change-folder's reset (G4): empties the list once its file-op refusal passed, then loadFolder announces the folder",
        _undoSkipBatch: 'a batch undo re-inserts files; the others keep their order',
    };

    const lines = source.split('\n');
    const headerName = (line) => {
        const h = line.match(METHOD_HEADER);
        return h && !NOT_METHODS.has(h[2]) ? h[2] : null;
    };

    function assignmentSites() {
        const sites = new Set();
        let method = null;
        for (const line of lines) {
            method = headerName(line) ?? method;
            if (/\bthis\.mediaFiles = /.test(line)) {
                sites.add(method);
            }
        }
        return sites;
    }

    // From a method's header to the next method header — no brace counting, so string contents
    // cannot throw it off.
    function methodSlice(name) {
        const start = lines.findIndex((l) => headerName(l) === name);
        if (start === -1) {
            throw new Error(`Could not find method: ${name}`);
        }
        let end = start + 1;
        while (end < lines.length && !headerName(lines[end])) {
            end++;
        }
        return lines.slice(start, end).join('\n');
    }

    it('every method that assigns this.mediaFiles is a known order-changer or a reviewed exemption', () => {
        const unknown = [...assignmentSites()].filter((m) => !ORDER_CHANGERS.includes(m) && !(m in EXEMPT));
        expect(unknown).toEqual([]);
    });

    it('every order-changer calls _onOrderChanged', () => {
        expect(ORDER_CHANGERS.filter((m) => !methodSlice(m).includes('this._onOrderChanged('))).toEqual([]);
    });

    it('every listed method still assigns this.mediaFiles (no stale entries)', () => {
        const sites = assignmentSites();
        expect([...ORDER_CHANGERS, ...Object.keys(EXEMPT)].filter((m) => !sites.has(m))).toEqual([]);
    });
});

describe('dislikeSkippedFiles — one guarded batch (spec § 6)', () => {
    const dislikeSkippedFiles = extract('dislikeSkippedFiles');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function api({ exists = true, failNames = [] } = {}) {
        return {
            path: { basename: (p) => p.split('/').pop() },
            checkFolderExists: vi.fn(async () => exists),
            createFolder: vi.fn(async () => ({ success: true })),
            moveFile: vi.fn(async ({ targetFolder, fileName }) =>
                failNames.includes(fileName)
                    ? { success: false, error: 'ENOENT: no such file' }
                    : { success: true, targetPath: `${targetFolder}/${fileName}` }
            ),
        };
    }

    // a, b, c, d listed; d (index 3) on screen as an image; the test decides what was skipped.
    function batchCtx(skipped, overrides = {}) {
        return {
            _fileOpInFlight: false,
            isLoading: false,
            isCompareMode: false,
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            likeOrSkip: activeTracker(...skipped.map((n) => `/f/${n}`)),
            mediaFiles: media('a', 'b', 'c', 'd'),
            currentIndex: 3,
            currentMedia: { tagName: 'IMG' },
            customDislikeFolder: '/disliked',
            moveHistory: [],
            _orderGeneration: 7,
            predictionScores: new Map([['/f/a', 0.9]]),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            _bulkPairKeysReferencing: () => [],
            getCombinedFeatures: () => null,
            removeFileFromList: extract('removeFileFromList'),
            saveBulkRatedFile: vi.fn(async () => {}),
            _refuseIfNeedsRegrant: () => false,
            _refuseUngrantedFolder: vi.fn(),
            showBulkDislikeConfirm: vi.fn(async () => true),
            showFolderCreationDialog: vi.fn(async () => false),
            forceVideoCleanup: vi.fn(async () => {}),
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateNavigationInfo: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('moves every skipped file and records one history entry; the file on screen stays, unrendered', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b', 'c']);
        await dislikeSkippedFiles.call(ctx);

        expect(globalThis.window.electronAPI.moveFile.mock.calls.map(([arg]) => arg.sourcePath)).toEqual([
            '/f/a',
            '/f/b',
            '/f/c',
        ]);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['d']);
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.moveHistory).toHaveLength(1);
        const entry = ctx.moveHistory[0];
        expect(entry).toMatchObject({
            skipBatch: true,
            actionType: 'dislike',
            prevCurrentPath: '/f/d',
            orderGeneration: 7,
        });
        expect(entry.files.map((s) => [s.fileName, s.originalIndex, s.newPath])).toEqual([
            ['a', 0, '/disliked/a'],
            ['b', 1, '/disliked/b'],
            ['c', 2, '/disliked/c'],
        ]);
        expect(entry.files[0].score).toBe(0.9);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles)).toEqual([]);
        expect(ctx.showMedia).not.toHaveBeenCalled();
        expect(ctx.updateNavigationInfo).toHaveBeenCalled();
        expect(ctx.updateDislikeSkippedButton).toHaveBeenCalled();
        expect(ctx.showNotification).toHaveBeenCalledWith('👎 Moved 3 files to disliked', 'dislike');
        expect(ctx.showBulkDislikeConfirm).toHaveBeenCalledWith({
            count: 3,
            folderName: 'disliked',
            includesOnScreen: false,
        });
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('holds the guard across the dialog: a second call meanwhile shows no second dialog', async () => {
        globalThis.window = { electronAPI: api() };
        let answer;
        const ctx = batchCtx(['a'], { showBulkDislikeConfirm: vi.fn(() => new Promise((r) => (answer = r))) });
        const first = dislikeSkippedFiles.call(ctx);
        expect(ctx._fileOpInFlight).toBe(true);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showBulkDislikeConfirm).toHaveBeenCalledOnce();
        answer(false);
        await first;
        expect(ctx._fileOpInFlight).toBe(false);
        expect(globalThis.window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx.showMedia).not.toHaveBeenCalled(); // a declined dialog renders nothing
    });

    it('refuses before taking the guard', async () => {
        const cases = [
            [{ _fileOpInFlight: true }, null],
            [{ isLoading: true }, null],
            [{ isCompareMode: true }, null],
            [{ isTournamentMode: true }, null],
            [{ likeOrSkip: new LikeOrSkip.SkipTracker() }, null],
            [{ isPredictionSorting: true }, ['Wait for the sort to finish', 'info']],
            [{ isComputingHashes: true }, ['Wait for the sort to finish', 'info']],
            [{ customDislikeFolder: '' }, ['Configure like/dislike folders in Settings (F1)', 'error']],
            [{ _refuseIfNeedsRegrant: () => true }, null],
        ];
        for (const [overrides, notice] of cases) {
            globalThis.window = { electronAPI: api() };
            const ctx = batchCtx(['a'], overrides);
            await dislikeSkippedFiles.call(ctx);
            const label = JSON.stringify(Object.keys(overrides));
            expect(ctx.showBulkDislikeConfirm, label).not.toHaveBeenCalled();
            expect(ctx._fileOpInFlight, label).toBe(overrides._fileOpInFlight === true);
            if (notice) {
                expect(ctx.showNotification, label).toHaveBeenCalledWith(...notice);
            }
        }
    });

    it('says so when nothing was skipped', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx([]);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledWith('Nothing skipped yet', 'info');
        expect(ctx.showBulkDislikeConfirm).not.toHaveBeenCalled();
    });

    // Review Focus 1
    it('a failed rename does not stop the loop; the failed file stays listed and skipped', async () => {
        globalThis.window = { electronAPI: api({ failNames: ['b'] }) };
        const ctx = batchCtx(['a', 'b', 'c']);
        await dislikeSkippedFiles.call(ctx);
        expect(globalThis.window.electronAPI.moveFile).toHaveBeenCalledTimes(3);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b', 'd']);
        expect(ctx.moveHistory[0].files.map((s) => s.fileName)).toEqual(['a', 'c']);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles).map((f) => f.name)).toEqual(['b']);
        expect(ctx.showError).toHaveBeenCalledWith('Moved 2 of 3 — 1 failed: ENOENT: no such file');
        expect(ctx.mediaFiles[ctx.currentIndex].name).toBe('d');
    });

    it('the file on screen in the batch: the cursor goes to the next survivor and the view renders', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b'], { currentIndex: 1 });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showBulkDislikeConfirm).toHaveBeenCalledWith({
            count: 2,
            folderName: 'disliked',
            includesOnScreen: true,
        });
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['c', 'd']);
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
        expect(ctx.forceVideoCleanup).not.toHaveBeenCalled(); // an image is not torn down
    });

    it('a video on screen in the batch is released first; if every rename fails it is still re-rendered', async () => {
        globalThis.window = { electronAPI: api({ failNames: ['a', 'b'] }) };
        const ctx = batchCtx(['a', 'b'], { currentIndex: 1, currentMedia: { tagName: 'VIDEO' } });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.forceVideoCleanup).toHaveBeenCalledOnce();
        expect(ctx.moveHistory).toEqual([]);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
        expect(ctx.mediaFiles).toHaveLength(4);
    }, 3000);

    it('a batch reaching the end of the list wraps the cursor to the first survivor', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['c', 'd']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b']);
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('emptying the list renders (the empty state)', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b', 'c', 'd']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.mediaFiles).toEqual([]);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('bulk-rated files are dropped with ONE save and captured for undo', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b'], {
            bulkRated: new Map([
                ['a', 'good'],
                ['b', 'bad'],
            ]),
        });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
        expect(ctx.bulkRated.size).toBe(0);
        expect(ctx.moveHistory[0].files.map((s) => s.bulkBucket)).toEqual(['good', 'bad']);
    });

    // Review Focus 4
    it('declining the create prompt moves nothing and keeps the skips', async () => {
        globalThis.window = { electronAPI: api({ exists: false }) };
        const ctx = batchCtx(['a', 'b']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showFolderCreationDialog).toHaveBeenCalledWith('/disliked');
        expect(globalThis.window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx._fileOpInFlight).toBe(false);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles)).toHaveLength(2);
    });

    it('a folder main refuses (null) goes to _refuseUngrantedFolder, not the create prompt', async () => {
        globalThis.window = { electronAPI: api({ exists: null }) };
        const ctx = batchCtx(['a']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx._refuseUngrantedFolder).toHaveBeenCalledWith('dislike');
        expect(ctx.showFolderCreationDialog).not.toHaveBeenCalled();
        expect(globalThis.window.electronAPI.moveFile).not.toHaveBeenCalled();
    });

    it('a large batch says it is moving first', async () => {
        globalThis.window = { electronAPI: api() };
        const many = Array.from({ length: 51 }, (_, i) => `f${i}`);
        const ctx = batchCtx(many, { mediaFiles: media(...many, 'd'), currentIndex: 51 });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledWith('Moving 51 files…', 'info');
    });

    // G2 review R6(b): the cursor and the recorded generation describe the list originalIndex refers to,
    // not whatever the live fields read once the renames are done.
    it('uses the pre-batch index and generation even if they change during the renames', async () => {
        const electronAPI = api();
        const rename = electronAPI.moveFile.getMockImplementation();
        globalThis.window = { electronAPI };
        const ctx = batchCtx(['a', 'b']); // d (index 3) on screen
        electronAPI.moveFile.mockImplementation(async (arg) => {
            ctx.currentIndex = 0; // e.g. something reset the cursor mid-batch
            ctx._orderGeneration++; // ...and reordered the list
            return rename(arg);
        });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.moveHistory[0].orderGeneration).toBe(7);
        expect(ctx.mediaFiles[ctx.currentIndex].path).toBe('/f/d');
    });
});

describe('updateDislikeSkippedButton (spec § 9)', () => {
    const updateDislikeSkippedButton = extract('updateDislikeSkippedButton');

    function buttonCtx(overrides = {}) {
        const label = { textContent: '' };
        return {
            dislikeSkippedBtn: { style: { display: 'none' }, title: '', querySelector: () => label },
            _label: label,
            isCompareMode: false,
            isTournamentMode: false,
            mediaFiles: media('a', 'b', 'c'),
            likeOrSkip: activeTracker('/f/a', '/f/b'),
            customDislikeFolder: '/disliked',
            shortcuts: { single: { dislikeSkipped: 'KeyF' } },
            keyDisplayName: (k) => k.replace('Key', ''),
            _shortcutSuffix: extract('_shortcutSuffix'),
            _folderStateSuffix: extract('_folderStateSuffix'),
            ...overrides,
        };
    }

    it('shows the count and the live binding', () => {
        const ctx = buttonCtx();
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.style.display).toBe('');
        expect(ctx._label.textContent).toBe('Dislike 2 skipped');
        expect(ctx.dislikeSkippedBtn.title).toBe('Dislike all skipped files (F)');
    });

    it('hides at zero', () => {
        const ctx = buttonCtx({ likeOrSkip: activeTracker() });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.style.display).toBe('none');
    });

    // Review Focus 5
    it('hides in compare mode and shows the same count back in single mode', () => {
        const ctx = buttonCtx({ isCompareMode: true });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.style.display).toBe('none');
        ctx.isCompareMode = false;
        updateDislikeSkippedButton.call(ctx);
        expect(ctx._label.textContent).toBe('Dislike 2 skipped');
    });

    it('drops the suffix when the action is unbound', () => {
        const ctx = buttonCtx({ shortcuts: { single: { dislikeSkipped: null } } });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.title).toBe('Dislike all skipped files');
    });
});

describe('_undoSkipBatch — the whole batch back (spec § 7)', () => {
    const undoSkipBatch = extract('_undoSkipBatch');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function api({ failNames = [], renamed = {} } = {}) {
        return {
            path: { basename: (p) => p.split('/').pop() },
            moveFile: vi.fn(async ({ targetFolder, fileName }) =>
                failNames.includes(fileName)
                    ? { success: false, error: 'EBUSY: resource busy' }
                    : { success: true, targetPath: renamed[fileName] ?? `${targetFolder}/${fileName}` }
            ),
        };
    }

    // As dislikeSkippedFiles records it: `names` sat at indices 0..n-1, before d (on screen).
    function batchEntry(names, { prev = '/f/d', generation = 7, newPaths = {}, buckets = {} } = {}) {
        return {
            skipBatch: true,
            actionType: 'dislike',
            prevCurrentPath: prev,
            orderGeneration: generation,
            files: names.map((n, i) => ({
                file: { name: n, path: `/f/${n}`, size: 10, type: 'image/jpeg', mtimeMs: 5 },
                originalIndex: i,
                fileName: n,
                originalPath: `/f/${n}`,
                fileSize: 10,
                newPath: newPaths[n] ?? `/disliked/${n}`,
                mlFeatures: null,
                score: 0.5 + i / 10,
                bulkBucket: buckets[n],
            })),
        };
    }

    function undoCtx(overrides = {}) {
        const d = media('d')[0];
        return {
            baseFolderPath: '/f',
            mediaFiles: [d],
            currentIndex: 0,
            currentMedia: { tagName: 'IMG' },
            isCompareMode: false,
            likeOrSkip: activeTracker(),
            moveHistory: [],
            _orderGeneration: 7,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            restoreFeatureCachesFromHistory: extract('restoreFeatureCachesFromHistory'),
            featureCacheStore: { markChanged: vi.fn() }, // the restore counts as the visit's change
            _followRestoredFile: extract('_followRestoredFile'),
            saveBulkRatedFile: vi.fn(async () => {}),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateNavigationInfo: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('puts every file back on disk and in its original position; the cursor stays on the file it was on', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b', 'c']));
        expect(globalThis.window.electronAPI.moveFile.mock.calls[0][0]).toEqual({
            sourcePath: '/disliked/a',
            targetFolder: '/f',
            fileName: 'a',
        });
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd']);
        expect(ctx.mediaFiles[0].mtimeMs).toBe(5); // the captured file object, not a rebuilt stub
        expect(ctx.currentIndex).toBe(3);
        expect(ctx.predictionScores.get('/f/b')).toBe(0.6);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles).map((f) => f.name)).toEqual(['a', 'b', 'c']);
        expect(ctx.moveHistory).toEqual([]);
        expect(ctx.showNotification).toHaveBeenCalledWith('✅ Restored 3 files', 'success');
        expect(ctx.showMedia).not.toHaveBeenCalled(); // d is still the file on screen
        expect(ctx.updateNavigationInfo).toHaveBeenCalled();
    });

    it('parks the files at the front after a reorder since the batch', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ mediaFiles: media('x', 'd'), currentIndex: 1 });
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b'], { generation: 6 }));
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b', 'x', 'd']);
        expect(ctx.currentIndex).toBe(3);
    });

    // Review Focus 2
    it('follows a restore that landed under a new name, from a suffixed dislike-folder path', async () => {
        globalThis.window = { electronAPI: api({ renamed: { b: '/f/b (1)' } }) };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b'], { prev: '/f/b', newPaths: { b: '/disliked/b (1)' } }));
        expect(globalThis.window.electronAPI.moveFile.mock.calls[1][0]).toEqual({
            sourcePath: '/disliked/b (1)',
            targetFolder: '/f',
            fileName: 'b',
        });
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/f/a', '/f/b (1)', '/f/d']);
        expect(ctx.mediaFiles[1].name).toBe('b (1)');
        expect(ctx.currentIndex).toBe(1); // the file that was on screen, under its new name
        expect(ctx.showMedia).toHaveBeenCalledOnce(); // b, not d, is the file to show
    });

    it('a partial failure pushes the failed files back as a smaller batch, and re-inserts the rest in order', async () => {
        globalThis.window = { electronAPI: api({ failNames: ['b'] }) };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b', 'c']));
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'c', 'd']);
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.moveHistory[0]).toMatchObject({ skipBatch: true, prevCurrentPath: '/f/d', orderGeneration: 7 });
        expect(ctx.moveHistory[0].files.map((s) => s.fileName)).toEqual(['b']);
        expect(ctx.showError).toHaveBeenCalledWith('Restored 2 of 3 — 1 failed: EBUSY: resource busy');
    });

    // G2 review R6(d): computeStaleCount counts by identity, so a copy would count the batch twice.
    it('a total failure pushes back the SAME entry object', async () => {
        globalThis.window = { electronAPI: api({ failNames: ['a', 'b'] }) };
        const ctx = undoCtx();
        const entry = batchEntry(['a', 'b']);
        await undoSkipBatch.call(ctx, entry);
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.moveHistory[0]).toBe(entry);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['d']);
    });

    it('restores bulk-rated membership with one save', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b', 'c'], { buckets: { a: 'good', c: 'bad' } }));
        expect([...ctx.bulkRated]).toEqual([
            ['a', 'good'],
            ['c', 'bad'],
        ]);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('renders when the empty state was showing', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ mediaFiles: [], currentMedia: null });
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b'], { prev: '/f/b' }));
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b']);
        expect(ctx.currentIndex).toBe(1);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('compare mode always re-renders', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ isCompareMode: true });
        await undoSkipBatch.call(ctx, batchEntry(['a']));
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('restored files are skips again only while tracking is on', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ likeOrSkip: new LikeOrSkip.SkipTracker() });
        await undoSkipBatch.call(ctx, batchEntry(['a']));
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });
});

describe('handleCancel routes a skipBatch entry to _undoSkipBatch, and only that entry', () => {
    const handleCancel = extract('handleCancel');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function cancelCtx(history, overrides = {}) {
        return {
            _fileOpInFlight: false,
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: false,
            moveHistory: history,
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            _undoSkipBatch: vi.fn(async () => {}),
            ...overrides,
        };
    }

    it('pops the batch entry and hands it over inside the guard', async () => {
        const entry = { skipBatch: true, files: [] };
        const ctx = cancelCtx([entry]);
        let heldDuring;
        ctx._undoSkipBatch = vi.fn(async () => {
            heldDuring = ctx._fileOpInFlight;
        });
        await handleCancel.call(ctx);
        expect(ctx._undoSkipBatch).toHaveBeenCalledWith(entry);
        expect(ctx.moveHistory).toEqual([]);
        expect(heldDuring).toBe(true);
        expect(ctx._fileOpInFlight).toBe(false);
    });

    // Review Focus 3
    it('a Like made after the batch is undone first, by the single-file branch', async () => {
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                moveFile: vi.fn(async () => ({ success: true, targetPath: '/f/z.jpg' })),
            },
        };
        const batch = { skipBatch: true, files: [] };
        const like = {
            fileName: 'z.jpg',
            originalPath: '/f/z.jpg',
            newPath: '/liked/z.jpg',
            fileSize: 1,
            fileType: 'image/jpeg',
            actionType: 'like',
            mlFeatures: null,
        };
        const ctx = cancelCtx([batch, like], {
            baseFolderPath: '/f',
            mediaFiles: [],
            currentIndex: 0,
            _followRestoredFile: extract('_followRestoredFile'),
            restoreFeatureCachesFromHistory: vi.fn(),
            updateFolderInfo: vi.fn(),
            showMedia: vi.fn(async () => {}),
        });
        await handleCancel.call(ctx);
        expect(ctx._undoSkipBatch).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([batch]);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['z.jpg']);
        await handleCancel.call(ctx);
        expect(ctx._undoSkipBatch).toHaveBeenCalledWith(batch);
    });
});

describe('the out-of-date mark (spec § 8)', () => {
    const onOrderChanged = extract('_onOrderChanged');

    function markCtx(overrides = {}) {
        return {
            _orderGeneration: 0,
            likeOrSkip: new LikeOrSkip.SkipTracker(),
            mediaFiles: media('a'),
            moveHistory: [{ actionType: 'like' }],
            _staleMark: null,
            _pendingStaleMark: null,
            showNotification: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('an AI order commits the snapshot taken before training', () => {
        const pending = [];
        const ctx = markCtx({ _pendingStaleMark: pending });
        onOrderChanged.call(ctx, 'ai-fresh');
        expect(ctx._staleMark).toBe(pending);
        expect(ctx._pendingStaleMark).toBeNull();
    });

    it('an AI order applied outside a sort run snapshots the history now (same entry references)', () => {
        const ctx = markCtx();
        onOrderChanged.call(ctx, 'ai-fresh');
        expect(ctx._staleMark).not.toBe(ctx.moveHistory);
        expect(ctx._staleMark[0]).toBe(ctx.moveHistory[0]);
    });

    it('leaving the AI order drops the mark and refreshes the chip', () => {
        const ctx = markCtx({ _staleMark: [] });
        onOrderChanged.call(ctx, 'other');
        expect(ctx._staleMark).toBeNull();
        expect(ctx._updateResortChip).toHaveBeenCalled();
    });
});

describe('_updateResortChip (spec § 8)', () => {
    const updateResortChip = extract('_updateResortChip');

    function chipCtx(overrides = {}) {
        const label = { textContent: '' };
        const before = { actionType: 'like' };
        return {
            resortPredictionBtn: { style: { display: 'none' }, title: '', querySelector: () => label },
            _label: label,
            moveHistory: [before, { actionType: 'like' }, { actionType: 'dislike' }],
            _staleMark: [before],
            likeOrSkip: activeTracker(),
            isMlEnabled: true,
            isPredictionSorting: false,
            isTournamentMode: false,
            mediaFiles: media('a'),
            ...overrides,
        };
    }

    it('shows the count of training changes since the AI order was computed', () => {
        const ctx = chipCtx();
        updateResortChip.call(ctx);
        expect(ctx.resortPredictionBtn.style.display).toBe('inline-flex');
        expect(ctx._label.textContent).toBe('Re-sort · 2 new');
        expect(ctx.resortPredictionBtn.title).toBe(
            '2 ratings since the last AI sort — re-sort to include them (retrains the model)'
        );
    });

    it('stays hidden when the order is fresh, off the AI order, mid-sort, in tournament, with ML off or no files', () => {
        const hidden = [
            { moveHistory: [], _staleMark: [] },
            { likeOrSkip: new LikeOrSkip.SkipTracker() },
            { isPredictionSorting: true },
            { isTournamentMode: true },
            { isMlEnabled: false },
            { mediaFiles: [] },
        ];
        for (const overrides of hidden) {
            const ctx = chipCtx(overrides);
            // Start visible (a chip shown before the state changed), so a case passes only if the
            // method actively hides it — a no-op _updateResortChip fails every case.
            ctx.resortPredictionBtn.style.display = 'inline-flex';
            updateResortChip.call(ctx);
            expect(ctx.resortPredictionBtn.style.display, JSON.stringify(Object.keys(overrides))).toBe('none');
        }
    });
});

// G2 review R6(a): while a file action holds _fileOpInFlight, the header actions refuse. A reorder, mode
// switch or folder change landing between the action's snapshot and its render would leave the screen and
// the cursor on different files. The contexts stub each method's unguarded path in full, so a missing
// guard fails an assertion, not on a missing stub.
describe('header actions refuse while a file action is in flight (G2 review R6)', () => {
    const WAIT = ['Wait for the move to finish', 'info'];
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    // The state none of the refused calls may touch.
    function untouched(ctx) {
        return {
            mediaFiles: ctx.mediaFiles.map((f) => f.path),
            currentIndex: ctx.currentIndex,
            isSortedBySimilarity: ctx.isSortedBySimilarity,
            isSortedByPrediction: ctx.isSortedByPrediction,
            isCompareMode: ctx.isCompareMode,
            isTournamentMode: ctx.isTournamentMode,
            moveHistory: [...ctx.moveHistory],
        };
    }

    function baseCtx(overrides = {}) {
        return {
            _fileOpInFlight: true,
            mediaFiles: media('a', 'b', 'c', 'd'),
            originalMediaFiles: [],
            currentIndex: 2,
            isSortedBySimilarity: false,
            isSortedByPrediction: false,
            isCompareMode: false,
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            sortAbortController: null,
            moveHistory: [{ actionType: 'like' }],
            showNotification: vi.fn(),
            showMedia: vi.fn(async () => {}),
            _onOrderChanged: vi.fn(),
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            ...overrides,
        };
    }

    describe('switchMode', () => {
        const switchMode = extract('switchMode');

        it.each(['single', 'compare', 'tournament'])('refuses a switch to %s', async (mode) => {
            const ctx = baseCtx({ _applyModeSwitch: vi.fn(async () => {}), showTournamentLeavePrompt: vi.fn() });
            const before = untouched(ctx);
            await switchMode.call(ctx, mode);
            expect(ctx.showNotification.mock.calls).toEqual([WAIT]);
            expect(ctx._applyModeSwitch).not.toHaveBeenCalled();
            expect(untouched(ctx)).toEqual(before);
        });

        it('refuses to leave an incomplete tournament too (no leave prompt)', async () => {
            const ctx = baseCtx({
                isTournamentMode: true,
                tournament: { engine: { isComplete: () => false } },
                _applyModeSwitch: vi.fn(async () => {}),
                showTournamentLeavePrompt: vi.fn(),
            });
            const before = untouched(ctx);
            await switchMode.call(ctx, 'single');
            expect(ctx.showNotification.mock.calls).toEqual([WAIT]);
            expect(ctx.showTournamentLeavePrompt).not.toHaveBeenCalled();
            expect(untouched(ctx)).toEqual(before);
        });
    });

    describe('handleSortBySimilarity', () => {
        const handleSortBySimilarity = extract('handleSortBySimilarity');

        function similarityCtx(overrides = {}) {
            const label = { textContent: 'Sort by Similarity' };
            return baseCtx({
                sortAlgorithm: 'vptree',
                baseFolderPath: '/f',
                sortSimilarityBtn: { disabled: false, querySelector: () => label },
                loadSortCache: vi.fn(async () => ({ sortedPaths: ['/f/d', '/f/c', '/f/b', '/f/a'], timestamp: null })),
                loadHashCache: vi.fn(async () => 0),
                applyCachedSortOrder: vi.fn(async function () {
                    return { order: [...this.mediaFiles].reverse(), stats: { cached: 4, added: 0, removed: 0 } };
                }),
                saveHashCache: vi.fn(async () => {}),
                saveSortCache: vi.fn(async () => {}),
                deleteSortCache: vi.fn(async () => {}),
                updateSortProgress: vi.fn(),
                clearProgressNotification: vi.fn(),
                formatTimeAgo: () => 'just now',
                ...overrides,
            });
        }

        it.each([false, true])('refuses to start a sort (force re-sort: %s)', async (force) => {
            const ctx = similarityCtx();
            const before = untouched(ctx);
            await handleSortBySimilarity.call(ctx, force);
            expect(ctx.showNotification.mock.calls).toEqual([WAIT]);
            expect(ctx.loadSortCache).not.toHaveBeenCalled();
            expect(ctx.deleteSortCache).not.toHaveBeenCalled();
            expect(ctx.isComputingHashes).toBe(false);
            expect(ctx.originalMediaFiles).toEqual([]);
            expect(untouched(ctx)).toEqual(before);
        });

        it('refuses to restore the original order', async () => {
            const ctx = similarityCtx({ isSortedBySimilarity: true, originalMediaFiles: media('d', 'c', 'b', 'a') });
            const before = untouched(ctx);
            await handleSortBySimilarity.call(ctx);
            expect(ctx.showNotification.mock.calls).toEqual([WAIT]);
            expect(ctx._onOrderChanged).not.toHaveBeenCalled();
            expect(ctx.showMedia).not.toHaveBeenCalled();
            expect(untouched(ctx)).toEqual(before);
        });

        // The press only aborts (G2 PR 1, A3): the run's end shows "❌ Sorting cancelled" once it unwinds.
        it('Cancel stays live: a running similarity sort still aborts', async () => {
            const controller = new AbortController();
            const ctx = similarityCtx({ isComputingHashes: true, sortAbortController: controller });
            await handleSortBySimilarity.call(ctx);
            expect(controller.signal.aborted).toBe(true);
            expect(ctx.showNotification).not.toHaveBeenCalled();
        });
    });

    describe('loadFolder', () => {
        const loadFolder = extract('loadFolder');

        it('refuses a folder change', async () => {
            globalThis.window = {
                electronAPI: { loadFolder: vi.fn(async () => ({ success: false, error: 'stub' })) },
            };
            const ctx = baseCtx({
                showLoadingSpinner: vi.fn(),
                hideLoadingSpinner: vi.fn(),
                showDropZone: vi.fn(),
                showError: vi.fn(),
            });
            const before = untouched(ctx);
            await loadFolder.call(ctx, '/other');
            expect(ctx.showNotification.mock.calls).toEqual([WAIT]);
            expect(globalThis.window.electronAPI.loadFolder).not.toHaveBeenCalled();
            expect(ctx.showLoadingSpinner).not.toHaveBeenCalled();
            expect(ctx.showDropZone).not.toHaveBeenCalled();
            expect(untouched(ctx)).toEqual(before);
        });
    });
});

// ---------------------------------------------------------------------------------------------------
// G2 final review (R7): each block below names the finding it pins.
// ---------------------------------------------------------------------------------------------------

/** The body of an inline arrow handler, found by the source text that opens it, as a callable. */
function extractHandler(marker) {
    const at = source.indexOf(marker);
    if (at === -1 || source.indexOf(marker, at + 1) !== -1) {
        throw new Error(`Handler marker not found exactly once: ${marker}`);
    }
    const open = at + marker.length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            return new AsyncFunction(source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in handler: ${marker}`);
}

const WAIT_MOVE = ['Wait for the move to finish', 'info'];
const WAIT_SORT = ['Wait for the sort to finish', 'info'];

describe('_refuseIfFileOpInFlight (G2 final review F1)', () => {
    const refuse = extract('_refuseIfFileOpInFlight');

    it('refuses with the notice while a file action holds the guard, and takes no guard itself', () => {
        const ctx = { _fileOpInFlight: true, showNotification: vi.fn() };
        expect(refuse.call(ctx)).toBe(true);
        expect(ctx.showNotification.mock.calls).toEqual([WAIT_MOVE]);
        expect(ctx._fileOpInFlight).toBe(true);
    });

    it('lets the call through, silently, when nothing is in flight', () => {
        const ctx = { _fileOpInFlight: false, showNotification: vi.fn() };
        expect(refuse.call(ctx)).toBe(false);
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });
});

describe('the change-folder button refuses before it wipes anything (G2 final review F1)', () => {
    const changeFolder = extractHandler("this.changeFolderBtn.addEventListener('click', async () => {");
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function folderCtx(overrides = {}) {
        globalThis.window = { electronAPI: { openFolderDialog: vi.fn(async () => '/other') } };
        const ctx = {
            _folderIntentGen: 0,
            _fileOpInFlight: true,
            mediaFiles: media('a', 'b'),
            currentIndex: 1,
            currentMedia: { tagName: 'IMG' },
            currentFolderPath: 'f',
            baseFolderPath: '/f',
            moveHistory: [{ skipBatch: true, files: [] }],
            isLoading: true,
            isSortedBySimilarity: false,
            originalMediaFiles: [],
            perceptualHashes: new Map([['/f/a', '01']]),
            sortSimilarityBtn: null,
            cleanupCurrentMedia: vi.fn(async () => {}),
            hideDropZone: vi.fn(),
            loadFolder: vi.fn(async () => {}),
            showNotification: vi.fn(),
            _invalidateSimilarityRun: vi.fn(),
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _folderLoadInFlight: false,
            _refuseIfFolderLoadInFlight() {
                return extract('_refuseIfFolderLoadInFlight').call(this);
            },
            switchToFolder: extract('switchToFolder'),
            _switchToFolderNow: extract('_switchToFolderNow'),
            cancelBackgroundExtraction: vi.fn(),
            ...overrides,
        };
        ctx.featureCacheStore = stubFeatureCacheStore(ctx);
        return ctx;
    }

    it('a pick during a batch leaves the list, the history and the folder as they were', async () => {
        const ctx = folderCtx();
        const history = ctx.moveHistory;
        await changeFolder.call(ctx);
        expect(ctx.showNotification.mock.calls).toEqual([WAIT_MOVE]);
        expect(ctx.cleanupCurrentMedia).not.toHaveBeenCalled();
        expect(ctx.hideDropZone).not.toHaveBeenCalled();
        expect(ctx.loadFolder).not.toHaveBeenCalled();
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b']);
        expect(ctx.currentIndex).toBe(1);
        expect(ctx.baseFolderPath).toBe('/f');
        expect(ctx.moveHistory).toBe(history);
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.perceptualHashes.size).toBe(1);
        expect(ctx.isLoading).toBe(true);
    });

    it('with nothing in flight, it resets and loads the picked folder as before', async () => {
        const ctx = folderCtx({ _fileOpInFlight: false });
        let genAtDialog;
        globalThis.window.electronAPI.openFolderDialog = vi.fn(async () => {
            genAtDialog = ctx._folderIntentGen;
            return '/other';
        });
        await changeFolder.call(ctx);
        expect(ctx.mediaFiles).toEqual([]);
        expect(ctx.moveHistory).toEqual([]);
        expect(ctx.loadFolder).toHaveBeenCalledWith('/other');
        expect(ctx.showNotification).not.toHaveBeenCalled();
        // G4 final review F1: choosing a folder starts before the dialog answers, so a recent-folder check still
        // in flight abandons its decision.
        expect(genAtDialog).toBe(1);
    });

    it('a cancelled dialog refuses nothing and changes nothing', async () => {
        const ctx = folderCtx();
        globalThis.window.electronAPI.openFolderDialog = vi.fn(async () => null);
        await changeFolder.call(ctx);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(ctx.mediaFiles).toHaveLength(2);
    });

    // PR #81 review #1: the pick would only be refused by switchToFolder; refuse before the dialog instead.
    it('while a folder is loading it refuses before the dialog, and bumps nothing', async () => {
        const ctx = folderCtx({ _fileOpInFlight: false, _folderLoadInFlight: true });
        await changeFolder.call(ctx);
        expect(ctx.showNotification.mock.calls).toEqual([['Wait for the folder to finish loading', 'info']]);
        expect(globalThis.window.electronAPI.openFolderDialog).not.toHaveBeenCalled();
        expect(ctx._folderIntentGen).toBe(0);
        expect(ctx.mediaFiles).toHaveLength(2);
    });
});

describe('the tournament summary Apply and Discard refuse before acting (G2 final review F1)', () => {
    const showTournamentSummaryModal = extract('showTournamentSummaryModal');
    let origDocument;
    let els;
    beforeEach(() => {
        origDocument = globalThis.document;
        els = {
            tournamentSummaryModal: { style: { display: 'none' } },
            tournamentSummaryBody: { replaceChildren: vi.fn() },
            tournamentSummaryApply: { onclick: null },
            tournamentSummaryDiscard: { onclick: null },
            tournamentSummaryUndo: null,
        };
        globalThis.document = {
            getElementById: (id) => els[id] ?? null,
            createElement: () => ({ style: {}, append: () => {} }),
        };
    });
    afterEach(() => {
        globalThis.document = origDocument;
    });

    function summaryCtx(overrides = {}) {
        return {
            _fileOpInFlight: true,
            baseFolderPath: '/f',
            tournament: {
                engine: {
                    getTierBreakdown: () => ({ 0: 1, 1: 1 }),
                    strategy: { options: { rounds: 1 } },
                    peekUndoKind: () => null,
                },
                handleApply: vi.fn(async () => ({ success: true, moved: 2 })),
                handleDiscard: vi.fn(async () => {}),
            },
            showNotification: vi.fn(),
            exitTournamentMode: vi.fn(),
            loadFolder: vi.fn(async () => {}),
            switchMode: vi.fn(async () => {}),
            handleTournamentUndo: vi.fn(async () => {}),
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            ...overrides,
        };
    }

    it.each([
        ['Apply', 'tournamentSummaryApply', 'handleApply'],
        ['Discard', 'tournamentSummaryDiscard', 'handleDiscard'],
    ])('%s mid-move: nothing runs and the modal stays', async (_label, button, action) => {
        const ctx = summaryCtx();
        showTournamentSummaryModal.call(ctx);
        expect(els.tournamentSummaryModal.style.display).toBe('flex');
        await els[button].onclick();
        expect(ctx.showNotification.mock.calls).toEqual([WAIT_MOVE]);
        expect(ctx.tournament[action]).not.toHaveBeenCalled();
        expect(ctx.exitTournamentMode).not.toHaveBeenCalled();
        expect(ctx.switchMode).not.toHaveBeenCalled();
        expect(els.tournamentSummaryModal.style.display).toBe('flex');
        expect(typeof els.tournamentSummaryApply.onclick).toBe('function');
        expect(typeof els.tournamentSummaryDiscard.onclick).toBe('function');
    });

    it('with nothing in flight, Apply still applies', async () => {
        const ctx = summaryCtx({ _fileOpInFlight: false });
        showTournamentSummaryModal.call(ctx);
        await els.tournamentSummaryApply.onclick();
        expect(ctx.tournament.handleApply).toHaveBeenCalledOnce();
        expect(els.tournamentSummaryModal.style.display).toBe('none');
    });
});

describe('handleCancel: a skipBatch undo waits for a running sort (G2 final review F2)', () => {
    const handleCancel = extract('handleCancel');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function cancelCtx(history, overrides = {}) {
        return {
            _fileOpInFlight: false,
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            moveHistory: history,
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            _undoSkipBatch: vi.fn(async () => {}),
            ...overrides,
        };
    }

    it.each(['isPredictionSorting', 'isComputingHashes'])('refused while %s, the entry kept', async (flag) => {
        const entry = { skipBatch: true, files: [] };
        const ctx = cancelCtx([entry], { [flag]: true });
        await handleCancel.call(ctx);
        expect(ctx.showNotification.mock.calls).toEqual([WAIT_SORT]);
        expect(ctx._undoSkipBatch).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([entry]);
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('another entry kind still undoes while a sort runs', async () => {
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                moveFile: vi.fn(async () => ({ success: true, targetPath: '/f/z.jpg' })),
            },
        };
        const like = {
            fileName: 'z.jpg',
            originalPath: '/f/z.jpg',
            newPath: '/liked/z.jpg',
            fileSize: 1,
            fileType: 'image/jpeg',
            actionType: 'like',
            mlFeatures: null,
        };
        const ctx = cancelCtx([like], {
            isPredictionSorting: true,
            baseFolderPath: '/f',
            mediaFiles: [],
            currentIndex: 0,
            _followRestoredFile: extract('_followRestoredFile'),
            restoreFeatureCachesFromHistory: vi.fn(),
            updateFolderInfo: vi.fn(),
            showMedia: vi.fn(async () => {}),
        });
        await handleCancel.call(ctx);
        expect(ctx.moveHistory).toEqual([]);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['z.jpg']);
    });
});

describe('handleCancel: the compare-pair branch never pops a skipBatch (G2 final review F9)', () => {
    const handleCancel = extract('handleCancel');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('an orphan compare entry above a batch is undone alone, by the single-file branch', async () => {
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                moveFile: vi.fn(async ({ targetFolder, fileName }) => ({
                    success: true,
                    targetPath: `${targetFolder}/${fileName}`,
                })),
            },
        };
        const batch = { skipBatch: true, actionType: 'dislike', files: [] };
        // A moveComparePair whose secondary rename failed: one compareMode entry, no partner.
        const orphan = {
            compareMode: true,
            actionType: 'like',
            fileName: 'z.jpg',
            originalPath: '/f/z.jpg',
            newPath: '/liked/z.jpg',
            fileSize: 1,
            fileType: 'image/jpeg',
            mlFeatures: null,
        };
        const ctx = {
            _fileOpInFlight: false,
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: true,
            isPredictionSorting: false,
            isComputingHashes: false,
            baseFolderPath: '/f',
            mediaFiles: media('x', 'y'),
            currentIndex: 0,
            moveHistory: [batch, orphan],
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            showError: vi.fn(),
            _undoSkipBatch: vi.fn(async () => {}),
            _followRestoredFile: extract('_followRestoredFile'),
            restoreFeatureCachesFromHistory: vi.fn(),
            requestPredictionScores: vi.fn(),
            updateFolderInfo: vi.fn(),
            showMedia: vi.fn(async () => {}),
        };
        await handleCancel.call(ctx);
        expect(globalThis.window.electronAPI.moveFile.mock.calls.map(([a]) => a.sourcePath)).toEqual(['/liked/z.jpg']);
        expect(ctx.moveHistory).toEqual([batch]);
        expect(ctx.moveHistory[0]).toBe(batch);
        expect(ctx._undoSkipBatch).not.toHaveBeenCalled();
        expect(ctx.mediaFiles.map((f) => f.name)).toContain('z.jpg');
    });
});

describe('nextMedia with an out-of-range cursor (G2 final review F3)', () => {
    const nextMedia = extract('nextMedia');

    it('wraps as before instead of throwing, and records no skip', () => {
        const ctx = {
            mediaFiles: media('a', 'b', 'c'),
            currentIndex: 5, // a stale cursor (the similarity sort's catch-block restore — deferred root)
            isLoading: false,
            mediaNavigationInProgress: false,
            _fileOpInFlight: false,
            isCompareMode: false,
            isSortedByPrediction: true,
            likeOrSkip: activeTracker(),
            signalUserActivity: vi.fn(),
            showMedia: vi.fn(),
            showDropZone: vi.fn(),
        };
        expect(() => nextMedia.call(ctx)).not.toThrow();
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });
});

describe('switchMode: Tournament mode waits for a running sort (G2 final review F7)', () => {
    const switchMode = extract('switchMode');

    function modeCtx(overrides = {}) {
        return {
            _fileOpInFlight: false,
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            tournament: { engine: null },
            showNotification: vi.fn(),
            showTournamentLeavePrompt: vi.fn(),
            _applyModeSwitch: vi.fn(async () => {}),
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            ...overrides,
        };
    }

    it.each(['isPredictionSorting', 'isComputingHashes'])('refused while %s', async (flag) => {
        const ctx = modeCtx({ [flag]: true });
        await switchMode.call(ctx, 'tournament');
        expect(ctx.showNotification.mock.calls).toEqual([WAIT_SORT]);
        expect(ctx._applyModeSwitch).not.toHaveBeenCalled();
    });

    it.each(['single', 'compare'])('a switch to %s is not refused by a running sort', async (mode) => {
        const ctx = modeCtx({ isPredictionSorting: true });
        await switchMode.call(ctx, mode);
        expect(ctx._applyModeSwitch).toHaveBeenCalledWith(mode);
    });

    it('enters Tournament mode when no sort runs', async () => {
        const ctx = modeCtx();
        await switchMode.call(ctx, 'tournament');
        expect(ctx._applyModeSwitch).toHaveBeenCalledWith('tournament');
    });
});

describe('the load-error Remove action resolves its file by path (G2 final review F8)', () => {
    const removeByPath = () => extract('_removeFailedFileByPath');

    function removeCtx(overrides = {}) {
        return {
            _fileOpInFlight: false,
            mediaFiles: media('a', 'b', 'c'),
            showNotification: vi.fn(),
            removeFailedFile: vi.fn(),
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            ...overrides,
        };
    }

    it('no Remove callback captures an index at error time', () => {
        expect(source).not.toMatch(/removeFailedFile\(failedIndex/);
        expect(source.match(/actionCallback: \(\) => this\._removeFailedFileByPath\(file\.path/g)).toHaveLength(4);
    });

    it('removes the failing file at its index NOW, after the list shifted', () => {
        const ctx = removeCtx({ mediaFiles: media('c', 'b') }); // a batch removed a; b now sits at index 1
        removeByPath().call(ctx, '/f/b', 'left');
        expect(ctx.removeFailedFile).toHaveBeenCalledWith(1, 'left');
    });

    it('does nothing when the file is no longer listed', () => {
        const ctx = removeCtx({ mediaFiles: media('c') });
        removeByPath().call(ctx, '/f/b');
        expect(ctx.removeFailedFile).not.toHaveBeenCalled();
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    it('is refused while a file action is in flight', () => {
        const ctx = removeCtx({ _fileOpInFlight: true });
        removeByPath().call(ctx, '/f/b');
        expect(ctx.removeFailedFile).not.toHaveBeenCalled();
        expect(ctx.showNotification.mock.calls).toEqual([WAIT_MOVE]);
    });
});

describe('the AI-sort button, the chip and Dislike-skipped hide over an empty list (G2 final review F10)', () => {
    it('updateSortPredictionButton hides the button and refreshes the chip on an empty list', () => {
        const updateSortPredictionButton = extract('updateSortPredictionButton');
        const label = { textContent: '' };
        const ctx = {
            sortPredictionBtn: {
                style: { display: 'inline-flex' },
                disabled: false,
                title: '',
                querySelector: () => label,
            },
            isTournamentMode: false,
            isMlEnabled: true,
            isSortedByPrediction: false,
            mlWorker: {},
            mlStats: { isReady: true },
            mediaFiles: [],
            _updateResortChip: vi.fn(),
        };
        updateSortPredictionButton.call(ctx);
        expect(ctx.sortPredictionBtn.style.display).toBe('none');
        expect(ctx._updateResortChip).toHaveBeenCalled();
        ctx.mediaFiles = media('a');
        updateSortPredictionButton.call(ctx);
        expect(ctx.sortPredictionBtn.style.display).toBe('inline-flex');
    });

    // The other side of the rule above: an undo out of the empty state re-inserts files and renders through
    // showMedia(), which must bring back the button showEmptyStateWithUndo hid.
    it('showMedia leaving the empty state refreshes the sort button', async () => {
        const showMedia = extract('showMedia');
        const emptyState = { remove: vi.fn() };
        const ctx = {
            mediaFiles: media('a'),
            moveHistory: [],
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: false,
            mediaContainer: { querySelector: () => emptyState },
            updateCompareUndoButton: vi.fn(),
            updateBulkRateButtonsVisibility: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            updateSortPredictionButton: vi.fn(),
            showSingleMedia: vi.fn(async () => {}),
        };
        await showMedia.call(ctx);
        expect(emptyState.remove).toHaveBeenCalled();
        expect(ctx.updateSortPredictionButton).toHaveBeenCalled();
        expect(ctx.showSingleMedia).toHaveBeenCalled();
    });

    it('showEmptyStateWithUndo refreshes the sort button (and through it the chip) and Dislike-skipped', () => {
        const showEmptyStateWithUndo = extract('showEmptyStateWithUndo');
        const origDocument = globalThis.document;
        globalThis.document = {
            createElement: () => ({
                className: '',
                textContent: '',
                appendChild: () => {},
                addEventListener: () => {},
            }),
        };
        try {
            const ctx = {
                currentMedia: null,
                isCompareMode: false,
                mediaFiles: [],
                dropZone: { style: {} },
                mediaContainer: { querySelector: () => null, appendChild: () => {} },
                controls: { style: {} },
                compareControls: { style: {} },
                hideLoadingSpinner: vi.fn(),
                updateFolderInfo: vi.fn(),
                updateNavigationInfo: vi.fn(),
                updateSortPredictionButton: vi.fn(),
                updateDislikeSkippedButton: vi.fn(),
            };
            showEmptyStateWithUndo.call(ctx);
            expect(ctx.updateSortPredictionButton).toHaveBeenCalled();
            expect(ctx.updateDislikeSkippedButton).toHaveBeenCalled();
        } finally {
            globalThis.document = origDocument;
        }
    });
});

describe('#dislikeSkippedBtn carries the G1 folder state its neighbour has (G2 final review F12)', () => {
    const updateDislikeSkippedButton = extract('updateDislikeSkippedButton');

    function buttonCtx(overrides = {}) {
        const label = { textContent: '' };
        return {
            dislikeSkippedBtn: { style: { display: 'none' }, disabled: false, title: '', querySelector: () => label },
            isCompareMode: false,
            isTournamentMode: false,
            mediaFiles: media('a', 'b'),
            likeOrSkip: activeTracker('/f/a'),
            customDislikeFolder: '/disliked',
            folderNeedsRegrant: new Set(),
            folderUnreachable: new Set(),
            shortcuts: { single: { dislikeSkipped: 'KeyF' } },
            keyDisplayName: (k) => k.replace('Key', ''),
            _shortcutSuffix: extract('_shortcutSuffix'),
            _folderStateSuffix: extract('_folderStateSuffix'),
            ...overrides,
        };
    }

    it('is disabled without a dislike folder, enabled with one', () => {
        const ctx = buttonCtx({ customDislikeFolder: '' });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.disabled).toBe(true);
        ctx.customDislikeFolder = '/disliked';
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.disabled).toBe(false);
    });

    it('says when the dislike folder needs re-confirming, after the shortcut, as #dislikeBtn does', () => {
        const ctx = buttonCtx({ folderNeedsRegrant: new Set(['dislike']) });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.title).toBe('Dislike all skipped files (F) — folder needs re-confirming (F1)');
        expect(ctx.dislikeSkippedBtn.disabled).toBe(false); // a click explains the refusal
    });

    it('says when the dislike folder is not reachable, and ignores the like folder', () => {
        const ctx = buttonCtx({ folderUnreachable: new Set(['dislike']), folderNeedsRegrant: new Set(['like']) });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.title).toBe('Dislike all skipped files (F) — folder not reachable');
    });
});

describe('a batch and its undo round-trip the per-file caches (G2 final review F13, F6)', () => {
    const dislikeSkippedFiles = extract('dislikeSkippedFiles');
    const undoSkipBatch = extract('_undoSkipBatch');
    const KEY = ['a', 'x'].join(String.fromCharCode(0)); // bulkPairKey's separator
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                checkFolderExists: vi.fn(async () => true),
                createFolder: vi.fn(async () => ({ success: true })),
                moveFile: vi.fn(async ({ targetFolder, fileName }) => ({
                    success: true,
                    targetPath: `${targetFolder}/${fileName}`,
                })),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    // 64 hand-crafted dims (1..64), then the CLIP half: real (non-zero) or the zero padding
    // getCombinedFeatures adds when the file has no CLIP vector.
    function combined(realClip) {
        const v = new Float32Array(576);
        for (let i = 0; i < 64; i++) {
            v[i] = i + 1;
        }
        if (realClip) {
            for (let i = 64; i < 576; i++) {
                v[i] = (i % 7) / 10 + 0.01;
            }
        }
        return v;
    }

    function tripCtx(vector) {
        return {
            _fileOpInFlight: false,
            isLoading: false,
            isCompareMode: false,
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            likeOrSkip: activeTracker('/f/a'),
            mediaFiles: media('a', 'b'),
            currentIndex: 1,
            currentMedia: { tagName: 'IMG' },
            baseFolderPath: '/f',
            customDislikeFolder: '/disliked',
            moveHistory: [],
            _orderGeneration: 3,
            predictionScores: new Map(),
            featureCache: new Map([['/f/a', vector.slice(0, 64)]]),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map([['/f/a', { size: 10, mtime: 99 }]]),
            perceptualHashes: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set([KEY]),
            _bulkPairKeysReferencing: (name) => (name === 'a' ? [KEY] : []),
            getCombinedFeatures: (p) => (p === '/f/a' ? vector : null),
            removeFileFromList: extract('removeFileFromList'),
            restoreFeatureCachesFromHistory: extract('restoreFeatureCachesFromHistory'),
            featureCacheStore: { markChanged: vi.fn() }, // the restore counts as the visit's change
            _followRestoredFile: extract('_followRestoredFile'),
            saveBulkRatedFile: vi.fn(async () => {}),
            _refuseIfNeedsRegrant: () => false,
            _refuseUngrantedFolder: vi.fn(),
            showBulkDislikeConfirm: vi.fn(async () => true),
            showFolderCreationDialog: vi.fn(async () => false),
            forceVideoCleanup: vi.fn(async () => {}),
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateNavigationInfo: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
        };
    }

    async function roundTrip(ctx) {
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b']);
        expect(ctx.featureCache.has('/f/a')).toBe(false);
        expect(ctx.bulkRatedPairs.has(KEY)).toBe(false);
        expect(ctx.moveHistory[0].files[0].prunedPairKeys).toEqual([KEY]);
        await undoSkipBatch.call(ctx, ctx.moveHistory.pop());
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b']);
    }

    it('a real CLIP half: both halves, the size with mtime 0, and the rated-pair keys come back', async () => {
        const vector = combined(true);
        const ctx = tripCtx(vector);
        await roundTrip(ctx);
        expect(Array.from(ctx.featureCache.get('/f/a'))).toEqual(Array.from(vector.slice(0, 64)));
        expect(Array.from(ctx.clipCache.get('/f/a'))).toEqual(Array.from(vector.slice(64)));
        expect(ctx.featureMetadata.get('/f/a')).toEqual({ size: 10, mtime: 0 });
        expect(ctx.bulkRatedPairs.has(KEY)).toBe(true);
    });

    // CLAUDE.md "silent zero CLIP half": the zero padding must not come back as a real CLIP vector,
    // or the bulk collector (hasClip checks length only) trains on it once the bulk label is restored.
    it('a zero CLIP half (64-dim features only): the 64 dims come back, clipCache stays without the file', async () => {
        const vector = combined(false);
        const ctx = tripCtx(vector);
        await roundTrip(ctx);
        expect(Array.from(ctx.featureCache.get('/f/a'))).toEqual(Array.from(vector.slice(0, 64)));
        expect(ctx.clipCache.has('/f/a')).toBe(false);
        expect(ctx.featureMetadata.get('/f/a')).toEqual({ size: 10, mtime: 0 });
    });

    // PR #85 review #4: removeFileFromList drops the file's perceptual hash, so the batch stashes it per file and
    // the undo restores it; otherwise a similarity sort running across the batch and its undo sorts the file last.
    it('the perceptual hash is stashed per file and comes back with the undo (#4)', async () => {
        const ctx = tripCtx(combined(true));
        ctx.perceptualHashes.set('/f/a', '0101');
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.moveHistory[0].files[0].perceptualHash).toBe('0101');
        expect(ctx.perceptualHashes.has('/f/a')).toBe(false);
        await undoSkipBatch.call(ctx, ctx.moveHistory.pop());
        expect(ctx.perceptualHashes.get('/f/a')).toBe('0101');
    });
});

describe('the batch releases an on-screen video BEFORE the first rename (G2 final review F13)', () => {
    const dislikeSkippedFiles = extract('dislikeSkippedFiles');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('forceVideoCleanup has resolved when moveFile is first called', async () => {
        const order = [];
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                checkFolderExists: vi.fn(async () => true),
                moveFile: vi.fn(async ({ targetFolder, fileName }) => {
                    order.push(`move ${fileName}`);
                    return { success: true, targetPath: `${targetFolder}/${fileName}` };
                }),
            },
        };
        const ctx = {
            _fileOpInFlight: false,
            isLoading: false,
            isCompareMode: false,
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            likeOrSkip: activeTracker('/f/a', '/f/b'),
            mediaFiles: media('a', 'b', 'c'),
            currentIndex: 1,
            currentMedia: { tagName: 'VIDEO' },
            customDislikeFolder: '/disliked',
            moveHistory: [],
            _orderGeneration: 0,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            _bulkPairKeysReferencing: () => [],
            getCombinedFeatures: () => null,
            removeFileFromList: extract('removeFileFromList'),
            saveBulkRatedFile: vi.fn(async () => {}),
            _refuseIfNeedsRegrant: () => false,
            showBulkDislikeConfirm: vi.fn(async () => true),
            forceVideoCleanup: vi.fn(async () => {
                await Promise.resolve();
                order.push('cleanup resolved');
            }),
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateNavigationInfo: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
        };
        await dislikeSkippedFiles.call(ctx);
        expect(order).toEqual(['cleanup resolved', 'move a', 'move b']);
    }, 3000);
});
