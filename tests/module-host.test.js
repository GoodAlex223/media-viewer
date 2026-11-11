// v2 P1a: the module host (core/module-host.js), spec §§ 6.3, 6.5 step 3, 7.1–7.3, 7.9, 7.13. It imports each enabled
// module in dependency order and calls activate(host) under one 5 s race, keeps a failure to that module, and runs
// folder visits: a store call is checked for liveness at the call (plan C9), so a save asked for in onVisitEnd reaches
// the old folder and a later one is refused with no IPC (Review Focus 2). A failed read is never "absent" (Focus 1).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModuleHost, ACTIVATION_TIMEOUT_MS } from '../core/module-host.js';

function row(id, extra = {}) {
    return {
        id,
        name: id,
        version: '1.2.3',
        description: '',
        root: 'e2e',
        entryPath: `modules/${id}/ui/index.js`,
        status: 'enabled',
        reason: null,
        enabledAtLaunch: true,
        enabledNext: true,
        defaultEnabled: false,
        requires: [],
        optional: [],
        folderFiles: [],
        ...extra,
    };
}

const listOf = (rows, order = rows.filter((r) => r.status !== 'invalid').map((r) => r.id)) => ({
    apiVersions: [1],
    order,
    restartNeeded: false,
    modules: rows,
});

function fakeApi(list) {
    return {
        listModules: vi.fn(async () => list),
        folderFileRead: vi.fn(async () => ({ status: 'ok', value: { n: 1 }, recovered: false })),
        folderFileWrite: vi.fn(async () => ({ success: true })),
        folderFileDelete: vi.fn(async () => ({ success: true })),
        logError: vi.fn(),
        logPerf: vi.fn(),
    };
}

function memStorage() {
    const map = new Map();
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
    };
}

const FILES = [
    { name: 'a.jpg', path: 'C:\\f\\a.jpg', size: 10, mtimeMs: 1000, type: 'image/jpeg', extra: 'not copied' },
    { name: 'b.mp4', path: 'C:\\f\\b.mp4', size: 20, mtimeMs: 2000, type: 'video/mp4' },
];

// A host over `rows`, whose modules are `modules[id]` (an object with activate, or a function returning one).
function makeHost(rows, modules, { files = FILES, storage = memStorage(), notify = vi.fn(), order } = {}) {
    const api = fakeApi(listOf(rows, order));
    const imported = [];
    const getFiles = vi.fn(() => files);
    const importModule = vi.fn(async (entryPath) => {
        const id = entryPath.split('/')[1];
        imported.push(id);
        const m = modules[id];
        return typeof m === 'function' ? m() : m;
    });
    const host = new ModuleHost({ api, notify, getFiles, importModule, storage });
    return { host, api, imported, getFiles, importModule, storage, notify };
}

// A module that records its host and returns `result`.
function capturing(result = {}) {
    const mod = { host: null };
    mod.activate = (h) => {
        mod.host = h;
        return result;
    };
    return mod;
}

