// v2 P1a: the module registry (main/module-registry.js), spec §§ 6.1, 6.5 steps 1–2, 8.1. Main reads every
// modules/*/module.json as data, validates it strictly (plan C6), resolves dependencies and keeps the toggles in
// modules.json. Every case runs on an in-memory fs and a recording writer.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const {
    SUPPORTED_API_VERSIONS,
    CORE_RESERVED_FOLDER_FILES,
    validateManifest,
    createModuleRegistry,
} = require('../main/module-registry.js');

const errWith = (code) => Object.assign(new Error(code), { code });

// An in-memory fs: `files` maps an absolute path to its text; every ancestor of a file is a folder. `links` maps a
// path to the path its realpath gives (a junction or symlink).
function memFs({ files = {}, links = {}, fail = {} } = {}) {
    const dirs = new Set();
    for (const p of Object.keys(files)) {
        let d = path.dirname(p);
        while (!dirs.has(d) && d !== path.dirname(d)) {
            dirs.add(d);
            d = path.dirname(d);
        }
    }
    const exists = (p) => p in files || dirs.has(p);
    const check = (op, p) => {
        if (fail[p] && fail[p][op]) {
            throw fail[p][op];
        }
    };
    return {
        files,
        async realpath(p) {
            check('realpath', p);
            if (p in links) {
                return links[p];
            }
            if (!exists(p)) {
                throw errWith('ENOENT');
            }
            return p;
        },
        async readdir(p) {
            check('readdir', p);
            if (!dirs.has(p)) {
                throw errWith('ENOENT');
            }
            const names = new Set();
            for (const q of [...Object.keys(files), ...dirs]) {
                if (path.dirname(q) === p && q !== p) {
                    names.add(path.basename(q));
                }
            }
            return [...names];
        },
        async stat(p) {
            check('stat', p);
            if (p in files) {
                return { isFile: () => true, isDirectory: () => false, size: Buffer.byteLength(files[p], 'utf8') };
            }
            if (dirs.has(p)) {
                return { isFile: () => false, isDirectory: () => true, size: 0 };
            }
            throw errWith('ENOENT');
        },
        async readFile(p) {
            check('readFile', p);
            if (!(p in files)) {
                throw errWith('ENOENT');
            }
            return files[p];
        },
    };
}

function recordingWriter({ failWith = null } = {}) {
    const writes = [];
    return {
        writes,
        async writeFileAtomic(target, data) {
            await Promise.resolve();
            if (failWith) {
                throw failWith;
            }
            writes.push([target, data]);
        },
    };
}

function recordingLogger() {
    const warnings = [];
    return { warnings, warn: (source, message) => warnings.push([source, message]) };
}

const APP = path.resolve('/app/modules');
const E2E = path.resolve('/e2e/modules');
const STATE = path.resolve('/state/modules.json');

function manifest(id, extra = {}) {
    return {
        id,
        name: `Module ${id}`,
        version: '1.0.0',
        apiVersion: 1,
        description: `The ${id} module`,
        entry: 'ui/index.js',
        defaultEnabled: true,
        ...extra,
    };
}

// The files of one module folder: its manifest and its entry file.
function moduleFiles(rootDir, m, { folder = m.id, text = null } = {}) {
    return {
        [path.join(rootDir, folder, 'module.json')]: text ?? JSON.stringify(m),
        [path.join(rootDir, folder, 'ui', 'index.js')]: 'export function activate() {}\n',
    };
}

let logger;
let writer;

beforeEach(() => {
    logger = recordingLogger();
    writer = recordingWriter();
});

async function loaded({ files = {}, links = {}, fail = {}, roots = [{ dir: APP, kind: 'app' }], reserved } = {}) {
    const fs = memFs({ files, links, fail });
    const registry = createModuleRegistry({
        fs,
        roots,
        statePath: STATE,
        writer,
        logger,
        ...(reserved ? { reservedFolderFiles: reserved } : {}),
    });
    await registry.load();
    return registry;
}

