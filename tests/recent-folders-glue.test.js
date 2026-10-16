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

const WAIT_LOAD = ['Wait for the folder to finish loading', 'info'];

describe('_refuseIfFolderLoadInFlight — one folder load at a time (PR #81 review #1)', () => {
    const refuse = extract('_refuseIfFolderLoadInFlight');

    it('refuses with the notice while a load runs, and takes nothing itself', () => {
        const c = { _folderLoadInFlight: true, showNotification: vi.fn() };
        expect(refuse.call(c)).toBe(true);
        expect(c.showNotification.mock.calls).toEqual([WAIT_LOAD]);
        expect(c._folderLoadInFlight).toBe(true);
    });

    it('lets the call through, silently, when no load runs', () => {
        const c = { _folderLoadInFlight: false, showNotification: vi.fn() };
        expect(refuse.call(c)).toBe(false);
        expect(c.showNotification).not.toHaveBeenCalled();
    });
});

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
            _folderIntentGen: 0,
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _folderLoadInFlight: false,
            _refuseIfFolderLoadInFlight: extract('_refuseIfFolderLoadInFlight'),
            _updateRecentFoldersButton: vi.fn(),
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

    // G4 final review F1: a load is a change of folder intent, so a recent-folder check still in flight
    // must not act on its answer afterwards.
    it('a load that starts bumps the folder-intent generation exactly once (G4 final review F1)', async () => {
        withReply({ success: true, files: [file] });
        const c = loadCtx();
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c._folderIntentGen).toBe(1);
    });

    // Guard — passes before the fix by construction (nothing bumped then): it pins the bump AFTER the refusal.
    it('a load refused during a file action does not bump it — a refusal is not a change of intent', async () => {
        withReply({ success: true, files: [file] });
        const c = loadCtx({ _fileOpInFlight: true });
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c.showNotification).toHaveBeenCalledWith('Wait for the move to finish', 'info');
        expect(c._folderIntentGen).toBe(0);
    });

    // PR #81 review #1: two loads interleaved, and the older one's bulk-rating read resolved against the newer
    // folder's files and saved into it. One load at a time; the ▾ follows the flag both ways.
    describe('one load at a time (PR #81 review #1)', () => {
        it('holds the load flag from before the listing until the load settles, refreshing the ▾ both times', async () => {
            const c = loadCtx();
            const seen = [];
            c._updateRecentFoldersButton = vi.fn(() => seen.push(c._folderLoadInFlight));
            let atListing;
            globalThis.window = {
                electronAPI: {
                    loadFolder: vi.fn(async () => {
                        atListing = c._folderLoadInFlight;
                        return { success: true, files: [file] };
                    }),
                    path: { basename: (p) => p.split('\\').pop() },
                },
            };
            await loadFolder.call(c, 'C:\\pics\\Liked_3');
            expect(atListing).toBe(true);
            expect(c._folderLoadInFlight).toBe(false);
            expect(seen[0]).toBe(true);
            expect(seen.at(-1)).toBe(false);
        });

        it.each([
            ['an empty folder', { reply: { success: true, files: [] } }],
            ['a failed load', { reply: { success: false, error: 'Not permitted' } }],
            ['a listing that throws', { reply: new Error('ipc') }],
            ['a render that throws', { reply: { success: true, files: [file] }, showMediaThrows: true }],
        ])('releases the flag after %s', async (_label, { reply, showMediaThrows = false }) => {
            globalThis.window = {
                electronAPI: {
                    loadFolder: vi.fn(async () => {
                        if (reply instanceof Error) {
                            throw reply;
                        }
                        return reply;
                    }),
                    path: { basename: (p) => p.split('\\').pop() },
                },
            };
            const c = loadCtx(
                showMediaThrows ? { showMedia: vi.fn(async () => Promise.reject(new Error('boom'))) } : {}
            );
            await loadFolder.call(c, 'C:\\pics\\Liked_3');
            expect(c._folderLoadInFlight).toBe(false);
            expect(c._updateRecentFoldersButton).toHaveBeenCalled();
        });

        it('refuses while another load runs: no listing, no spinner, no intent bump', async () => {
            withReply({ success: true, files: [file] });
            const c = loadCtx({ _folderLoadInFlight: true });
            await loadFolder.call(c, 'C:\\pics\\Liked_3');
            expect(c.showNotification.mock.calls).toEqual([WAIT_LOAD]);
            expect(globalThis.window.electronAPI.loadFolder).not.toHaveBeenCalled();
            expect(c.showLoadingSpinner).not.toHaveBeenCalled();
            expect(c._folderIntentGen).toBe(0);
            expect(c._folderLoadInFlight).toBe(true); // the running load still holds it
        });
    });

    // PR #81 review #2: after Save & leave or Discard the engine is gone; a load that then failed returned before
    // the tournament exit, leaving tournament mode on with no engine until the next successful load.
    describe('a failed load leaves tournament mode too (PR #81 review #2)', () => {
        it('when main refuses the listing', async () => {
            withReply({ success: false, error: 'Not permitted' });
            const c = loadCtx({ isTournamentMode: true });
            await loadFolder.call(c, 'C:\\pics\\Liked_3');
            expect(c.exitTournamentMode).toHaveBeenCalledTimes(1);
            expect(c.showDropZone).toHaveBeenCalled();
        });

        it('when the listing throws', async () => {
            globalThis.window = {
                electronAPI: {
                    loadFolder: vi.fn(async () => Promise.reject(new Error('ipc'))),
                    path: { basename: (p) => p.split('\\').pop() },
                },
            };
            const c = loadCtx({ isTournamentMode: true });
            await loadFolder.call(c, 'C:\\pics\\Liked_3');
            expect(c.exitTournamentMode).toHaveBeenCalledTimes(1);
            expect(c.showError).toHaveBeenCalledWith('Failed to load folder: ipc');
        });
    });
});