describe('activation', () => {
    it('imports and activates the enabled modules in list order', async () => {
        const calls = [];
        const mk = (id) => ({ activate: () => calls.push(id) && {} });
        const { host, imported } = makeHost(
            [row('a'), row('b'), row('c')],
            { a: mk('a'), b: mk('b'), c: mk('c') },
            {
                order: ['c', 'a', 'b'],
            }
        );
        await host.start();
        expect(imported).toEqual(['c', 'a', 'b']);
        expect(calls).toEqual(['c', 'a', 'b']);
        expect(['a', 'b', 'c'].map((id) => host.outcome(id))).toEqual([
            { state: 'active', reason: null },
            { state: 'active', reason: null },
            { state: 'active', reason: null },
        ]);
    });

    it('does not import a module that is not enabled', async () => {
        const rows = [row('on'), row('off', { status: 'off' }), row('bl', { status: 'blocked', reason: 'x' })];
        const { host, imported } = makeHost(rows, { on: capturing(), off: capturing(), bl: capturing() });
        await host.start();
        expect(imported).toEqual(['on']);
        expect(host.outcome('off')).toBeNull();
    });

    it('records a module that throws as failed, and logs it with its id as the source', async () => {
        const boom = {
            activate: () => {
                throw new Error('x: planted activation failure');
            },
        };
        const { host, api } = makeHost([row('x'), row('y')], { x: boom, y: capturing() });
        await host.start();
        expect(host.outcome('x')).toEqual({ state: 'failed', reason: 'x: planted activation failure' });
        expect(host.outcome('y').state).toBe('active');
        expect(api.logError).toHaveBeenCalledWith(
            expect.objectContaining({ level: 'error', source: 'module:x', message: expect.stringContaining('planted') })
        );
    });

    it('records an entry with no activate function, or an import that fails, as failed', async () => {
        const { host } = makeHost([row('a'), row('b')], {
            a: { notActivate: true },
            b: () => {
                throw new Error('import failed');
            },
        });
        await host.start();
        expect(host.outcome('a').state).toBe('failed');
        expect(host.outcome('b')).toEqual({ state: 'failed', reason: 'import failed' });
    });

    it('blocks a module whose required module failed to start', async () => {
        const boom = {
            activate: () => {
                throw new Error('no');
            },
        };
        const { host, imported } = makeHost([row('a'), row('b', { requires: ['a'] }), row('c', { optional: ['a'] })], {
            a: boom,
            b: capturing(),
            c: capturing(),
        });
        await host.start();
        expect(host.outcome('b')).toEqual({ state: 'blocked', reason: 'disabled because a failed to start' });
        expect(imported).toEqual(['a', 'c']);
        expect(host.outcome('c').state).toBe('active'); // an optional dependency only orders
    });

    it('fills testApis for active modules only', async () => {
        const boom = {
            activate: () => {
                throw new Error('no');
            },
        };
        const { host } = makeHost([row('a'), row('b')], { a: capturing({ testApi: { ok: 1 } }), b: boom });
        await host.start();
        expect(host.testApis).toEqual({ a: { ok: 1 } });
    });

    it('is idempotent: a second start activates nothing again', async () => {
        const { host, imported } = makeHost([row('a')], { a: capturing() });
        await Promise.all([host.start(), host.start()]);
        await host.start();
        expect(imported).toEqual(['a']);
    });

    it.each([
        ['rejects', () => Promise.reject(new Error('ipc down'))],
        ['answers null', () => Promise.resolve(null)],
        ['answers a malformed list', () => Promise.resolve({ modules: 'x' })],
    ])('starts with no modules when listModules %s, and ready still resolves', async (_label, impl) => {
        const { host, api, imported } = makeHost([row('a')], { a: capturing() });
        api.listModules.mockImplementation(impl);
        host.start();
        await host.ready;
        expect(imported).toEqual([]);
        expect(host.list()).toBeNull();
        expect(host.testApis).toEqual({});
        expect(api.logError).toHaveBeenCalledOnce();
    });

    it('never rejects, even on a row it cannot read, and still settles ready', async () => {
        const { host, api } = makeHost([row('a', { requires: 5 })], { a: capturing() });
        await expect(host.start()).resolves.toBeUndefined();
        await host.ready;
        expect(api.logError).toHaveBeenCalledWith(expect.objectContaining({ source: 'modules' }));
    });

    it('settles ready when start does', async () => {
        const { host } = makeHost([], {});
        let settled = false;
        host.ready.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);
        await host.start();
        expect(settled).toBe(true);
        expect(host.list()).toMatchObject({ order: [], modules: [] });
    });
});

describe('the activation timeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is 5 s, covering import and activate together', () => {
        expect(ACTIVATION_TIMEOUT_MS).toBe(5000);
    });

    it('fails a module at 5,000 ms, not 4,999, and ignores its later result', async () => {
        let finish;
        const slow = { activate: () => new Promise((resolve) => (finish = resolve)) };
        const { host, api } = makeHost([row('slow'), row('next')], { slow, next: capturing() });
        let ready = false;
        host.start().then(() => (ready = true));
        await vi.advanceTimersByTimeAsync(4999);
        expect(host.outcome('slow')).toBeNull();
        expect(ready).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(ready).toBe(true);
        expect(host.outcome('slow')).toEqual({ state: 'failed', reason: 'did not finish activating within 5 s' });
        expect(host.outcome('next').state).toBe('active');
        expect(api.logError).toHaveBeenCalledWith(expect.objectContaining({ source: 'module:slow' }));
        finish({ testApi: { late: true } });
        await vi.advanceTimersByTimeAsync(0);
        expect(host.outcome('slow').state).toBe('failed');
        expect(host.testApis).toEqual({});
    });

    it('counts a slow import against the same 5 s', async () => {
        const { host, importModule } = makeHost([row('a')], {});
        importModule.mockImplementation(() => new Promise(() => {}));
        host.start();
        await vi.advanceTimersByTimeAsync(5000);
        expect(host.outcome('a').state).toBe('failed');
    });

    it('drops what a timed-out module registers late, and refuses its store', async () => {
        let finish;
        let lateHost;
        const slow = {
            activate: (h) => {
                lateHost = h;
                return new Promise((resolve) => (finish = resolve));
            },
        };
        // A second module, active, hands the test a real visit of this host.
        const watch = capturing();
        const { host, api } = makeHost(
            [row('slow', { folderFiles: [{ name: '.s.json', kind: 'data', maxBytes: 9 }] }), row('watch')],
            { slow, watch }
        );
        host.start();
        await vi.advanceTimersByTimeAsync(5000);
        let visit = null;
        watch.host.folder.onLoaded((v) => (visit = v));
        const onLoaded = vi.fn();
        lateHost.folder.onLoaded(onLoaded);
        finish({});
        await vi.advanceTimersByTimeAsync(0);
        host.beginVisit('C:\\f');
        expect(onLoaded).not.toHaveBeenCalled();
        expect(visit).not.toBeNull();
        expect(await lateHost.store.folderFile('.s.json').read(visit)).toEqual({
            status: 'unreadable',
            reason: 'module is not active',
        });
        expect(api.folderFileRead).not.toHaveBeenCalled();
    });
});