const row = (registry, id) => registry.list().modules.find((m) => m.id === id);

describe('constants', () => {
    it('supports host API 1 and reserves the five folder files core still owns', () => {
        expect(SUPPORTED_API_VERSIONS).toEqual([1]);
        expect(Object.isFrozen(SUPPORTED_API_VERSIONS)).toBe(true);
        expect(CORE_RESERVED_FOLDER_FILES).toEqual([
            '.bulk_rated.json',
            '.feature_cache.json',
            '.hash_cache.json',
            '.sort_cache.json',
            '.tournament_state.json',
        ]);
        expect(Object.isFrozen(CORE_RESERVED_FOLDER_FILES)).toBe(true);
    });
});

describe('validateManifest', () => {
    const text = (m) => JSON.stringify(m);
    const errorsOf = (m, folderName = m.id) => {
        const result = validateManifest(text(m), { folderName });
        expect(result.ok).toBe(false);
        return result.errors.join('\n');
    };

    it('accepts a valid manifest, with every optional key', () => {
        const m = manifest('alpha', {
            requires: ['beta'],
            optional: ['gamma'],
            folderFiles: [{ name: '.alpha_cache.json', kind: 'cache', maxBytes: 1024 }],
            uses: [],
            contributes: {},
        });
        const result = validateManifest(text(m), { folderName: 'alpha' });
        expect(result).toEqual({ ok: true, manifest: expect.objectContaining({ id: 'alpha', entry: 'ui/index.js' }) });
    });

    it('fills the optional keys it leaves out', () => {
        const m = manifest('alpha');
        delete m.description;
        const result = validateManifest(text(m), { folderName: 'alpha' });
        expect(result.ok).toBe(true);
        expect(result.manifest).toMatchObject({ description: '', requires: [], optional: [], folderFiles: [] });
    });

    it('parses a file that starts with a byte-order mark', () => {
        const result = validateManifest('﻿' + text(manifest('alpha')), { folderName: 'alpha' });
        expect(result.ok).toBe(true);
    });

    it('refuses a file over 65,536 bytes', () => {
        const base = text(manifest('alpha'));
        const big = base.slice(0, -1) + ',"description2":"' + 'x'.repeat(65537 - base.length - 18) + '"}';
        expect(Buffer.byteLength(big)).toBe(65537);
        const result = validateManifest(big, { folderName: 'alpha' });
        expect(result.ok).toBe(false);
        expect(result.errors.join()).toContain('65536');
    });

    it('refuses text that is not JSON, and JSON that is not an object', () => {
        expect(validateManifest('{nope', { folderName: 'a' }).errors.join()).toContain('JSON');
        expect(validateManifest('[1]', { folderName: 'a' }).errors.join()).toContain('object');
    });

    it.each([
        ['id', { id: 'Alpha' }, 'Alpha'],
        ['id', { id: 'a'.repeat(41) }, 'a'.repeat(41)],
        ['id', { id: 'core' }, 'core'],
        ['name', { name: '' }],
        ['name', { name: 'n'.repeat(61) }],
        ['name', { name: 7 }],
        ['version', { version: '1.0' }],
        ['apiVersion', { apiVersion: 2 }],
        ['apiVersion', { apiVersion: '1' }],
        ['description', { description: 'd'.repeat(201) }],
        ['entry', { entry: 'index.js' }],
        ['entry', { entry: 'ui/../main/a.js' }],
        ['entry', { entry: 'ui/./a.js' }],
        ['entry', { entry: 'ui//a.js' }],
        ['entry', { entry: 'ui/a.mjs' }],
        ['defaultEnabled', { defaultEnabled: 'yes' }],
        ['requires', { requires: 'beta' }],
        ['requires', { requires: Array.from({ length: 17 }, (_, i) => `m${i}`) }],
        ['requires', { requires: ['alpha'] }],
        ['requires', { requires: ['beta', 'beta'] }],
        ['requires', { requires: ['Beta'] }],
        ['optional', { optional: ['beta'], requires: ['beta'] }],
        [
            'folderFiles',
            { folderFiles: Array.from({ length: 9 }, (_, i) => ({ name: `.f${i}.json`, kind: 'cache', maxBytes: 1 })) },
        ],
        ['folderFiles', { folderFiles: [{ name: 'f.json', kind: 'cache', maxBytes: 1 }] }],
        ['folderFiles', { folderFiles: [{ name: '.f.txt', kind: 'cache', maxBytes: 1 }] }],
        ['folderFiles', { folderFiles: [{ name: '.f.json', kind: 'other', maxBytes: 1 }] }],
        ['folderFiles', { folderFiles: [{ name: '.f.json', kind: 'data', maxBytes: 0 }] }],
        ['folderFiles', { folderFiles: [{ name: '.f.json', kind: 'data', maxBytes: 268435457 }] }],
        ['folderFiles', { folderFiles: [{ name: '.f.json', kind: 'data', maxBytes: 1.5 }] }],
        ['folderFiles', { folderFiles: [{ name: '.f.json', kind: 'data', maxBytes: 1, extra: 1 }] }],
        [
            'folderFiles',
            {
                folderFiles: [
                    { name: '.f.json', kind: 'data', maxBytes: 1 },
                    { name: '.f.json', kind: 'cache', maxBytes: 1 },
                ],
            },
        ],
        ['.bulk_rated.json', { folderFiles: [{ name: '.bulk_rated.json', kind: 'data', maxBytes: 1 }] }],
        ['uses', { uses: [{ name: 'features' }] }],
        ['contributes', { contributes: { panels: ['x'] } }],
        ['permissions', { permissions: { network: true } }],
        ['legacySettingsKeys', { legacySettingsKeys: ['x'] }],
        ['bogus', { bogus: true }],
    ])('refuses a bad %s', (key, change, folderName) => {
        const m = { ...manifest('alpha'), ...change };
        expect(errorsOf(m, folderName ?? 'alpha')).toContain(key);
    });

    it.each(['id', 'name', 'version', 'apiVersion', 'entry', 'defaultEnabled'])('requires %s', (key) => {
        const m = manifest('alpha');
        delete m[key];
        expect(errorsOf(m, 'alpha')).toContain(key);
    });

    it('names the folder when the id does not equal it', () => {
        expect(errorsOf(manifest('e2e-other'), 'e2e-invalid')).toContain('folder name');
    });

    it('says a later-phase key arrives later, and an unknown key is unknown', () => {
        expect(errorsOf({ ...manifest('alpha'), jobs: ['x'] })).toContain('not supported yet by host API v1');
        expect(errorsOf({ ...manifest('alpha'), bogus: 1 })).toContain('unknown key');
    });

    it('says a reserved folder file is owned by core', () => {
        const m = { ...manifest('alpha'), folderFiles: [{ name: '.sort_cache.json', kind: 'cache', maxBytes: 1 }] };
        expect(errorsOf(m)).toContain('.sort_cache.json is owned by core');
    });
});