describe('openFolderDialog — the drop zone click (G4 final review F1)', () => {
    const openFolderDialog = extract('openFolderDialog');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
        globalThis.window = origWindow;
        vi.restoreAllMocks();
    });

    it('bumps the folder-intent generation before the dialog answers', async () => {
        const c = { _folderIntentGen: 0, loadFolder: vi.fn(async () => {}), showError: vi.fn() };
        let atDialog;
        globalThis.window = {
            electronAPI: {
                openFolderDialog: vi.fn(async () => {
                    atDialog = c._folderIntentGen;
                    return 'C:\\pics\\Picked';
                }),
            },
        };
        await openFolderDialog.call(c);
        expect(atDialog).toBe(1);
        expect(c.loadFolder).toHaveBeenCalledWith('C:\\pics\\Picked');
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

    // PR #81 review #1: change-folder's reset empties baseFolderPath before the load, which made every listed
    // folder "other" and enabled ▾ for the whole load.
    it('is disabled while a folder is loading, and says why', () => {
        const c = { ...btnCtx([entry('C:\\a'), entry('C:\\b')], ''), _folderLoadInFlight: true };
        update.call(c);
        expect(c.recentFoldersBtn).toEqual({ disabled: true, title: 'Wait for the folder to finish loading' });
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

    it('does not open while a folder is loading (PR #81 review #1)', () => {
        const { c } = menuCtx();
        c._folderLoadInFlight = true;
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

describe('switchToFolder — change-folder, moved; asks first in an unfinished tournament (spec § 6, D3)', () => {
    const switchToFolder = extract('switchToFolder');
    const switchToFolderNow = extract('_switchToFolderNow');

    function tournamentCtx({ complete = false, ...overrides } = {}) {
        return {
            baseFolderPath: 'C:\\here',
            isTournamentMode: true,
            tournament: { engine: { isComplete: () => complete } },
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _folderLoadInFlight: false,
            _refuseIfFolderLoadInFlight: extract('_refuseIfFolderLoadInFlight'),
            showNotification: vi.fn(),
            showTournamentLeavePrompt: vi.fn(),
            _switchToFolderNow: vi.fn(async () => {}),
            ...overrides,
        };
    }

    // PR #81 review #1: a second switch during a load interleaved two loads (change-folder before G4; the ▾ menu
    // made it one click).
    it('refuses while a folder is loading, before it asks', async () => {
        const c = tournamentCtx({ _folderLoadInFlight: true });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showNotification.mock.calls).toEqual([WAIT_LOAD]);
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
        expect(c._switchToFolderNow).not.toHaveBeenCalled();
    });

    it('the switch itself refuses before its reset while a folder is loading', async () => {
        const c = {
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _folderLoadInFlight: true,
            _refuseIfFolderLoadInFlight: extract('_refuseIfFolderLoadInFlight'),
            showNotification: vi.fn(),
            mediaFiles: [{ path: 'C:\\here\\a.png' }],
            baseFolderPath: 'C:\\here',
            cleanupCurrentMedia: vi.fn(async () => {}),
            loadFolder: vi.fn(async () => {}),
        };
        await switchToFolderNow.call(c, 'C:\\there');
        expect(c.showNotification.mock.calls).toEqual([WAIT_LOAD]);
        expect(c.cleanupCurrentMedia).not.toHaveBeenCalled();
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(c.mediaFiles).toHaveLength(1);
        expect(c.baseFolderPath).toBe('C:\\here');
    });

    it('during an unfinished tournament it shows the leave prompt and changes nothing until the user chooses', async () => {
        const c = tournamentCtx();
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showTournamentLeavePrompt).toHaveBeenCalledTimes(1);
        expect(c._switchToFolderNow).not.toHaveBeenCalled();
        // Save & leave or Discard runs the continuation: the switch itself.
        await c.showTournamentLeavePrompt.mock.calls[0][0]();
        expect(c._switchToFolderNow).toHaveBeenCalledWith('C:\\there');
    });

    it('a finished tournament switches at once, without the prompt', async () => {
        const c = tournamentCtx({ complete: true });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
        expect(c._switchToFolderNow).toHaveBeenCalledWith('C:\\there');
    });

    it('outside tournament mode it switches at once', async () => {
        const c = tournamentCtx({ isTournamentMode: false });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
        expect(c._switchToFolderNow).toHaveBeenCalledWith('C:\\there');
    });

    // Guard — passes by construction (G4 final review F4): it pins the recovery the comment above
    // _switchToFolderNow promises. A continuation refused after Save & leave or Discard leaves tournament mode on
    // with the engine dropped; a re-pick of the folder then switches without a second prompt.
    it('in tournament mode with the engine dropped it switches at once, without the prompt', async () => {
        const c = tournamentCtx({ tournament: { engine: null } });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
        expect(c._switchToFolderNow).toHaveBeenCalledWith('C:\\there');
    });

    it('refuses during a file action before it asks', async () => {
        const c = tournamentCtx({ _fileOpInFlight: true });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showNotification).toHaveBeenCalledWith('Wait for the move to finish', 'info');
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
    });

    it('the switch itself refuses before its reset when a file action started behind the prompt', async () => {
        const c = {
            _fileOpInFlight: true,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            showNotification: vi.fn(),
            mediaFiles: [{ path: 'C:\\here\\a.png' }],
            baseFolderPath: 'C:\\here',
            cleanupCurrentMedia: vi.fn(async () => {}),
            loadFolder: vi.fn(async () => {}),
        };
        await switchToFolderNow.call(c, 'C:\\there');
        expect(c.showNotification).toHaveBeenCalledWith('Wait for the move to finish', 'info');
        expect(c.cleanupCurrentMedia).not.toHaveBeenCalled();
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(c.mediaFiles).toHaveLength(1);
        expect(c.baseFolderPath).toBe('C:\\here');
    });

    it.each([
        ['no folder', null],
        ['the folder already open', 'C:\\a'],
    ])('does nothing for %s — and refuses nothing, even during a file action', async (_label, folderPath) => {
        const c = {
            baseFolderPath: 'C:\\a',
            _fileOpInFlight: true,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            showNotification: vi.fn(),
            cleanupCurrentMedia: vi.fn(async () => {}),
            loadFolder: vi.fn(async () => {}),
        };
        await switchToFolder.call(c, folderPath);
        expect(c.showNotification).not.toHaveBeenCalled();
        expect(c.cleanupCurrentMedia).not.toHaveBeenCalled();
        expect(c.loadFolder).not.toHaveBeenCalled();
    });
});

// Guard — passes by construction against the existing code (G4 final review M7: the method had no test). It pins
// the busy row: the chosen surface's matching row only, and nothing when no row matches or the root is missing.
describe('_markRecentFolderBusy — the chosen row reads "Checking…" while main answers (spec § 6 step 2)', () => {
    const markBusy = extract('_markRecentFolderBusy');

    function row(folderPath) {
        const pathEl = { textContent: folderPath };
        const attrs = {};
        return {
            dataset: { path: folderPath },
            attrs,
            pathEl,
            setAttribute: vi.fn((name, value) => {
                attrs[name] = value;
            }),
            querySelector: (sel) => (sel === '.recent-folder-path' ? pathEl : null),
        };
    }
    const surfaceRoot = (rows) => ({ querySelectorAll: (sel) => (sel === '.recent-folder-item' ? rows : []) });
    const untouched = (r, folderPath) => {
        expect(r.attrs).toEqual({});
        expect(r.pathEl.textContent).toBe(folderPath);
    };

    const A = 'C:\\pics\\Liked_3';
    const B = 'C:\\pics\\Wallpapers';
    function busyCtx() {
        const drop = [row(A), row(B)];
        const menu = [row(A), row(B)];
        return { drop, menu, c: { recentFoldersDrop: surfaceRoot(drop), recentFoldersMenu: surfaceRoot(menu) } };
    }

    it('from the drop zone it marks the matching drop row, and only that row', () => {
        const { drop, menu, c } = busyCtx();
        markBusy.call(c, A, 'drop');
        expect(drop[0].attrs).toEqual({ 'aria-busy': 'true' });
        expect(drop[0].pathEl.textContent).toBe('Checking…');
        untouched(drop[1], B);
        untouched(menu[0], A);
        untouched(menu[1], B);
    });

    it('from the header menu it marks the matching menu row, and leaves the drop zone alone', () => {
        const { drop, menu, c } = busyCtx();
        markBusy.call(c, B, 'menu');
        expect(menu[1].attrs).toEqual({ 'aria-busy': 'true' });
        expect(menu[1].pathEl.textContent).toBe('Checking…');
        untouched(menu[0], A);
        untouched(drop[0], A);
        untouched(drop[1], B);
    });

    it('does nothing when no row matches', () => {
        const { drop, menu, c } = busyCtx();
        markBusy.call(c, 'C:\\pics\\Other', 'drop');
        for (const [r, p] of [
            [drop[0], A],
            [drop[1], B],
            [menu[0], A],
            [menu[1], B],
        ]) {
            untouched(r, p);
        }
    });

    it('does nothing, and does not throw, when the surface has no root', () => {
        const { drop, c } = busyCtx();
        c.recentFoldersMenu = null;
        expect(() => markBusy.call(c, A, 'menu')).not.toThrow();
        untouched(drop[0], A);
    });
});

// PR #81 review #5: a re-render during a check (a ✕ on another row) rebuilt the rows without the mark, while every
// row click was still being ignored.
describe('_buildRecentFolderRows keeps the checked row marked across a re-render (PR #81 review #5)', () => {
    const build = extract('_buildRecentFolderRows');
    const A = 'C:\\pics\\Liked_3';
    const B = 'C:\\pics\\Wallpapers';
    let origDocument;
    let origWindow;
    beforeEach(() => {
        origDocument = globalThis.document;
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { path: { basename: (p) => p.split('\\').pop() } } };
        globalThis.document = {
            createElement: (tag) => ({
                tag,
                children: [],
                dataset: {},
                attrs: {},
                textContent: '',
                classList: { add: vi.fn() },
                setAttribute(name, value) {
                    this.attrs[name] = value;
                },
                append(...kids) {
                    this.children.push(...kids);
                },
                addEventListener: vi.fn(),
            }),
        };
    });
    afterEach(() => {
        globalThis.document = origDocument;
        globalThis.window = origWindow;
    });

    const parts = (row) => {
        const item = row.children[0];
        return { busy: item.attrs['aria-busy'], path: item.children[1].textContent };
    };

    it.each(['drop', 'menu'])('on the %s surface, only the row being checked reads "Checking…"', (surface) => {
        const c = { recentFolders: [entry(A), entry(B)], baseFolderPath: '', _recentOpenInFlight: A };
        const rows = build.call(c, surface);
        expect(parts(rows[0])).toEqual({ busy: 'true', path: 'Checking…' });
        expect(parts(rows[1])).toEqual({ busy: undefined, path: B });
    });

    it('with no check in flight, every row shows its path', () => {
        const c = { recentFolders: [entry(A), entry(B)], baseFolderPath: '', _recentOpenInFlight: null };
        const rows = build.call(c, 'drop');
        expect(rows.map(parts)).toEqual([
            { busy: undefined, path: A },
            { busy: undefined, path: B },
        ]);
    });
});

describe('openRecentFolder — validate on click (spec § 6)', () => {
    const openRecentFolder = extract('openRecentFolder');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    /** Main's answers: `status` is getGrantStatus's whole reply (an array, null when refused, or an Error to throw). */
    function api({ status = [true], exists = true, picked = null } = {}) {
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('\\').pop() },
                getGrantStatus: vi.fn(async () => {
                    if (status instanceof Error) {
                        throw status;
                    }
                    return status;
                }),
                checkFolderExists: vi.fn(async () => {
                    if (exists instanceof Error) {
                        throw exists;
                    }
                    return exists;
                }),
                openFolderDialog: vi.fn(async () => picked),
                logError: vi.fn(),
            },
        };
        return globalThis.window.electronAPI;
    }

    function openCtx(overrides = {}) {
        return {
            recentFolders: [entry(DIR)],
            _recentOpenInFlight: null,
            _folderIntentGen: 0,
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _folderLoadInFlight: false,
            _refuseIfFolderLoadInFlight: extract('_refuseIfFolderLoadInFlight'),
            _openRecentFolderOn: extract('_openRecentFolderOn'),
            _markRecentFolderBusy: vi.fn(),
            closeRecentFoldersMenu: vi.fn(),
            renderRecentFolders: vi.fn(),
            _removeRecentFolder: vi.fn(),
            switchToFolder: vi.fn(async () => {}),
            loadFolder: vi.fn(async () => {}),
            showNotification: vi.fn(),
            showError: vi.fn(),
            ...overrides,
        };
    }

    const DIR = 'C:\\pics\\Liked_3';

    it('a granted folder that exists opens from the drop zone through loadFolder, with no dialog', async () => {
        const e = api();
        // E7: the folder's last load was empty, which left baseFolderPath naming it — a retry still loads it.
        const c = openCtx({ baseFolderPath: DIR });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.loadFolder).toHaveBeenCalledWith(DIR);
        expect(c.switchToFolder).not.toHaveBeenCalled();
        expect(e.openFolderDialog).not.toHaveBeenCalled();
        expect(c.showNotification).not.toHaveBeenCalled();
        expect(c._markRecentFolderBusy).toHaveBeenCalledWith(DIR, 'drop');
    });

    it('from the header menu it opens through switchToFolder', async () => {
        api();
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'menu');
        expect(c.switchToFolder).toHaveBeenCalledWith(DIR);
        expect(c.loadFolder).not.toHaveBeenCalled();
    });

    it('the menu closes before anything opens', async () => {
        api();
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.closeRecentFoldersMenu.mock.invocationCallOrder[0]).toBeLessThan(
            c.loadFolder.mock.invocationCallOrder[0]
        );
    });

    it('a folder that no longer exists is removed with a notice, and nothing opens', async () => {
        const e = api({ exists: false });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c._removeRecentFolder).toHaveBeenCalledWith(DIR);
        expect(c.showNotification).toHaveBeenCalledWith(
            '"Liked_3" no longer exists — removed from recent folders',
            'warning'
        );
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(e.openFolderDialog).not.toHaveBeenCalled();
    });

    it('a folder main has not granted opens the dialog at that folder, then opens the pick', async () => {
        const e = api({ status: [false], picked: 'C:\\pics\\Picked' });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(e.checkFolderExists).not.toHaveBeenCalled();
        expect(c.showNotification).toHaveBeenCalledWith(
            'Confirm "Liked_3" — press Select Folder (security update)',
            'info'
        );
        expect(e.openFolderDialog).toHaveBeenCalledWith(DIR);
        expect(c.loadFolder).toHaveBeenCalledWith('C:\\pics\\Picked');
    });

    it('from the menu, the pick opens through switchToFolder', async () => {
        api({ status: [false], picked: 'C:\\pics\\Picked' });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'menu');
        expect(c.switchToFolder).toHaveBeenCalledWith('C:\\pics\\Picked');
    });

    it('a refused existence check (null) is treated as not granted', async () => {
        const e = api({ exists: null, picked: null });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(e.openFolderDialog).toHaveBeenCalledWith(DIR);
        expect(c._removeRecentFolder).not.toHaveBeenCalled();
    });

    it('a cancelled re-confirm dialog opens nothing', async () => {
        api({ status: [false], picked: null });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(c.switchToFolder).not.toHaveBeenCalled();
    });

    // PR #81 review #6: main fails closed on EACCES/EPERM (path-grants canonicalize), so a granted folder that now
    // denies access is 'unreachable' too, with its drive mounted. The notice names both causes.
    it('an unreachable folder is kept, with a notice that covers a missing drive and a denied folder', async () => {
        const e = api({ status: ['unreachable'] });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.showNotification).toHaveBeenCalledWith(
            '"Liked_3" isn\'t reachable — its drive may be disconnected, or access denied',
            'warning'
        );
        expect(c._removeRecentFolder).not.toHaveBeenCalled();
        expect(e.checkFolderExists).not.toHaveBeenCalled();
        expect(e.openFolderDialog).not.toHaveBeenCalled();
    });

    it.each([
        ['a refused status query (null)', { status: null }, 'status undefined, exists undefined'],
        ['a status query that throws', { status: new Error('ipc') }, 'status undefined, exists undefined'],
        ['an existence check that throws', { exists: new Error('ipc') }, 'status true, exists undefined'],
    ])('%s is an error: logged, shown, entry kept', async (_label, answers, detail) => {
        const e = api(answers);
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(e.logError).toHaveBeenCalledWith({
            level: 'warn',
            message: `Recent folder check failed (${detail})`,
            source: 'renderer',
        });
        expect(c.showError).toHaveBeenCalledWith("Couldn't open that folder");
        expect(c._removeRecentFolder).not.toHaveBeenCalled();
        expect(c.loadFolder).not.toHaveBeenCalled();
    });

    it('a second click while one is resolving is ignored', async () => {
        const e = api();
        const c = openCtx();
        const first = openRecentFolder.call(c, DIR, 'drop');
        await openRecentFolder.call(c, 'C:\\pics\\Other', 'drop');
        await first;
        expect(e.getGrantStatus).toHaveBeenCalledTimes(1);
        expect(c.loadFolder).toHaveBeenCalledTimes(1);
        expect(c.loadFolder).toHaveBeenCalledWith(DIR);
    });

    it('refused during a file action, with the notice, before any IPC', async () => {
        const e = api();
        const c = openCtx({ _fileOpInFlight: true });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.showNotification).toHaveBeenCalledWith('Wait for the move to finish', 'info');
        expect(e.getGrantStatus).not.toHaveBeenCalled();
        expect(c._recentOpenInFlight).toBeNull();
    });

    it('refused while a folder is loading, with the notice, before any IPC (PR #81 review #1)', async () => {
        const e = api();
        const c = openCtx({ _folderLoadInFlight: true });
        await openRecentFolder.call(c, DIR, 'menu');
        expect(c.showNotification.mock.calls).toEqual([WAIT_LOAD]);
        expect(e.getGrantStatus).not.toHaveBeenCalled();
        expect(c.switchToFolder).not.toHaveBeenCalled();
        expect(c._recentOpenInFlight).toBeNull();
    });

    // PR #81 review #5: the in-flight state names the folder, so a re-render can keep its row marked.
    it('names the folder being checked while the check runs, and clears it after', async () => {
        const e = api();
        const c = openCtx();
        let during;
        e.getGrantStatus.mockImplementation(async () => {
            during = c._recentOpenInFlight;
            return [true];
        });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(during).toBe(DIR);
        expect(c._recentOpenInFlight).toBeNull();
    });

    // PR #81 review #3: a ✕ on the row while its check ran did not cancel it — 'open' loaded the folder and listed
    // it again at the top, 'regrant' opened a "Confirm …" dialog for a folder the user had just removed.
    it.each([
        ['open', { status: [true], exists: true }],
        ['regrant', { status: [false], picked: 'C:\\pics\\Picked' }],
        ['missing', { status: [true], exists: false }],
        ['unreachable', { status: ['unreachable'] }],
    ])('a ✕ on the row during the check drops its "%s" decision silently', async (_outcome, answers) => {
        const e = api(answers);
        const c = openCtx();
        e.getGrantStatus.mockImplementation(async () => {
            c.recentFolders = []; // the ✕: _removeRecentFolder, through _setRecentFolders
            return answers.status;
        });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(c.switchToFolder).not.toHaveBeenCalled();
        expect(e.openFolderDialog).not.toHaveBeenCalled();
        expect(c.showNotification).not.toHaveBeenCalled();
        expect(c.showError).not.toHaveBeenCalled();
        expect(c._removeRecentFolder).not.toHaveBeenCalled();
        expect(c._recentOpenInFlight).toBeNull();
        expect(c.renderRecentFolders).toHaveBeenCalled();
    });

    // Control for the block above: a ✕ on ANOTHER row leaves this row's decision in force.
    it('a ✕ on another row during the check still opens this one', async () => {
        const e = api();
        const c = openCtx({ recentFolders: [entry(DIR), entry('C:\\pics\\Other')] });
        e.getGrantStatus.mockImplementation(async () => {
            c.recentFolders = [entry(DIR)];
            return [true];
        });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.loadFolder).toHaveBeenCalledWith(DIR);
    });

    it('releases the flag and re-renders the list on every path — even when the open throws', async () => {
        api();
        const c = openCtx({ loadFolder: vi.fn(async () => Promise.reject(new Error('boom'))) });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.showError).toHaveBeenCalledWith('Failed to open folder: boom');
        expect(c._recentOpenInFlight).toBeNull();
        expect(c.renderRecentFolders).toHaveBeenCalled();
    });

    // G4 final review F1: the check can take seconds and the UI stays live, so the user can choose another
    // folder meanwhile (the dialog, change-folder, a load). That choice moves _folderIntentGen; the stale
    // decision must then do nothing.
    describe('a folder chosen while the check runs wins (G4 final review F1)', () => {
        it.each(['drop', 'menu'])('from the %s surface, a stale "open" opens nothing', async (surface) => {
            const e = api();
            const c = openCtx();
            e.getGrantStatus.mockImplementation(async () => {
                c._folderIntentGen += 1;
                return [true];
            });
            await openRecentFolder.call(c, DIR, surface);
            expect(c.loadFolder).not.toHaveBeenCalled();
            expect(c.switchToFolder).not.toHaveBeenCalled();
            expect(e.openFolderDialog).not.toHaveBeenCalled();
            expect(c.showNotification).not.toHaveBeenCalled();
            expect(c._recentOpenInFlight).toBeNull();
            expect(c.closeRecentFoldersMenu).toHaveBeenCalled();
            expect(c.renderRecentFolders).toHaveBeenCalled();
        });

        it('a stale "regrant" opens no dialog and shows no notice', async () => {
            const e = api({ status: [false], picked: 'C:\\pics\\Picked' });
            const c = openCtx();
            e.getGrantStatus.mockImplementation(async () => {
                c._folderIntentGen += 1;
                return [false];
            });
            await openRecentFolder.call(c, DIR, 'drop');
            expect(e.openFolderDialog).not.toHaveBeenCalled();
            expect(c.showNotification).not.toHaveBeenCalled();
            expect(c.loadFolder).not.toHaveBeenCalled();
            expect(c._recentOpenInFlight).toBeNull();
        });

        // Guard — passes before the fix by construction (the old code ignored the generation): it pins that the
        // fix abandons only 'open' and 'regrant'. A missing folder is still gone, whatever the user chose since.
        it('a stale "missing" still removes the entry, with its notice', async () => {
            const e = api();
            const c = openCtx();
            e.checkFolderExists.mockImplementation(async () => {
                c._folderIntentGen += 1;
                return false;
            });
            await openRecentFolder.call(c, DIR, 'drop');
            expect(c._removeRecentFolder).toHaveBeenCalledWith(DIR);
            expect(c.showNotification).toHaveBeenCalledWith(
                '"Liked_3" no longer exists — removed from recent folders',
                'warning'
            );
        });
    });

    it('a file action started during the status query refuses the re-confirm dialog, with the notice', async () => {
        const e = api({ picked: 'C:\\pics\\Picked' });
        const c = openCtx();
        e.getGrantStatus.mockImplementation(async () => {
            c._fileOpInFlight = true;
            return [false];
        });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(e.openFolderDialog).not.toHaveBeenCalled();
        // Refused before the "Confirm …" notice too: a prompt to press Select Folder for a dialog that never opens
        // would contradict the refusal beside it.
        expect(c.showNotification.mock.calls).toEqual([['Wait for the move to finish', 'info']]);
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(c._recentOpenInFlight).toBeNull();
        expect(c.renderRecentFolders).toHaveBeenCalled();
    });
});