describe('the per-module host', () => {
    async function hostFor(extra = {}, opts = {}) {
        const mod = capturing();
        const made = makeHost([row('x', extra)], { x: mod }, opts);
        await made.host.start();
        return { ...made, h: mod.host };
    }

    it('has the seven groups, and is frozen through', async () => {
        const { h } = await hostFor();
        expect(Object.keys(h).sort()).toEqual(['files', 'folder', 'log', 'module', 'settings', 'store', 'ui']);
        expect(() => {
            h.extra = 1;
        }).toThrow(TypeError);
        for (const group of Object.values(h)) {
            expect(Object.isFrozen(group)).toBe(true);
        }
        expect(h.module).toEqual({ id: 'x', version: '1.2.3' });
    });

    it('logs with the module id as the source, and perf lines with the id in front', async () => {
        const { h, api } = await hostFor();
        h.log.error('it broke');
        h.log.error('it broke', 'because');
        h.log.perf('scan=3ms');
        expect(api.logError.mock.calls).toEqual([
            [{ level: 'error', message: 'it broke', source: 'module:x' }],
            [{ level: 'error', message: 'it broke: because', source: 'module:x' }],
        ]);
        expect(api.logPerf).toHaveBeenCalledWith('[x] scan=3ms');
    });

    it('keeps settings under module.<id>.<key> as JSON, and falls back on a missing key or bad JSON', async () => {
        const { h, storage } = await hostFor();
        expect(h.settings.get('size', 7)).toBe(7);
        h.settings.set('size', { w: 2 });
        expect(storage.map.get('module.x.size')).toBe('{"w":2}');
        expect(h.settings.get('size', 7)).toEqual({ w: 2 });
        storage.map.set('module.x.bad', '{nope');
        expect(h.settings.get('bad', 'fb')).toBe('fb');
    });

    it.each([[''], ['a b'], ['k'.repeat(65)], ['a/b'], [7]])('refuses the setting key %j', async (key) => {
        const { h } = await hostFor();
        expect(() => h.settings.get(key)).toThrow();
        expect(() => h.settings.set(key, 1)).toThrow();
    });

    it('logs, and does not throw, when storage refuses a write', async () => {
        const storage = memStorage();
        storage.setItem = () => {
            throw new Error('quota');
        };
        const { h, api } = await hostFor({}, { storage });
        expect(() => h.settings.set('k', 1)).not.toThrow();
        expect(api.logError).toHaveBeenCalledWith(expect.objectContaining({ source: 'module:x' }));
    });

    it('maps notify to the notification system, with its action and level, and returns close()', async () => {
        const element = { remove: vi.fn() };
        const notify = vi.fn(() => element);
        const { h } = await hostFor({}, { notify });
        const run = vi.fn();
        const handle = h.ui.notify('Ready', 'success', { sticky: true, action: { label: 'Show', run } });
        expect(notify).toHaveBeenCalledWith('Ready', 'success', {
            sticky: true,
            actionButton: 'Show',
            actionCallback: expect.any(Function),
        });
        notify.mock.calls[0][2].actionCallback();
        expect(run).toHaveBeenCalledOnce();
        handle.close();
        expect(element.remove).toHaveBeenCalledOnce();
        h.ui.notify('plain');
        expect(notify).toHaveBeenLastCalledWith('plain', 'info', { sticky: false });
        h.ui.notify('odd', 'shout');
        expect(notify.mock.calls.at(-1)[1]).toBe('info');
    });

    it('lists the files as a frozen snapshot of name, path, size, mtimeMs and type', async () => {
        const { h } = await hostFor();
        const list = h.files.list();
        expect(list).toEqual([
            { name: 'a.jpg', path: 'C:\\f\\a.jpg', size: 10, mtimeMs: 1000, type: 'image/jpeg' },
            { name: 'b.mp4', path: 'C:\\f\\b.mp4', size: 20, mtimeMs: 2000, type: 'video/mp4' },
        ]);
        expect(Object.isFrozen(list)).toBe(true);
        expect(Object.isFrozen(list[0])).toBe(true);
    });
});

