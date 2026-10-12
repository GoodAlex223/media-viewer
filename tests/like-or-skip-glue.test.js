// G2 like-or-skip glue (spec docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md):
// the MediaViewer methods that connect like-or-skip.js to the app, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as LikeOrSkip from '../like-or-skip.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// media-viewer.js imports the module as a namespace. An extracted method runs in the global scope, so
// it resolves `LikeOrSkip` through the global object.
globalThis.LikeOrSkip = LikeOrSkip;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const METHOD_HEADER = /^ {4}(async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{\s*$/;
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);

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

describe('a failed similarity sort keeps the skips (spec D1)', () => {
    const handleSortBySimilarity = extract('handleSortBySimilarity');

    it('puts back the order it started from without announcing a reorder, and bumps the generation', async () => {
        const files = media('a', 'b', 'c');
        const ctx = {
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            isSortedBySimilarity: false,
            sortAbortController: null,
            sortAlgorithm: 'vptree',
            baseFolderPath: '/f',
            mediaFiles: [...files],
            originalMediaFiles: [],
            currentIndex: 0,
            likeOrSkip: activeTracker('/f/a', '/f/b'),
            _orderGeneration: 0,
            _onOrderChanged: vi.fn(),
            showNotification: vi.fn(),
            clearProgressNotification: vi.fn(),
            showMedia: vi.fn(),
            sortSimilarityBtn: { disabled: false, querySelector: () => ({ textContent: '' }) },
            // loadSortCache is the first collaborator called after the originalMediaFiles snapshot
            // (forceResort is false, so deleteSortCache is skipped): its throw drives the catch.
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
        expect(ctx._orderGeneration).toBe(1);
        expect(ctx.likeOrSkip.active).toBe(true);
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/a', '/f/b']);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/f/a', '/f/b', '/f/c']);
        const messages = ctx.showNotification.mock.calls.map((c) => String(c[0]));
        expect(messages.filter((m) => m.includes('Skipped list cleared'))).toEqual([]);
    });
});

describe('every reorder of mediaFiles goes through _onOrderChanged (spec § 4 control)', () => {
    // Methods that put a new ORDER of mediaFiles on screen. Each must call the hook.
    const ORDER_CHANGERS = [
        'loadFolder',
        'restoreOriginalOrderForTournament',
        'handleSortBySimilarity',
        'applyPredictionSortResult',
        'handleSortByPrediction',
    ];
    // Reviewed exemptions: assignments that are not a new order on screen, and why.
    const EXEMPT = {
        constructor: 'the initial empty list',
        setupEventListeners: 'the change-folder handler empties the list; loadFolder then announces the folder',
        applyCachedSortOrder: "runs inside handleSortBySimilarity's cache path, which announces on success",
        insertNewFilesInSortedOrder: 'runs inside applyCachedSortOrder (same)',
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
            shortcuts: { single: { dislikeSkipped: 'KeyF' } },
            keyDisplayName: (k) => k.replace('Key', ''),
            _shortcutSuffix: extract('_shortcutSuffix'),
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