describe('resolution', () => {
    it('lists nothing for an empty root list', async () => {
        const registry = await loaded({ roots: [] });
        expect(registry.list()).toMatchObject({ apiVersions: [1], order: [], modules: [], restartNeeded: false });
    });

    it('lists nothing when the modules folder is missing', async () => {
        const registry = await loaded({ files: {} });
        expect(registry.list().modules).toEqual([]);
        expect(logger.warnings).toEqual([]);
    });

    it('lists a valid module as enabled, with no filesystem path in the row', async () => {
        const registry = await loaded({ files: moduleFiles(APP, manifest('alpha')) });
        const list = registry.list();
        expect(list.order).toEqual(['alpha']);
        expect(list.modules).toEqual([
            {
                id: 'alpha',
                name: 'Module alpha',
                version: '1.0.0',
                description: 'The alpha module',
                root: 'app',
                entryPath: 'modules/alpha/ui/index.js',
                status: 'enabled',
                reason: null,
                enabledAtLaunch: true,
                enabledNext: true,
                defaultEnabled: true,
                requires: [],
                optional: [],
                folderFiles: [],
            },
        ]);
        expect(JSON.stringify(list)).not.toContain(path.sep === '\\' ? '\\\\' : APP);
    });

    it('skips a folder with no module.json, and a file beside the module folders', async () => {
        const registry = await loaded({
            files: {
                ...moduleFiles(APP, manifest('alpha')),
                [path.join(APP, 'notes', 'readme.txt')]: 'x',
                [path.join(APP, 'stray.json')]: '{}',
            },
        });
        expect(registry.list().modules.map((m) => m.id)).toEqual(['alpha']);
    });

    it('records an invalid manifest with its errors as the reason', async () => {
        const registry = await loaded({ files: moduleFiles(APP, manifest('e2e-other'), { folder: 'e2e-invalid' }) });
        expect(row(registry, 'e2e-invalid')).toMatchObject({ status: 'invalid', entryPath: null });
        expect(row(registry, 'e2e-invalid').reason).toContain('folder name');
        expect(registry.list().order).toEqual([]);
    });

    it('records a module whose entry file is missing as invalid', async () => {
        const files = moduleFiles(APP, manifest('alpha'));
        delete files[path.join(APP, 'alpha', 'ui', 'index.js')];
        const registry = await loaded({ files });
        expect(row(registry, 'alpha')).toMatchObject({ status: 'invalid' });
        expect(row(registry, 'alpha').reason).toContain('entry');
    });

    it('records a module.json over 65,536 bytes as invalid without reading it', async () => {
        const big = JSON.stringify({ ...manifest('alpha'), description: 'd'.repeat(70000) });
        const registry = await loaded({
            files: moduleFiles(APP, manifest('alpha'), { text: big }),
            fail: { [path.join(APP, 'alpha', 'module.json')]: { readFile: new Error('read a huge file') } },
        });
        expect(row(registry, 'alpha').reason).toContain('65536');
    });

    it('refuses a module folder that is a link', async () => {
        const dir = path.join(APP, 'alpha');
        const registry = await loaded({
            files: moduleFiles(APP, manifest('alpha')),
            links: { [dir]: path.resolve('/elsewhere/alpha') },
        });
        expect(row(registry, 'alpha')).toMatchObject({ status: 'invalid' });
        expect(row(registry, 'alpha').reason).toContain('link');
        expect(registry.moduleDir('alpha')).toBeNull();
    });

    it('blocks a module whose required module is not installed', async () => {
        const registry = await loaded({ files: moduleFiles(APP, manifest('alpha', { requires: ['beta'] })) });
        expect(row(registry, 'alpha')).toMatchObject({
            status: 'blocked',
            reason: 'requires beta, which is not installed',
        });
        expect(registry.isActive('alpha')).toBe(false);
    });

    it('blocks a module whose required module is off', async () => {
        const registry = await loaded({
            files: {
                ...moduleFiles(APP, manifest('alpha', { requires: ['b'] })),
                ...moduleFiles(APP, manifest('b', { defaultEnabled: false })),
            },
        });
        expect(row(registry, 'b')).toMatchObject({ status: 'off', reason: null });
        expect(row(registry, 'alpha')).toMatchObject({ status: 'blocked', reason: 'disabled because b is off' });
    });

    it('blocks a module whose required module is not valid', async () => {
        const registry = await loaded({
            files: {
                ...moduleFiles(APP, manifest('alpha', { requires: ['b'] })),
                ...moduleFiles(APP, manifest('b', { version: 'x' })),
            },
        });
        expect(row(registry, 'alpha')).toMatchObject({ status: 'blocked', reason: 'disabled because b is not valid' });
    });

    it('blocks down a chain: a module whose required module is blocked', async () => {
        const registry = await loaded({
            files: {
                ...moduleFiles(APP, manifest('alpha', { requires: ['b'] })),
                ...moduleFiles(APP, manifest('b', { requires: ['c'] })),
                ...moduleFiles(APP, manifest('c', { defaultEnabled: false })),
            },
        });
        expect(registry.list().order).toEqual(['c', 'b', 'alpha']);
        expect(row(registry, 'alpha')).toMatchObject({ status: 'blocked', reason: 'disabled because b is disabled' });
    });

    it('marks every member of a dependency cycle invalid', async () => {
        const registry = await loaded({
            files: {
                ...moduleFiles(APP, manifest('a', { requires: ['b'] })),
                ...moduleFiles(APP, manifest('b', { optional: ['a'] })),
                ...moduleFiles(APP, manifest('c')),
            },
        });
        expect(row(registry, 'a')).toMatchObject({ status: 'invalid', reason: 'dependency cycle: a → b → a' });
        expect(row(registry, 'b')).toMatchObject({ status: 'invalid', reason: 'dependency cycle: a → b → a' });
        expect(registry.list().order).toEqual(['c']);
    });

    it('orders by an optional dependency without blocking on it', async () => {
        const registry = await loaded({
            files: {
                ...moduleFiles(APP, manifest('a', { optional: ['z'] })),
                ...moduleFiles(APP, manifest('z', { defaultEnabled: false })),
                ...moduleFiles(APP, manifest('m', { optional: ['nothere'] })),
            },
        });
        expect(registry.list().order).toEqual(['m', 'z', 'a']);
        expect(row(registry, 'a')).toMatchObject({ status: 'enabled' });
        expect(row(registry, 'm')).toMatchObject({ status: 'enabled' });
    });

    it('marks both modules invalid when two roots hold the same id', async () => {
        const registry = await loaded({
            roots: [
                { dir: APP, kind: 'app' },
                { dir: E2E, kind: 'e2e' },
            ],
            files: { ...moduleFiles(APP, manifest('alpha')), ...moduleFiles(E2E, manifest('alpha')) },
        });
        const rows = registry.list().modules.filter((m) => m.id === 'alpha');
        expect(rows.map((m) => [m.root, m.status])).toEqual([
            ['app', 'invalid'],
            ['e2e', 'invalid'],
        ]);
        expect(rows[0].reason).toContain('duplicate');
        expect(registry.moduleDir('alpha')).toBeNull();
    });

    it('marks both modules invalid when they declare the same folder file', async () => {
        const ff = [{ name: '.shared.json', kind: 'cache', maxBytes: 10 }];
        const registry = await loaded({
            files: {
                ...moduleFiles(APP, manifest('a', { folderFiles: ff })),
                ...moduleFiles(APP, manifest('b', { folderFiles: ff })),
                ...moduleFiles(APP, manifest('c')),
            },
        });
        expect(row(registry, 'a')).toMatchObject({ status: 'invalid' });
        expect(row(registry, 'b')).toMatchObject({ status: 'invalid' });
        expect(row(registry, 'a').reason).toContain('.shared.json');
        expect(row(registry, 'c')).toMatchObject({ status: 'enabled' });
    });

    it('marks a module declaring .bulk_rated.json invalid', async () => {
        const ff = [{ name: '.bulk_rated.json', kind: 'data', maxBytes: 10 }];
        const registry = await loaded({ files: moduleFiles(APP, manifest('a', { folderFiles: ff })) });
        expect(row(registry, 'a')).toMatchObject({ status: 'invalid' });
        expect(row(registry, 'a').reason).toContain('owned by core');
    });

    it('skips a root it cannot list, with a warning, and keeps the others', async () => {
        const registry = await loaded({
            roots: [
                { dir: APP, kind: 'app' },
                { dir: E2E, kind: 'e2e' },
            ],
            files: { ...moduleFiles(APP, manifest('a')), ...moduleFiles(E2E, manifest('b')) },
            fail: { [APP]: { readdir: errWith('EACCES') } },
        });
        expect(registry.list().modules.map((m) => m.id)).toEqual(['b']);
        expect(logger.warnings).toHaveLength(1);
    });
});