describe('visits and the folder-file store', () => {
    const DECL = [{ name: '.x_state.json', kind: 'data', maxBytes: 4096 }];

    async function started(extraRows = [], modules = {}) {
        const x = capturing();
        const made = makeHost([row('x', { folderFiles: DECL }), ...extraRows], { x, ...modules });
        await made.host.start();
        return { ...made, h: x.host };
    }

    it('calls onLoaded with the live visit and the file snapshot', async () => {
        const { host, h } = await started();
        const onLoaded = vi.fn();
        h.folder.onLoaded(onLoaded);
        host.beginVisit('C:\\f');
        const [visit, files] = onLoaded.mock.calls[0];
        expect(visit).toMatchObject({ folder: 'C:\\f' });
        expect(Object.isFrozen(visit)).toBe(true);
        expect(visit.isLive()).toBe(true);
        expect(files.map((f) => f.name)).toEqual(['a.jpg', 'b.mp4']);
        expect(h.folder.current()).toEqual({ path: 'C:\\f', name: 'f' });
        host.endVisit();
        expect(visit.isLive()).toBe(false);
        expect(h.folder.current()).toBeNull();
    });

    it('builds no snapshot when no module listens', async () => {
        const { host, getFiles } = await started();
        host.beginVisit('C:\\f');
        expect(getFiles).not.toHaveBeenCalled();
    });

    it('runs every handler though one throws and another rejects, logging each with its module', async () => {
        const y = capturing();
        const { host, h, api } = await started([row('y')], { y });
        h.folder.onLoaded(() => {
            throw new Error('sync boom');
        });
        y.host.folder.onLoaded(async () => {
            throw new Error('async boom');
        });
        const last = vi.fn();
        h.folder.onLoaded(last);
        host.beginVisit('C:\\f');
        await Promise.resolve();
        await Promise.resolve();
        expect(last).toHaveBeenCalledOnce();
        const sources = api.logError.mock.calls.map(([e]) => e.source);
        expect(sources).toEqual(expect.arrayContaining(['module:x', 'module:y']));
    });

    it('stops calling a handler once its disposer runs', async () => {
        const { host, h } = await started();
        const fn = vi.fn();
        const dispose = h.folder.onLoaded(fn);
        dispose();
        host.beginVisit('C:\\f');
        expect(fn).not.toHaveBeenCalled();
    });

    it('a write asked for inside onVisitEnd reaches the old folder (C9)', async () => {
        const { host, h, api } = await started();
        let visit;
        h.folder.onLoaded((v) => (visit ??= v)); // the first visit, C:\old
        h.folder.onVisitEnd((v) => {
            h.store.folderFile('.x_state.json').write(v, { frozen: true });
        });
        host.beginVisit('C:\\old');
        host.beginVisit('C:\\new'); // ends the old visit first
        expect(api.folderFileWrite).toHaveBeenCalledWith('x', 'C:\\old', '.x_state.json', { frozen: true });
        expect(visit.isLive()).toBe(false);
    });

    it('refuses a write or a read after the visit ended, with no IPC', async () => {
        const { host, h, api } = await started();
        let visit;
        h.folder.onLoaded((v) => (visit = v));
        host.beginVisit('C:\\f');
        host.endVisit();
        const file = h.store.folderFile('.x_state.json');
        expect(await file.write(visit, { n: 1 })).toEqual({ success: false, error: 'visit ended' });
        expect(await file.read(visit)).toEqual({ status: 'unreadable', reason: 'visit ended' });
        expect(await file.delete(visit)).toEqual({ success: false, error: 'visit ended' });
        expect(api.folderFileWrite).not.toHaveBeenCalled();
        expect(api.folderFileRead).not.toHaveBeenCalled();
        expect(api.folderFileDelete).not.toHaveBeenCalled();
    });

    it('issues the IPC at the call, so the value is the one at the call', async () => {
        const { host, h, api } = await started();
        let visit;
        h.folder.onLoaded((v) => (visit = v));
        host.beginVisit('C:\\f');
        const file = h.store.folderFile('.x_state.json');
        const pending = file.write(visit, { n: 1 });
        expect(api.folderFileWrite).toHaveBeenCalledOnce(); // before any await
        expect(await pending).toEqual({ success: true });
        expect(await file.read(visit)).toEqual({ status: 'ok', value: { n: 1 }, recovered: false });
        expect(api.folderFileRead).toHaveBeenCalledWith('x', 'C:\\f', '.x_state.json');
        await file.delete(visit);
        expect(api.folderFileDelete).toHaveBeenCalledWith('x', 'C:\\f', '.x_state.json');
    });

    it('maps an IPC failure to unreadable or an error, never absent (Review Focus 1)', async () => {
        const { host, h, api } = await started();
        let visit;
        h.folder.onLoaded((v) => (visit = v));
        host.beginVisit('C:\\f');
        api.folderFileRead.mockRejectedValueOnce(new Error('channel closed'));
        api.folderFileWrite.mockRejectedValueOnce(new Error('channel closed'));
        const file = h.store.folderFile('.x_state.json');
        expect(await file.read(visit)).toEqual({ status: 'unreadable', reason: 'channel closed' });
        expect(await file.write(visit, 1)).toEqual({ success: false, error: 'channel closed' });
        api.folderFileRead.mockResolvedValueOnce(undefined);
        expect((await file.read(visit)).status).toBe('unreadable');
    });

    it('throws for a folder file the module did not declare', async () => {
        const { h } = await started();
        expect(() => h.store.folderFile('.other.json')).toThrow(
            'x: folder file .other.json is not declared in module.json'
        );
    });

    it('throws for a visit this host did not make', async () => {
        const { host, h } = await started();
        host.beginVisit('C:\\f');
        const forged = Object.freeze({ id: 1, folder: 'C:\\elsewhere', isLive: () => true });
        expect(() => h.store.folderFile('.x_state.json').read(forged)).toThrow();
    });

    it("refuses a failed module's store", async () => {
        let failedHost;
        const boom = {
            activate: (hh) => {
                failedHost = hh;
                throw new Error('no');
            },
        };
        const { host, h, api } = await started(
            [row('bad', { folderFiles: [{ name: '.bad.json', kind: 'cache', maxBytes: 9 }] })],
            {
                bad: boom,
            }
        );
        let visit;
        h.folder.onLoaded((v) => (visit = v));
        host.beginVisit('C:\\f');
        expect(await failedHost.store.folderFile('.bad.json').read(visit)).toEqual({
            status: 'unreadable',
            reason: 'module is not active',
        });
        expect(api.folderFileRead).not.toHaveBeenCalled();
    });

    it('ends a live visit before the next begins, and endVisit is idempotent', async () => {
        const { host, h } = await started();
        const ended = vi.fn();
        h.folder.onVisitEnd(ended);
        host.endVisit(); // nothing live
        host.beginVisit('C:\\a');
        host.beginVisit('C:\\b');
        host.endVisit();
        host.endVisit();
        expect(ended.mock.calls.map(([v]) => v.folder)).toEqual(['C:\\a', 'C:\\b']);
    });
});

