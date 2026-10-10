import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const { createIpcGuard, normalizeFileUrl, isPlainBasename, DEFAULT_REJECT } = require('../ipc-guard.js');
const { createTempDirRegistry } = require('../path-grants.js');

const APP_URL = 'file:///C:/app/index.html';
const GRANTED = join(tmpdir(), 'granted');

function makeIpcMain() {
    return {
        handlers: new Map(),
        listeners: new Map(),
        handle(channel, fn) {
            this.handlers.set(channel, fn);
        },
        on(channel, fn) {
            this.listeners.set(channel, fn);
        },
    };
}

function makeGuard(overrides = {}) {
    const ipcMain = makeIpcMain();
    const logger = { warn: vi.fn() };
    const tempDirs = createTempDirRegistry();
    const grants = {
        resolveAllowed: vi.fn(async (p) =>
            typeof p === 'string' && (p === GRANTED || p.startsWith(GRANTED + require('path').sep)) ? p : null
        ),
    };
    const guard = createIpcGuard({ ipcMain, grants, tempDirs, expectedUrl: APP_URL, logger, ...overrides });
    return { guard, ipcMain, logger, tempDirs, grants };
}

const trusted = (url = APP_URL) => ({ senderFrame: { url, parent: null } });

describe('createIpcGuard sender check', () => {
    it('runs the handler for the app index.html top frame', async () => {
        const { guard, ipcMain } = makeGuard();
        const fn = vi.fn(async () => 'ok');
        guard.handle('ch', [], fn);
        expect(await ipcMain.handlers.get('ch')(trusted())).toBe('ok');
    });

    it('ignores query and fragment on the sender URL', async () => {
        const { guard, ipcMain } = makeGuard();
        guard.handle('ch', [], async () => 'ok');
        expect(await ipcMain.handlers.get('ch')(trusted(APP_URL + '?x=1#y'))).toBe('ok');
    });

    it.each([
        ['another file', { senderFrame: { url: 'file:///C:/app/other.html', parent: null } }],
        ['a sub-frame', { senderFrame: { url: APP_URL, parent: {} } }],
        ['a null frame', { senderFrame: null }],
        ['a remote page', { senderFrame: { url: 'https://example.com/', parent: null } }],
    ])('refuses %s with the default reject value and logs it', async (_label, event) => {
        const { guard, ipcMain, logger } = makeGuard();
        const fn = vi.fn();
        guard.handle('ch', [], fn);
        expect(await ipcMain.handlers.get('ch')(event)).toEqual(DEFAULT_REJECT);
        expect(fn).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith('ipc-guard', expect.stringContaining('Refused ch'));
    });

    it('compares the drive letter case-insensitively on win32', async () => {
        const { guard, ipcMain } = makeGuard({ platform: 'win32' });
        guard.handle('ch', [], async () => 'ok');
        expect(await ipcMain.handlers.get('ch')(trusted('file:///c:/app/index.html'))).toBe('ok');
    });

    it('drops an on() message from an untrusted sender', () => {
        const { guard, ipcMain } = makeGuard();
        const fn = vi.fn();
        guard.on('evt', fn);
        ipcMain.listeners.get('evt')({ senderFrame: null }, 'x');
        expect(fn).not.toHaveBeenCalled();
        ipcMain.listeners.get('evt')(trusted(), 'x');
        expect(fn).toHaveBeenCalledWith(trusted(), 'x');
    });
});