describe('modules.json', () => {
    const files = () => ({
        ...moduleFiles(APP, manifest('a')),
        ...moduleFiles(APP, manifest('b', { defaultEnabled: false })),
    });

    it('uses each default when the file is absent, with no warning', async () => {
        const registry = await loaded({ files: files() });
        expect([row(registry, 'a').status, row(registry, 'b').status]).toEqual(['enabled', 'off']);
        expect(logger.warnings).toEqual([]);
    });

    it('applies the saved toggles', async () => {
        const registry = await loaded({
            files: { ...files(), [STATE]: JSON.stringify({ version: 1, enabled: { a: false, b: true } }) },
        });
        expect([row(registry, 'a').status, row(registry, 'b').status]).toEqual(['off', 'enabled']);
    });

    it('reads a file with a byte-order mark', async () => {
        const registry = await loaded({
            files: { ...files(), [STATE]: '﻿' + JSON.stringify({ version: 1, enabled: { b: true } }) },
        });
        expect(row(registry, 'b').status).toBe('enabled');
    });

    it.each([
        ['an array for enabled', JSON.stringify({ version: 1, enabled: [] })],
        ['a JSON string', JSON.stringify('hello')],
        ['another version', JSON.stringify({ version: 2, enabled: { b: true } })],
        ['text that is not JSON', '{"version":1,'],
        ['a 10 MB file', JSON.stringify({ version: 1, enabled: { b: true }, pad: 'x'.repeat(10 * 1024 * 1024) })],
    ])('uses the defaults, with a warning, for %s', async (_label, text) => {
        const registry = await loaded({ files: { ...files(), [STATE]: text } });
        expect([row(registry, 'a').status, row(registry, 'b').status]).toEqual(['enabled', 'off']);
        expect(logger.warnings).toHaveLength(1);
        expect(logger.warnings[0][0]).toBe('modules');
    });

    it('uses the defaults, with a warning, when the file cannot be read', async () => {
        const registry = await loaded({
            files: { ...files(), [STATE]: '{}' },
            fail: { [STATE]: { readFile: errWith('EACCES') } },
        });
        expect(row(registry, 'a').status).toBe('enabled');
        expect(logger.warnings).toHaveLength(1);
    });

    it('ignores a value that is not a boolean', async () => {
        const registry = await loaded({
            files: { ...files(), [STATE]: JSON.stringify({ version: 1, enabled: { a: 'no', b: 1 } }) },
        });
        expect([row(registry, 'a').status, row(registry, 'b').status]).toEqual(['enabled', 'off']);
    });
});

