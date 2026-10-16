// G4 recently opened folders glue (spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md):
// the MediaViewer methods that connect recent-folders.js to the app, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as RecentFolders from '../recent-folders.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// media-viewer.js imports the module as a namespace. An extracted method runs in the global scope, so it
// resolves `RecentFolders` through the global object.
globalThis.RecentFolders = RecentFolders;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable (the technique of like-or-skip-glue.test.js, sync or async). */
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

const entry = (p, openedAt = 1) => ({ path: p, openedAt });

describe('_setRecentFolders — the one writer: persist, then re-render (spec § 5)', () => {
    const setRecentFolders = extract('_setRecentFolders');
    let origStorage;
    let origWindow;
    beforeEach(() => {
        origStorage = globalThis.localStorage;
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
    });
    afterEach(() => {
        globalThis.localStorage = origStorage;
        globalThis.window = origWindow;
    });

    const ctx = () => ({ recentFolders: [], renderRecentFolders: vi.fn() });

    it('stores the serialized list and re-renders the drop-zone list', () => {
        globalThis.localStorage = { setItem: vi.fn() };
        const c = ctx();
        const entries = [entry('C:\\a', 5)];
        setRecentFolders.call(c, entries);
        expect(c.recentFolders).toBe(entries);
        expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
            'recentFolders',
            RecentFolders.serializeRecentFolders(entries)
        );
        expect(c.renderRecentFolders).toHaveBeenCalledTimes(1);
    });

    it('a write that throws is logged, and the session list still updates and renders', () => {
        globalThis.localStorage = {
            setItem: vi.fn(() => {
                throw new Error('QuotaExceededError');
            }),
        };
        const c = ctx();
        const entries = [entry('C:\\a', 5)];
        expect(() => setRecentFolders.call(c, entries)).not.toThrow();
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith({
            level: 'warn',
            message: 'Could not save recent folders: QuotaExceededError',
            source: 'renderer',
        });
        expect(c.recentFolders).toBe(entries);
        expect(c.renderRecentFolders).toHaveBeenCalledTimes(1);
    });
});

describe('_recordRecentFolder / _removeRecentFolder', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('records a folder first, stamped now, through _setRecentFolders', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1000);
        const c = { recentFolders: [entry('C:\\a', 1)], _setRecentFolders: vi.fn() };
        extract('_recordRecentFolder').call(c, 'C:\\b');
        expect(c._setRecentFolders).toHaveBeenCalledWith([entry('C:\\b', 1000), entry('C:\\a', 1)]);
    });

    it('removes a folder through _setRecentFolders', () => {
        const c = { recentFolders: [entry('C:\\a'), entry('C:\\b')], _setRecentFolders: vi.fn() };
        extract('_removeRecentFolder').call(c, 'C:\\a');
        expect(c._setRecentFolders).toHaveBeenCalledWith([entry('C:\\b')]);
    });
});

describe('loadFolder records only a folder that showed media (spec § 5)', () => {
    const loadFolder = extract('loadFolder');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        globalThis.window = origWindow;
        vi.restoreAllMocks();
    });

    function withReply(reply) {
        globalThis.window = {
            electronAPI: {
                loadFolder: vi.fn(async () => reply),
                path: { basename: (p) => p.split('\\').pop() },
            },
        };
    }

    function loadCtx(overrides = {}) {
        return {
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            customLikeFolder: '',
            customDislikeFolder: '',
            customSpecialFolder: '',
            isTournamentMode: false,
            tournament: { engine: null },
            mediaFiles: [],
            originalMediaFiles: [],
            moveHistory: [],
            perceptualHashes: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            predictionScores: new Map(),
            sortSimilarityBtn: null,
            showLoadingSpinner: vi.fn(),
            hideLoadingSpinner: vi.fn(),
            showDropZone: vi.fn(),
            hideDropZone: vi.fn(),
            showError: vi.fn(),
            showNotification: vi.fn(),
            exitTournamentMode: vi.fn(),
            cancelBackgroundExtraction: vi.fn(),
            _abortInFlightPredictionSort: vi.fn(),
            _onOrderChanged: vi.fn(),
            loadBulkRatedFile: vi.fn(async () => {}),
            switchToSingleModeUI: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateSortPredictionButton: vi.fn(),
            _recordRecentFolder: vi.fn(),
            ...overrides,
        };
    }

    const file = { name: 'a.png', path: 'C:\\pics\\Liked_3\\a.png', size: 1, type: 'image/png' };

    it('records the folder once its first file is on screen', async () => {
        withReply({ success: true, files: [file] });
        const c = loadCtx();
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c._recordRecentFolder).toHaveBeenCalledTimes(1);
        expect(c._recordRecentFolder).toHaveBeenCalledWith('C:\\pics\\Liked_3');
        expect(c.showMedia.mock.invocationCallOrder[0]).toBeLessThan(c._recordRecentFolder.mock.invocationCallOrder[0]);
    });

    it('does not record an empty folder', async () => {
        withReply({ success: true, files: [] });
        const c = loadCtx();
        await loadFolder.call(c, 'C:\\pics\\Empty');
        expect(c._recordRecentFolder).not.toHaveBeenCalled();
        expect(c.showDropZone).toHaveBeenCalled();
    });

    it('does not record a folder that failed to load', async () => {
        withReply({ success: false, error: 'Not permitted' });
        const c = loadCtx();
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c._recordRecentFolder).not.toHaveBeenCalled();
    });

    it('does not record when showing the first file throws', async () => {
        withReply({ success: true, files: [file] });
        const c = loadCtx({ showMedia: vi.fn(async () => Promise.reject(new Error('boom'))) });
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c._recordRecentFolder).not.toHaveBeenCalled();
        expect(c.showError).toHaveBeenCalledWith('Failed to load folder: boom');
    });
});

describe('listing asks main nothing (spec F7) — guard, passes by construction', () => {
    const RENDER_PATHS = ['renderRecentFolders', '_buildRecentFolderRows'];

    it.each(RENDER_PATHS)('%s makes no grant, existence or load call', (name) => {
        expect(extract(name).toString()).not.toMatch(/getGrantStatus|checkFolderExists|loadFolder\(|switchToFolder\(/);
    });
});