describe('createIpcGuard argument kinds', () => {
    it('passes the ORIGINAL argument string to the handler', async () => {
        const { guard, ipcMain, grants } = makeGuard();
        grants.resolveAllowed.mockImplementation(async () => 'C:\\CANONICAL\\different');
        const fn = vi.fn(async (_e, p) => p);
        guard.handle('ch', [guard.kinds.grantedPath], fn);
        const original = join(GRANTED, 'a.jpg');
        expect(await ipcMain.handlers.get('ch')(trusted(), original)).toBe(original);
    });

    it('refuses a path outside every grant, and a relative one', async () => {
        const { guard, ipcMain } = makeGuard();
        guard.handle('ch', [guard.kinds.grantedPath], async () => 'ok');
        const h = ipcMain.handlers.get('ch');
        expect(await h(trusted(), join(tmpdir(), 'elsewhere', 'a.jpg'))).toEqual(DEFAULT_REJECT);
        expect(await h(trusted(), 'relative/a.jpg')).toEqual(DEFAULT_REJECT);
        expect(await h(trusted(), 42)).toEqual(DEFAULT_REJECT);
    });

    it('refuses more arguments than the channel declares', async () => {
        const { guard, ipcMain } = makeGuard();
        guard.handle('ch', [guard.kinds.string], async () => 'ok');
        expect(await ipcMain.handlers.get('ch')(trusted(), 'a', 'b')).toEqual(DEFAULT_REJECT);
    });

    it('returns a per-channel reject value (value or factory)', async () => {
        const { guard, ipcMain } = makeGuard();
        guard.handle('a', [guard.kinds.grantedPath], async () => true, { rejectValue: false });
        guard.handle('b', [guard.kinds.grantedPath], async () => 'x', { rejectValue: null });
        guard.handle('c', [guard.kinds.grantedPath], async () => 'x', { rejectValue: () => ({ entries: [] }) });
        expect(await ipcMain.handlers.get('a')(trusted(), 'rel')).toBe(false);
        expect(await ipcMain.handlers.get('b')(trusted(), 'rel')).toBeNull();
        expect(await ipcMain.handlers.get('c')(trusted(), 'rel')).toEqual({ entries: [] });
    });

    it('validates trackedTempDir and grantedOrTempPath against the registry', async () => {
        const { guard, ipcMain, tempDirs } = makeGuard();
        const dir = join(tmpdir(), 'mv-keyframes-1');
        tempDirs.add(dir);
        guard.handle('rm', [guard.kinds.trackedTempDir], async () => 'ok');
        guard.handle('clip', [guard.arrayOf(guard.kinds.grantedOrTempPath, 3)], async () => 'ok');
        expect(await ipcMain.handlers.get('rm')(trusted(), dir)).toBe('ok');
        expect(await ipcMain.handlers.get('rm')(trusted(), join(tmpdir(), 'mv-keyframes-2'))).toEqual(DEFAULT_REJECT);
        expect(await ipcMain.handlers.get('clip')(trusted(), [join(dir, 'f.png'), join(GRANTED, 'a.jpg')])).toBe('ok');
        expect(await ipcMain.handlers.get('clip')(trusted(), [join(dir, 'sub', 'f.png')])).toEqual(DEFAULT_REJECT);
        expect(
            await ipcMain.handlers.get('clip')(
                trusted(),
                ['a', 'b', 'c', 'd'].map((n) => join(dir, n))
            )
        ).toEqual(DEFAULT_REJECT);
    });

    it('int, optional, oneOf, shape and binary behave as declared', async () => {
        const { guard } = makeGuard();
        const i = guard.int(1, 100);
        expect([i(1), i(100), i(0), i(101), i(1.5), i('5')]).toEqual([true, true, false, false, false, false]);
        const o = guard.optional(i);
        expect([o(undefined), o(null), o(5), o(0)]).toEqual([true, true, true, false]);
        const one = guard.oneOf('hash', 'sort');
        expect([one('hash'), one('feature'), one(undefined)]).toEqual([true, false, false]);
        const s = guard.shape({ a: guard.kinds.string, b: guard.kinds.basename });
        expect(await s({ a: 'x', b: 'y.jpg' })).toBe(true);
        expect(await s({ a: 'x', b: '../y.jpg' })).toBe(false);
        expect(await s(null)).toBe(false);
        expect(await s(['x'])).toBe(false);
        expect(guard.kinds.binary(new ArrayBuffer(4))).toBe(true);
        expect(guard.kinds.binary(new Uint8Array(4))).toBe(true);
        expect(guard.kinds.binary('bytes')).toBe(false);
    });
});

describe('isPlainBasename', () => {
    it.each([
        ['a.jpg', 'linux', true],
        ['a b (1).jpg', 'win32', true],
        ['', 'linux', false],
        ['.', 'linux', false],
        ['..', 'linux', false],
        ['a/b.jpg', 'linux', false],
        ['a\\b.jpg', 'linux', false],
        ['a\0b', 'linux', false],
        ['a.jpg:stream', 'win32', false],
        ['a.jpg:stream', 'linux', true],
        ['x'.repeat(256), 'linux', false],
    ])('%j on %s → %s', (name, platform, expected) => {
        expect(isPlainBasename(name, platform)).toBe(expected);
    });
});

