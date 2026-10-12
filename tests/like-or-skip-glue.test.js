// G2 like-or-skip glue (spec docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md):
// the MediaViewer methods that connect like-or-skip.js to the app, tested by extracting their source.
import { describe, it, expect, vi } from 'vitest';
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
