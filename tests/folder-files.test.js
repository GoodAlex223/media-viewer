// v2 P1a: the folder-file service (main/folder-files.js), spec §§ 7.9, 8.2. A module's per-folder files, by owner
// and declared name: a tagged read in which a failure is never "absent" (Review Focus 1), an atomic write and a
// delete, each refused for a name the owner did not declare. Real files in a temp folder and the real writer; fs
// wrappers only where a failure has to be forced.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { createAtomicWriter, readRecoveryCopy, tmpPathFor } = require('../atomic-write.js');
const { withReadRetries } = require('../feature-cache-ledger');
const { createFolderFiles } = require('../main/folder-files.js');

const NAME = '.mod_state.json';
const MAX = 64;
const errWith = (code) => Object.assign(new Error(code), { code });

// Only `mod` declared `.mod_state.json`, as data with a 64-byte cap.
const registry = {
    folderFileDecl: (owner, name) => (owner === 'mod' && name === NAME ? { kind: 'data', maxBytes: MAX } : null),
};

let dir;
let target;
let warnings;

beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mv-folder-files-'));
    target = path.join(dir, NAME);
    warnings = [];
});

afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
});

// main's assertFixedPath, minus the grant check (the guard's kinds.grantedPath already ran): a link is refused.
const linkCheck = (fs) => async (p) => {
    try {
        if ((await fs.lstat(p)).isSymbolicLink()) {
            throw new Error(`Not permitted: ${path.basename(p)} is a link`);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
};

function service({ fs = fsp } = {}) {
    const assertPath = linkCheck(fs);
    const writer = createAtomicWriter({
        fs,
        assertPath,
        withRetries: (fn) => withReadRetries(fn, { sleep: async () => {} }),
    });
    const logger = { warn: (source, message) => warnings.push([source, message]) };
    return createFolderFiles({ fs, registry, assertPath, writer, readRecoveryCopy, logger });
}

// fs.promises with one method replaced for one path.
function fsWith(method, forPath, impl) {
    return { ...fsp, [method]: (p, ...rest) => (p === forPath ? impl(p, ...rest) : fsp[method](p, ...rest)) };
}

describe('read', () => {
    it('reads a whole file as ok, not recovered', async () => {
        await fsp.writeFile(target, JSON.stringify({ n: 1 }));
        expect(await service().read('mod', dir, NAME)).toEqual({ status: 'ok', value: { n: 1 }, recovered: false });
    });

    it('reads a missing file as absent', async () => {
        expect(await service().read('mod', dir, NAME)).toEqual({ status: 'absent' });
    });

    it("reads a torn file's last whole copy, and says so in the log", async () => {
        await fsp.writeFile(target, '{"n":');
        await fsp.writeFile(tmpPathFor(target, 'abcdef123456'), JSON.stringify({ n: 2 }));
        expect(await service().read('mod', dir, NAME)).toEqual({ status: 'ok', value: { n: 2 }, recovered: true });
        expect(warnings).toHaveLength(1);
        expect(warnings[0][0]).toBe('main');
        expect(warnings[0][1]).toMatch(/^\.mod_state\.json did not parse \(.+\); read its last whole copy$/);
    });

    it('reads a torn file with no whole copy as unreadable, never absent', async () => {
        await fsp.writeFile(target, '{"n":');
        expect(await service().read('mod', dir, NAME)).toEqual({ status: 'unreadable', reason: 'does not parse' });
    });

    it('reads a file over its cap as unreadable', async () => {
        await fsp.writeFile(target, JSON.stringify({ pad: 'x'.repeat(MAX) }));
        expect(await service().read('mod', dir, NAME)).toEqual({ status: 'unreadable', reason: 'too large' });
    });

    it('reads a link at the name as unreadable', async () => {
        await fsp.writeFile(target, '{}');
        const fs = fsWith('lstat', target, async () => ({
            isSymbolicLink: () => true,
            isFile: () => false,
            isDirectory: () => false,
            size: 2,
        }));
        const result = await service({ fs }).read('mod', dir, NAME);
        expect(result.status).toBe('unreadable');
        expect(result.reason).toContain('link');
    });

    it('reads a folder at the name as unreadable', async () => {
        await fsp.mkdir(target);
        const result = await service().read('mod', dir, NAME);
        expect(result.status).toBe('unreadable');
    });

    it('refuses an undeclared name, or another owner, as unreadable "Not permitted"', async () => {
        await fsp.writeFile(path.join(dir, '.other.json'), '{}');
        await fsp.writeFile(target, '{}');
        const unreadable = { status: 'unreadable', reason: 'Not permitted' };
        expect(await service().read('mod', dir, '.other.json')).toEqual(unreadable);
        expect(await service().read('someone', dir, NAME)).toEqual(unreadable);
    });

    it('reads a file it is not allowed to open as unreadable, with the reason', async () => {
        await fsp.writeFile(target, '{}');
        const fs = fsWith('readFile', target, async () => {
            throw errWith('EACCES');
        });
        expect(await service({ fs }).read('mod', dir, NAME)).toEqual({ status: 'unreadable', reason: 'EACCES' });
    });
});

describe('write', () => {
    it('round-trips a value through read, in the bulk-rated file format', async () => {
        const files = service();
        expect(await files.write('mod', dir, NAME, { n: 3, list: ['a'] })).toEqual({ success: true });
        expect(await fsp.readFile(target, 'utf8')).toBe(JSON.stringify({ n: 3, list: ['a'] }, null, 2));
        expect(await files.read('mod', dir, NAME)).toEqual({
            status: 'ok',
            value: { n: 3, list: ['a'] },
            recovered: false,
        });
    });

    it('refuses a value over the cap and leaves the file as it was', async () => {
        await fsp.writeFile(target, '{"old":true}');
        const result = await service().write('mod', dir, NAME, { pad: 'x'.repeat(MAX) });
        expect(result).toEqual({ success: false, error: 'too large' });
        expect(await fsp.readFile(target, 'utf8')).toBe('{"old":true}');
    });

    it('refuses undefined, which is not JSON', async () => {
        expect(await service().write('mod', dir, NAME, undefined)).toEqual({ success: false, error: 'not JSON' });
        await expect(fsp.access(target)).rejects.toThrow();
    });

    it('refuses an undeclared name and writes nothing', async () => {
        const result = await service().write('mod', dir, '.other.json', { n: 1 });
        expect(result).toEqual({ success: false, error: 'Not permitted' });
        expect(await fsp.readdir(dir)).toEqual([]);
    });

    it('keeps call order with a delete: write then delete leaves no file', async () => {
        const files = service();
        const write = files.write('mod', dir, NAME, { n: 1 });
        const remove = files.remove('mod', dir, NAME);
        expect(await Promise.all([write, remove])).toEqual([{ success: true }, { success: true }]);
        expect(await files.read('mod', dir, NAME)).toEqual({ status: 'absent' });
    });
});

describe('remove', () => {
    it('removes the file', async () => {
        await fsp.writeFile(target, '{}');
        expect(await service().remove('mod', dir, NAME)).toEqual({ success: true });
        await expect(fsp.access(target)).rejects.toThrow();
    });

    it('counts a missing file as removed', async () => {
        expect(await service().remove('mod', dir, NAME)).toEqual({ success: true });
    });

    it('refuses a folder at the name', async () => {
        await fsp.mkdir(target);
        const result = await service().remove('mod', dir, NAME);
        expect(result.success).toBe(false);
        expect((await fsp.stat(target)).isDirectory()).toBe(true);
    });

    it('refuses an undeclared name and keeps the file', async () => {
        const other = path.join(dir, '.other.json');
        await fsp.writeFile(other, '{}');
        expect(await service().remove('mod', dir, '.other.json')).toEqual({ success: false, error: 'Not permitted' });
        expect(await fsp.readFile(other, 'utf8')).toBe('{}');
    });
});