describe('deactivateAll', () => {
    it('deactivates in reverse activation order, survives a throw, and leaves every store refusing', async () => {
        const order = [];
        const mk = (id, opts = {}) => {
            const mod = { host: null };
            mod.activate = (h) => {
                mod.host = h;
                return {
                    deactivate: async () => {
                        order.push(id);
                        if (opts.throws) {
                            throw new Error('deactivate failed');
                        }
                    },
                };
            };
            return mod;
        };
        const a = mk('a');
        const b = mk('b', { throws: true });
        const c = mk('c');
        const decl = [{ name: '.a.json', kind: 'cache', maxBytes: 9 }];
        const { host, api } = makeHost([row('a', { folderFiles: decl }), row('b'), row('c')], { a, b, c });
        await host.start();
        let visit;
        a.host.folder.onLoaded((v) => (visit = v));
        host.beginVisit('C:\\f');
        await expect(host.deactivateAll()).resolves.toBeUndefined();
        expect(order).toEqual(['c', 'b', 'a']);
        expect(api.logError).toHaveBeenCalledWith(expect.objectContaining({ source: 'module:b' }));
        expect(await a.host.store.folderFile('.a.json').read(visit)).toEqual({
            status: 'unreadable',
            reason: 'module is not active',
        });
        const late = vi.fn();
        a.host.folder.onLoaded(late);
        host.beginVisit('C:\\g');
        expect(late).not.toHaveBeenCalled();
    });
});
