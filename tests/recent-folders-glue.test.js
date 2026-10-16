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

    const ctx = () => ({
        recentFolders: [],
        renderRecentFolders: vi.fn(),
        _updateRecentFoldersButton: vi.fn(),
        _refreshRecentFoldersMenu: vi.fn(),
    });

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
        expect(c._updateRecentFoldersButton).toHaveBeenCalledTimes(1);
        expect(c._refreshRecentFoldersMenu).toHaveBeenCalledTimes(1);
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
    const RENDER_PATHS = [
        'renderRecentFolders',
        '_buildRecentFolderRows',
        '_renderRecentFoldersMenu',
        'openRecentFoldersMenu',
    ];

    it.each(RENDER_PATHS)('%s makes no grant, existence or load call', (name) => {
        expect(extract(name).toString()).not.toMatch(/getGrantStatus|checkFolderExists|loadFolder\(|switchToFolder\(/);
    });
});

describe('the ▾ button (spec § 7)', () => {
    const update = extract('_updateRecentFoldersButton');
    const btnCtx = (recentFolders, baseFolderPath) => ({
        recentFolders,
        baseFolderPath,
        recentFoldersBtn: { disabled: false, title: '' },
        _hasOtherRecentFolders: extract('_hasOtherRecentFolders'),
    });

    it('is disabled, and says why, when the only listed folder is the one on screen', () => {
        const c = btnCtx([entry('C:\\a')], 'C:\\a');
        update.call(c);
        expect(c.recentFoldersBtn).toEqual({ disabled: true, title: 'No other recent folders' });
    });

    it('is enabled when another folder is listed', () => {
        const c = btnCtx([entry('C:\\a'), entry('C:\\b')], 'C:\\a');
        update.call(c);
        expect(c.recentFoldersBtn).toEqual({ disabled: false, title: 'Recent folders' });
    });

    it('is disabled with an empty list', () => {
        const c = btnCtx([], '');
        update.call(c);
        expect(c.recentFoldersBtn.disabled).toBe(true);
    });
});