describe('setEnabled', () => {
    const files = () => ({
        ...moduleFiles(APP, manifest('a')),
        ...moduleFiles(APP, manifest('b', { defaultEnabled: false })),
        ...moduleFiles(APP, manifest('bad', { version: 'x' })),
    });

    it('writes the exact JSON, and keeps entries for ids it does not know', async () => {
        const registry = await loaded({
            files: { ...files(), [STATE]: JSON.stringify({ version: 1, enabled: { gone: true } }) },
        });
        await registry.setEnabled('b', true);
        expect(writer.writes).toEqual([
            [STATE, JSON.stringify({ version: 1, enabled: { gone: true, b: true } }, null, 2)],
        ]);
    });

    it('returns the list with enabledNext changed and the status unchanged until restart', async () => {
        const registry = await loaded({ files: files() });
        const list = await registry.setEnabled('b', true);
        const b = list.modules.find((m) => m.id === 'b');
        expect(b).toMatchObject({ status: 'off', enabledAtLaunch: false, enabledNext: true });
        expect(list.restartNeeded).toBe(true);
        expect(registry.isActive('b')).toBe(false);
    });

    it('flips restartNeeded back off when the toggle returns to its launch state', async () => {
        const registry = await loaded({ files: files() });
        await registry.setEnabled('a', false);
        expect(registry.list().restartNeeded).toBe(true);
        const list = await registry.setEnabled('a', true);
        expect(list.restartNeeded).toBe(false);
    });

    it('applies two calls in call order, so the second one wins', async () => {
        const registry = await loaded({ files: files() });
        await Promise.all([registry.setEnabled('b', true), registry.setEnabled('b', false)]);
        expect(writer.writes.at(-1)[1]).toBe(JSON.stringify({ version: 1, enabled: { b: false } }, null, 2));
        expect(row(registry, 'b').enabledNext).toBe(false);
    });

    it('keeps both of two quick toggles of different modules', async () => {
        const registry = await loaded({ files: files() });
        await Promise.all([registry.setEnabled('a', false), registry.setEnabled('b', true)]);
        expect(JSON.parse(writer.writes.at(-1)[1]).enabled).toEqual({ a: false, b: true });
    });

    it('refuses an unknown or invalid id, and writes nothing', async () => {
        const registry = await loaded({ files: files() });
        expect(await registry.setEnabled('nope', true)).toEqual({ error: expect.stringContaining('nope') });
        expect(await registry.setEnabled('bad', true)).toEqual({ error: expect.stringContaining('bad') });
        expect(writer.writes).toEqual([]);
    });

    it('changes nothing in memory when the write fails', async () => {
        writer = recordingWriter({ failWith: new Error('disk full') });
        const registry = await loaded({ files: files() });
        const before = registry.list();
        expect(await registry.setEnabled('b', true)).toEqual({ error: 'disk full' });
        expect(registry.list()).toEqual(before);
    });

    it('rewrites an unreadable file with the toggles it can see (C14)', async () => {
        const registry = await loaded({ files: { ...files(), [STATE]: '{"version":1,' } });
        await registry.setEnabled('b', true);
        expect(writer.writes).toEqual([[STATE, JSON.stringify({ version: 1, enabled: { b: true } }, null, 2)]]);
    });
});

