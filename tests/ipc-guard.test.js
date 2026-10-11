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

    it('validates trackedTempDir and grantedOrTempMediaRead against the registry', async () => {
        const { guard, ipcMain, tempDirs } = makeGuard();
        const dir = join(tmpdir(), 'mv-keyframes-1');
        tempDirs.add(dir);
        guard.handle('rm', [guard.kinds.trackedTempDir], async () => 'ok');
        guard.handle('clip', [guard.arrayOf(guard.kinds.grantedOrTempMediaRead, 3)], async () => 'ok');
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
    // Since deep review #2 the result is the decoded path that identifies the document.
    it('strips query and hash, folds ASCII case on win32 only, rejects non-file URLs', () => {
        expect(normalizeFileUrl('file:///C:/a/index.html?x#y', 'linux')).toBe('/C:/a/index.html');
        expect(normalizeFileUrl('file:///C:/a/Index.html', 'win32')).toBe('/c:/a/index.html');
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

// Review M-a: entry operations (a move renames the link itself, an existence check) are
// authorized by the entry's folder; content reads follow a link out of a granted folder only to a
// media file, so a planted link to a key file or a document is still refused.
describe('entry and linked-media kinds (review M-a)', () => {
    const LINK = join(GRANTED, 'pic.png');
    const MEDIA_TARGET = join(tmpdir(), 'elsewhere', 'real.png');
    const SECRET_TARGET = join(tmpdir(), 'elsewhere', 'id_rsa');
    const isMediaFile = (ext) => ['.png', '.jpg', '.mp4', '.jxl'].includes(ext);

    function guardWith(target, { media = isMediaFile } = {}) {
        const grants = {
            resolveAllowed: vi.fn(async () => null), // the link's target is outside every grant
            resolveEntry: vi.fn(async (x) => (x === LINK ? x : null)), // the entry itself is inside
            canonicalize: vi.fn(async () => target),
        };
        return makeGuard({ grants, isMediaFile: media });
    }

    async function verdict(guard, ipcMain, kind, arg) {
        guard.handle('ch', [kind], async () => 'ok');
        return ipcMain.handlers.get('ch')(trusted(), arg);
    }

    it('grantedEntry accepts a link entry in a granted folder, where grantedPath refuses it', async () => {
        const a = guardWith(MEDIA_TARGET);
        expect(await verdict(a.guard, a.ipcMain, a.guard.kinds.grantedEntry, LINK)).toBe('ok');
        const b = guardWith(MEDIA_TARGET);
        expect(await verdict(b.guard, b.ipcMain, b.guard.kinds.grantedPath, LINK)).toEqual(DEFAULT_REJECT);
    });

    it('grantedEntry refuses an entry whose folder is not granted', async () => {
        const { guard, ipcMain } = guardWith(MEDIA_TARGET);
        const outside = join(tmpdir(), 'x', 'pic.png');
        expect(await verdict(guard, ipcMain, guard.kinds.grantedEntry, outside)).toEqual(DEFAULT_REJECT);
    });

    it('grantedMediaRead follows a link out of a granted folder to a media file', async () => {
        const { guard, ipcMain } = guardWith(MEDIA_TARGET);
        expect(await verdict(guard, ipcMain, guard.kinds.grantedMediaRead, LINK)).toBe('ok');
    });

    it('grantedMediaRead refuses a link whose real target is not a media file', async () => {
        const { guard, ipcMain } = guardWith(SECRET_TARGET);
        expect(await verdict(guard, ipcMain, guard.kinds.grantedMediaRead, LINK)).toEqual(DEFAULT_REJECT);
    });

    it('grantedMediaRead refuses an entry whose folder is not granted, whatever it links to', async () => {
        const { guard, ipcMain } = guardWith(MEDIA_TARGET);
        const outside = join(tmpdir(), 'x', 'pic.png');
        expect(await verdict(guard, ipcMain, guard.kinds.grantedMediaRead, outside)).toEqual(DEFAULT_REJECT);
    });

    it('grantedMediaRead stays strict when the guard has no isMediaFile', async () => {
        const { guard, ipcMain } = guardWith(MEDIA_TARGET, { media: null }); // null: an undefined would take the default;
        expect(await verdict(guard, ipcMain, guard.kinds.grantedMediaRead, LINK)).toEqual(DEFAULT_REJECT);
    });

    it('grantedOrTempMediaRead accepts a tracked temp file and a linked media file', async () => {
        const { guard, ipcMain, tempDirs } = guardWith(MEDIA_TARGET);
        const tmpDir = join(tmpdir(), 'mv-keyframes-x');
        tempDirs.add(tmpDir);
        guard.handle('batch', [guard.kinds.grantedOrTempMediaRead], async () => 'ok');
        const h = ipcMain.handlers.get('batch');
        expect(await h(trusted(), join(tmpDir, 'frame-001.png'))).toBe('ok');
        expect(await h(trusted(), LINK)).toBe('ok');
    });
});

// Commit security review (2026-10-11): the direct-child check folded with JS toLowerCase(), which
// equates names NTFS keeps distinct (U+212A KELVIN SIGN vs 'k'), so a file in a look-alike sibling
// passed as a child of the folder being applied.
describe('tierAssignmentsKind and Unicode look-alikes (commit security review)', () => {
    const { tierAssignmentsKind } = require('../ipc-guard.js');

    it('refuses a key in a look-alike sibling of the folder', () => {
        const kind = tierAssignmentsKind({ isMediaFile: () => true, platform: process.platform });
        const folder = join(tmpdir(), 'keys');
        const lookAlike = join(tmpdir(), '\u212Aeys', 'a.png');
        expect(kind({ [join(folder, 'a.png')]: 1 }, [folder])).toBe(true); // control
        expect(kind({ [lookAlike]: 1 }, [folder])).toBe(false);
    });
});

// Deep review #2: Chromium's frame URL keeps ~ [ ] % raw where Node's pathToFileURL escapes them
// (measured: MEDIA_~1 vs MEDIA_%7E1), so from an app path containing one every guarded IPC was
// refused as an untrusted sender. Both sides are now compared as decoded paths.
describe('normalizeFileUrl compares decoded paths (deep review #2)', () => {
    it.each([
        ['an 8.3 alias (~)', 'file:///C:/Users/a/MEDIA_~1/index.html', 'file:///C:/Users/a/MEDIA_%7E1/index.html'],
        [
            'brackets',
            'file:///D:/Tools%20[portable]/app/index.html',
            'file:///D:/Tools%20%5Bportable%5D/app/index.html',
        ],
        ['a percent sign', 'file:///C:/100%/app/index.html', 'file:///C:/100%25/app/index.html'],
    ])('treats Chromium and Node spellings with %s as one document', (_label, chromium, node) => {
        expect(normalizeFileUrl(chromium, 'win32')).not.toBeNull();
        expect(normalizeFileUrl(chromium, 'win32')).toBe(normalizeFileUrl(node, 'win32'));
    });

    it('trusts a sender whose frame URL is the raw spelling of an escaped expected URL', async () => {
        const { guard, ipcMain } = makeGuard({ expectedUrl: 'file:///C:/Users/a/MEDIA_%7E1/index.html' });
        guard.handle('ch', [], async () => 'ok');
        const frame = { senderFrame: { url: 'file:///C:/Users/a/MEDIA_~1/index.html', parent: null } };
        expect(await ipcMain.handlers.get('ch')(frame)).toBe('ok');
    });

    it('still folds only ASCII case: a Unicode look-alike path is a different document', () => {
        const k = String.fromCharCode(0x212a);
        const lookAlike = 'file:///C:/apps/' + encodeURIComponent(k) + 'eys/index.html';
        expect(normalizeFileUrl(lookAlike, 'win32')).not.toBe(
            normalizeFileUrl('file:///C:/apps/keys/index.html', 'win32')
        );
        expect(normalizeFileUrl('file:///c:/APPS/keys/index.html', 'win32')).toBe(
            normalizeFileUrl('file:///C:/apps/keys/index.html', 'win32')
        );
    });
});

// Deep review #9 and #8: entry operations are authorized by the entry's own folder only, and a
// move may only carry a media file under a media file name, so a cache file of chosen text can
// no longer be renamed to an arbitrary name (desktop.ini, run.bat, x.url) under a grant.
describe('move kinds (deep review #8, #9)', () => {
    const IN = join(GRANTED, 'a.png');
    const isMediaFile = (ext) => ['.png', '.jpg', '.mp4', '.jxl'].includes(ext);

    function guardWith({ entryInside = true, targetInside = true, media = isMediaFile } = {}) {
        const grants = {
            resolveAllowed: vi.fn(async (x) => (targetInside ? x : null)),
            resolveEntry: vi.fn(async (x) => (entryInside ? x : null)),
            canonicalize: vi.fn(async (x) => x),
        };
        return makeGuard({ grants, isMediaFile: media });
    }

    async function verdict(g, kind, arg) {
        g.guard.handle('ch', [kind], async () => 'ok');
        return g.ipcMain.handlers.get('ch')(trusted(), arg);
    }

    it('grantedEntry refuses an entry outside every grant even when it resolves into one', async () => {
        const g = guardWith({ entryInside: false, targetInside: true });
        expect(await verdict(g, g.guard.kinds.grantedEntry, join(tmpdir(), 'x', 'link.png'))).toEqual(DEFAULT_REJECT);
    });

    it('mediaEntry accepts a media file entry in a granted folder', async () => {
        const g = guardWith();
        expect(await verdict(g, g.guard.kinds.mediaEntry, IN)).toBe('ok');
    });

    it.each(['.hash_cache.json', '.sort_cache.json', 'notes.txt'])(
        'mediaEntry refuses the non-media source %s',
        async (name) => {
            const g = guardWith();
            expect(await verdict(g, g.guard.kinds.mediaEntry, join(GRANTED, name))).toEqual(DEFAULT_REJECT);
        }
    );

    it('mediaBasename accepts a media file name', async () => {
        const g = guardWith();
        expect(await verdict(g, g.guard.kinds.mediaBasename, 'IMG_0001 (1).jpg')).toBe('ok');
    });

    it.each(['desktop.ini', 'run.bat', 'x.url', 'a.png.lnk', 'a.png/x', ''])(
        'mediaBasename refuses %j',
        async (name) => {
            const g = guardWith();
            expect(await verdict(g, g.guard.kinds.mediaBasename, name)).toEqual(DEFAULT_REJECT);
        }
    );

    it('both media kinds refuse everything when the guard has no isMediaFile', async () => {
        const g = guardWith({ media: null });
        expect(await verdict(g, g.guard.kinds.mediaEntry, IN)).toEqual(DEFAULT_REJECT);
        const h = guardWith({ media: null });
        expect(await verdict(h, h.guard.kinds.mediaBasename, 'a.png')).toEqual(DEFAULT_REJECT);
    });
});

// Deep review #5: the _Tier-N link check folded the WHOLE realpath, so in a case-sensitive tree a
// junction into a sibling differing only by case passed. Only the tier folder's own name may differ
// (by ASCII case); its parent must be exactly the real folder.
describe('tierDirMatches (deep review #5)', () => {
    const { tierDirMatches } = require('../ipc-guard.js');
    const root = join(tmpdir(), 'Photos');

    it('accepts the tier folder directly inside the real folder, in any ASCII case', () => {
        expect(tierDirMatches(join(root, '_Tier-1'), root, '_Tier-1')).toBe(true);
        expect(tierDirMatches(join(root, '_tier-1'), root, '_Tier-1')).toBe(true);
    });

    it('refuses a parent that differs only by case (a sibling in a case-sensitive tree)', () => {
        expect(tierDirMatches(join(tmpdir(), 'photos', '_Tier-1'), root, '_Tier-1')).toBe(false);
    });

    it('refuses a Unicode look-alike name, another tier, and a deeper path', () => {
        const k = String.fromCharCode(0x212a);
        expect(tierDirMatches(join(root, '_Tier-1' + k), root, '_Tier-1')).toBe(false);
        expect(tierDirMatches(join(root, '_Tier-2'), root, '_Tier-1')).toBe(false);
        expect(tierDirMatches(join(root, 'x', '_Tier-1'), root, '_Tier-1')).toBe(false);
    });
});