describe('the header menu owns the keyboard while open, and lets go on every close (spec § 7, § 11)', () => {
    const openMenu = extract('openRecentFoldersMenu');
    const closeMenu = extract('closeRecentFoldersMenu');
    let origDocument;
    let listeners;
    beforeEach(() => {
        origDocument = globalThis.document;
        listeners = new Map();
        globalThis.document = {
            activeElement: null,
            addEventListener: vi.fn((type, fn, capture) => listeners.set(`${type}:${capture}`, fn)),
            removeEventListener: vi.fn((type, fn, capture) => {
                if (listeners.get(`${type}:${capture}`) === fn) {
                    listeners.delete(`${type}:${capture}`);
                }
            }),
        };
    });
    afterEach(() => {
        globalThis.document = origDocument;
    });

    function menuCtx(recentFolders = [entry('C:\\a'), entry('C:\\b')]) {
        const rows = [
            { click: vi.fn(), focus: vi.fn() },
            { click: vi.fn(), focus: vi.fn() },
        ];
        for (const r of rows) {
            r.focus.mockImplementation(() => {
                globalThis.document.activeElement = r;
            });
        }
        const c = {
            _recentMenuCleanup: null,
            recentFolders,
            baseFolderPath: 'C:\\a',
            recentFoldersMenu: {
                style: { display: 'none' },
                querySelectorAll: () => rows,
                querySelector: () => rows[0],
                contains: (t) => rows.includes(t),
            },
            recentFoldersBtn: { setAttribute: vi.fn(), contains: () => false },
            header: { classList: { add: vi.fn(), remove: vi.fn() } },
            _renderRecentFoldersMenu: vi.fn(),
            _hasOtherRecentFolders: extract('_hasOtherRecentFolders'),
        };
        c.closeRecentFoldersMenu = () => closeMenu.call(c);
        return { c, rows };
    }
    const key = (k, extra = {}) => ({
        key: k,
        repeat: false,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
        ...extra,
    });
    const keydown = (e) => listeners.get('keydown:true')(e);

    it('opening adds three capture listeners, pins the header and focuses the first row', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        expect([...listeners.keys()].sort()).toEqual(['keydown:true', 'keyup:true', 'pointerdown:true']);
        expect(c.header.classList.add).toHaveBeenCalledWith('menu-open');
        expect(c.recentFoldersMenu.style.display).toBe('flex');
        expect(c.recentFoldersBtn.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
        expect(c._renderRecentFoldersMenu).toHaveBeenCalledTimes(1);
        expect(rows[0].focus).toHaveBeenCalled();
    });

    it('closing removes exactly those listeners and unpins; a second close does nothing', () => {
        const { c } = menuCtx();
        openMenu.call(c);
        c.closeRecentFoldersMenu();
        expect(listeners.size).toBe(0);
        expect(c._recentMenuCleanup).toBeNull();
        expect(c.header.classList.remove).toHaveBeenCalledWith('menu-open');
        expect(c.recentFoldersMenu.style.display).toBe('none');
        expect(c.recentFoldersBtn.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');
        const removals = globalThis.document.removeEventListener.mock.calls.length;
        c.closeRecentFoldersMenu();
        expect(globalThis.document.removeEventListener.mock.calls.length).toBe(removals);
    });

    it('does not open when nothing but the folder on screen is listed', () => {
        const { c } = menuCtx([entry('C:\\a')]);
        openMenu.call(c);
        expect(listeners.size).toBe(0);
        expect(c._recentMenuCleanup).toBeNull();
    });

    it('a rating key is swallowed and the menu stays open', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        const e = key('q');
        keydown(e);
        expect(e.preventDefault).toHaveBeenCalled();
        expect(e.stopImmediatePropagation).toHaveBeenCalled();
        expect(listeners.size).toBe(3);
        expect(rows[0].click).not.toHaveBeenCalled();
    });

    it('keyup is swallowed too', () => {
        const { c } = menuCtx();
        openMenu.call(c);
        const e = key('q');
        listeners.get('keyup:true')(e);
        expect(e.stopImmediatePropagation).toHaveBeenCalled();
    });

    it('Escape closes it', () => {
        const { c } = menuCtx();
        openMenu.call(c);
        keydown(key('Escape'));
        expect(listeners.size).toBe(0);
    });

    it('arrows and Tab move focus, wrapping; Enter chooses the focused row', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        expect(globalThis.document.activeElement).toBe(rows[0]);
        keydown(key('ArrowDown'));
        expect(globalThis.document.activeElement).toBe(rows[1]);
        keydown(key('Tab'));
        expect(globalThis.document.activeElement).toBe(rows[0]);
        keydown(key('ArrowUp'));
        expect(globalThis.document.activeElement).toBe(rows[1]);
        keydown(key('Tab', { shiftKey: true }));
        expect(globalThis.document.activeElement).toBe(rows[0]);
        keydown(key('Enter'));
        expect(rows[0].click).toHaveBeenCalledTimes(1);
    });

    it('a held Enter chooses nothing (Review Focus 3)', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        keydown(key('Enter', { repeat: true }));
        keydown(key(' ', { repeat: true }));
        expect(rows[0].click).not.toHaveBeenCalled();
    });

    it('a pointerdown outside closes it; inside does not', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        listeners.get('pointerdown:true')({ target: rows[1] });
        expect(listeners.size).toBe(3);
        listeners.get('pointerdown:true')({ target: {} });
        expect(listeners.size).toBe(0);
    });
});

describe('_refreshRecentFoldersMenu — after the list changed', () => {
    const refresh = extract('_refreshRecentFoldersMenu');
    const refreshCtx = (open, recentFolders) => ({
        _recentMenuCleanup: open ? vi.fn() : null,
        recentFolders,
        baseFolderPath: 'C:\\a',
        recentFoldersMenu: { querySelector: () => ({ focus: vi.fn() }) },
        _hasOtherRecentFolders: extract('_hasOtherRecentFolders'),
        _renderRecentFoldersMenu: vi.fn(),
        closeRecentFoldersMenu: vi.fn(),
    });

    it('does nothing while the menu is closed', () => {
        const c = refreshCtx(false, [entry('C:\\a'), entry('C:\\b')]);
        refresh.call(c);
        expect(c._renderRecentFoldersMenu).not.toHaveBeenCalled();
        expect(c.closeRecentFoldersMenu).not.toHaveBeenCalled();
    });

    it('rebuilds the open menu while another folder is left', () => {
        const c = refreshCtx(true, [entry('C:\\a'), entry('C:\\b')]);
        refresh.call(c);
        expect(c._renderRecentFoldersMenu).toHaveBeenCalledTimes(1);
        expect(c.closeRecentFoldersMenu).not.toHaveBeenCalled();
    });

    it('closes the menu when only the folder on screen is left', () => {
        const c = refreshCtx(true, [entry('C:\\a')]);
        refresh.call(c);
        expect(c.closeRecentFoldersMenu).toHaveBeenCalledTimes(1);
        expect(c._renderRecentFoldersMenu).not.toHaveBeenCalled();
    });
});