describe('folderFileDecl, isActive and moduleDir', () => {
    const ff = [{ name: '.a_state.json', kind: 'data', maxBytes: 4096 }];
    const files = () => ({
        ...moduleFiles(APP, manifest('a', { folderFiles: ff })),
        ...moduleFiles(APP, manifest('off', { defaultEnabled: false, folderFiles: [{ ...ff[0], name: '.off.json' }] })),
        ...moduleFiles(APP, manifest('bad', { version: 'x' })),
    });

    it("gives an active module's declared name", async () => {
        const registry = await loaded({ files: files() });
        expect(registry.folderFileDecl('a', '.a_state.json')).toEqual({ kind: 'data', maxBytes: 4096 });
    });

    it("gives null for owner 'core', an off module, and an undeclared name", async () => {
        const registry = await loaded({ files: files() });
        expect(registry.folderFileDecl('core', '.bulk_rated.json')).toBeNull();
        expect(registry.folderFileDecl('off', '.off.json')).toBeNull();
        expect(registry.folderFileDecl('a', '.other.json')).toBeNull();
        expect(registry.folderFileDecl('nope', '.a_state.json')).toBeNull();
    });

    it('is active only for a module enabled at launch', async () => {
        const registry = await loaded({ files: files() });
        expect([registry.isActive('a'), registry.isActive('off'), registry.isActive('bad')]).toEqual([
            true,
            false,
            false,
        ]);
        await registry.setEnabled('a', false);
        expect(registry.isActive('a')).toBe(true); // until restart
    });

    it('gives the folder of any module but an invalid one', async () => {
        const registry = await loaded({ files: files() });
        expect(registry.moduleDir('a')).toBe(path.join(APP, 'a'));
        expect(registry.moduleDir('off')).toBe(path.join(APP, 'off'));
        expect(registry.moduleDir('bad')).toBeNull();
        expect(registry.moduleDir('nope')).toBeNull();
    });
});