describe('normalizeFileUrl', () => {
    it('strips query and hash, folds case on win32 only, rejects non-file URLs', () => {
        expect(normalizeFileUrl('file:///C:/a/index.html?x#y', 'linux')).toBe('file:///C:/a/index.html');
        expect(normalizeFileUrl('file:///C:/a/Index.html', 'win32')).toBe('file:///c:/a/index.html');
        expect(normalizeFileUrl('https://x/index.html', 'linux')).toBeNull();
        expect(normalizeFileUrl('not a url', 'linux')).toBeNull();
    });
});

describe('tierAssignmentsKind', () => {
    const { tierAssignmentsKind } = require('../ipc-guard.js');
    const { isMediaFile } = require('../media-formats.js');
    const folder = join(tmpdir(), 'media');
    const kind = tierAssignmentsKind({ isMediaFile });
    const check = (assignments, f = folder) => kind(assignments, [f, assignments]);

    it('accepts integer tiers for media files directly in the folder', () => {
        expect(check({ [join(folder, 'a.jpg')]: 0, [join(folder, 'b.png')]: 3 })).toBe(true);
        expect(check({})).toBe(true);
    });

    it.each([
        ['a string tier', { [join(folder, 'a.jpg')]: 'x' }],
        ['a fractional tier', { [join(folder, 'a.jpg')]: 1.5 }],
        ['a negative tier', { [join(folder, 'a.jpg')]: -1 }],
        ['a tier above the cap', { [join(folder, 'a.jpg')]: 101 }],
        ['a file in a subfolder', { [join(folder, 'sub', 'a.jpg')]: 1 }],
        ['a file in a sibling folder', { [join(tmpdir(), 'other', 'a.jpg')]: 1 }],
        ['a .. key', { [join(folder, '..', 'a.jpg')]: 1 }],
        ['a relative key', { 'a.jpg': 1 }],
        ['a non-media file', { [join(folder, 'notes.txt')]: 1 }],
    ])('refuses %s', (_label, assignments) => {
        expect(check(assignments)).toBe(false);
    });

    it('refuses non-object payloads and a relative folder', () => {
        expect(check(null)).toBe(false);
        expect(check([])).toBe(false);
        expect(check('x')).toBe(false);
        expect(check({ [join(folder, 'a.jpg')]: 1 }, 'relative')).toBe(false);
    });
});

describe('tierAssignmentsKind dot segments (final review I3)', () => {
    const { tierAssignmentsKind } = require('../ipc-guard.js');
    const { isMediaFile } = require('../media-formats.js');
    const sep = require('path').sep;
    const folder = join(tmpdir(), 'media');
    const kind = tierAssignmentsKind({ isMediaFile });

    it('refuses a key with a raw .. segment even when it resolves to a direct child', () => {
        const key = folder + sep + 'sub' + sep + '..' + sep + 'a.jpg';
        expect(kind({ [key]: 1 }, [folder])).toBe(false);
        expect(kind({ [folder + sep + 'a.jpg']: 1 }, [folder])).toBe(true); // control
    });
});

describe('sender identity (final review I1)', () => {
    it('on() accepts a per-channel sender check in place of the URL check', () => {
        const { guard, ipcMain } = makeGuard();
        const win = {};
        const fn = vi.fn();
        guard.on('close-ok', fn, { isTrusted: (event) => event.sender === win });
        // A frame URL the default check would refuse, from the app's own window: accepted.
        ipcMain.listeners.get('close-ok')({
            sender: win,
            senderFrame: { url: 'file:///elsewhere.html', parent: null },
        });
        expect(fn).toHaveBeenCalledTimes(1);
        // Another sender: refused.
        ipcMain.listeners.get('close-ok')({ sender: {}, senderFrame: { url: APP_URL, parent: null } });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    // Source-text wiring check (main.js needs Electron, so it is not unit-loadable). loadFile()
    // with a relative name resolves against app.getAppPath(), which keeps a link in the launch
    // path, while __dirname is the resolved real path — so the window's URL and the URL the guard
    // expected differed whenever the app was launched through a link, and every call was refused.
    it('main.js loads the window from, and authorizes, the same INDEX_HTML constant', () => {
        const fs = require('fs');
        const src = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
        expect(src).toContain("const INDEX_HTML = path.join(__dirname, 'index.html');");
        expect(src).toContain('mainWindow.loadFile(INDEX_HTML)');
        expect(src).toContain('expectedUrl: pathToFileURL(INDEX_HTML).href');
        expect(src).not.toContain("loadFile('index.html')");
    });
});
