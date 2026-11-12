// v2 P1a: the module channels (main/module-ipc.js), registered through the real IPC guard on a fake ipcMain. The
// refusals are the contract: a folder-file read the guard refuses is "unreadable", never "absent" (Review Focus 1),
// and an owner that is not active, or a name it did not declare, is refused before the service runs.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const { createIpcGuard } = require('../ipc-guard.js');
const { createTempDirRegistry } = require('../path-grants.js');
const { registerModuleIpc } = require('../main/module-ipc.js');

const APP_URL = 'app://media-viewer/index.html';
const GRANTED = join(tmpdir(), 'granted');
const NAME = '.mod_state.json';
const trusted = { senderFrame: { url: APP_URL, parent: null } };
const foreign = { senderFrame: { url: 'app://media-viewer/other.html', parent: null } };

function setup() {
    const handlers = new Map();
    const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn), on: vi.fn() };
    const grants = {
        resolveAllowed: async (p) => (typeof p === 'string' && p === GRANTED ? p : null),
        resolveEntry: async () => null,
        canonicalize: async (p) => p,
    };
    const guard = createIpcGuard({
        ipcMain,
        grants,
        tempDirs: createTempDirRegistry(),
        expectedUrl: APP_URL,
        logger: { warn: vi.fn() },
    });
    const registry = {
        list: vi.fn(() => ({ apiVersions: [1], order: [], restartNeeded: false, modules: [] })),
        setEnabled: vi.fn(async () => ({ apiVersions: [1], order: [], restartNeeded: true, modules: [] })),
        isActive: (id) => id === 'mod',
        folderFileDecl: (owner, name) => (owner === 'mod' && name === NAME ? { kind: 'data', maxBytes: 64 } : null),
    };
    const folderFiles = {
        read: vi.fn(async () => ({ status: 'absent' })),
        write: vi.fn(async () => ({ success: true })),
        remove: vi.fn(async () => ({ success: true })),
    };
    registerModuleIpc({ guard, registry, folderFiles });
    const call = (channel, event, ...args) => handlers.get(channel)(event, ...args);
    return { handlers, registry, folderFiles, call };
}

describe('registerModuleIpc', () => {
    it('registers the five channels', () => {
        expect([...setup().handlers.keys()].sort()).toEqual([
            'folder-file-delete',
            'folder-file-read',
            'folder-file-write',
            'list-modules',
            'set-module-enabled',
        ]);
    });

    it("list-modules answers the registry's list, and null to a foreign page", async () => {
        const { call } = setup();
        expect(await call('list-modules', trusted)).toMatchObject({ apiVersions: [1] });
        expect(await call('list-modules', foreign)).toBeNull();
    });

    it('set-module-enabled takes an id and a boolean only', async () => {
        const { call, registry } = setup();
        expect(await call('set-module-enabled', trusted, 'mod', true)).toMatchObject({ restartNeeded: true });
        expect(registry.setEnabled).toHaveBeenCalledWith('mod', true);
        expect(await call('set-module-enabled', trusted, 'mod', 'yes')).toEqual({
            success: false,
            error: 'Not permitted',
        });
        expect(await call('set-module-enabled', trusted, 7, false)).toEqual({ success: false, error: 'Not permitted' });
        expect(registry.setEnabled).toHaveBeenCalledTimes(1);
    });

    it('folder-file-read passes an active owner and its declared name in a granted folder to the service', async () => {
        const { call, folderFiles } = setup();
        expect(await call('folder-file-read', trusted, 'mod', GRANTED, NAME)).toEqual({ status: 'absent' });
        expect(folderFiles.read).toHaveBeenCalledWith('mod', GRANTED, NAME);
    });

    it.each([
        ['an inactive owner', 'other', GRANTED, NAME],
        ['owner core', 'core', GRANTED, '.bulk_rated.json'],
        ['an undeclared name', 'mod', GRANTED, '.other.json'],
        ['a path as the name', 'mod', GRANTED, `sub/${NAME}`],
        ['an ungranted folder', 'mod', join(tmpdir(), 'elsewhere'), NAME],
    ])('folder-file-read refuses %s as unreadable, never absent', async (_label, owner, folder, name) => {
        const { call, folderFiles } = setup();
        expect(await call('folder-file-read', trusted, owner, folder, name)).toEqual({
            status: 'unreadable',
            reason: 'Not permitted',
        });
        expect(folderFiles.read).not.toHaveBeenCalled();
    });

    it('folder-file-write and -delete run for a declared name and refuse an undeclared one', async () => {
        const { call, folderFiles } = setup();
        expect(await call('folder-file-write', trusted, 'mod', GRANTED, NAME, { n: 1 })).toEqual({ success: true });
        expect(folderFiles.write).toHaveBeenCalledWith('mod', GRANTED, NAME, { n: 1 });
        expect(await call('folder-file-delete', trusted, 'mod', GRANTED, NAME)).toEqual({ success: true });
        expect(folderFiles.remove).toHaveBeenCalledWith('mod', GRANTED, NAME);
        const refused = { success: false, error: 'Not permitted' };
        expect(await call('folder-file-write', trusted, 'mod', GRANTED, '.other.json', {})).toEqual(refused);
        expect(await call('folder-file-delete', trusted, 'other', GRANTED, NAME)).toEqual(refused);
        expect(folderFiles.write).toHaveBeenCalledTimes(1);
        expect(folderFiles.remove).toHaveBeenCalledTimes(1);
    });
});
