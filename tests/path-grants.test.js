import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { createGrantStore, createTempDirRegistry, GRANTS_VERSION } = require('../path-grants.js');

let tmp;
let storePath;
beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'mv-grants-'));
    storePath = join(tmp, 'userData', 'folder-grants.json');
});
afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
});

async function makeDir(...parts) {
    const p = join(tmp, ...parts);
    await mkdir(p, { recursive: true });
    return p;
}

describe('createGrantStore', () => {
    it('allows a path inside a granted folder and refuses one outside it', async () => {
        const photos = await makeDir('photos');
        const other = await makeDir('other');
        const store = createGrantStore({ storePath });
        await store.load();
        await store.grant(photos);
        expect(await store.resolveAllowed(join(photos, 'a.jpg'))).not.toBeNull();
        expect(await store.resolveAllowed(join(other, 'a.jpg'))).toBeNull();
    });

    it('is boundary-aware: a sibling whose name extends the root is outside it', async () => {
        const photos = await makeDir('photos');
        const photos2 = await makeDir('photos2');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(join(photos2, 'a.jpg'))).toBeNull();
    });

    it('allows the granted folder itself', async () => {
        const photos = await makeDir('photos');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(photos)).not.toBeNull();
    });

    it('allows a not-yet-existing path under a granted folder (a folder to create, a move target)', async () => {
        const photos = await makeDir('photos');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(join(photos, 'new', 'deeper', 'x.jpg'))).not.toBeNull();
    });

    it('refuses a .. escape out of a granted folder', async () => {
        const photos = await makeDir('photos');
        await makeDir('outside');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(join(photos, '..', 'outside', 'x.jpg'))).toBeNull();
    });

    it('refuses relative, empty, non-string and NUL-containing paths', async () => {
        const photos = await makeDir('photos');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        for (const bad of ['relative/x.jpg', '', 42, null, undefined, join(photos, 'a\0b')]) {
            expect(await store.resolveAllowed(bad)).toBeNull();
        }
    });

    it('refuses a link inside a granted folder that leads outside it', async () => {
        const photos = await makeDir('photos');
        const outside = await makeDir('outside');
        await writeFile(join(outside, 'secret.txt'), 'x');
        await symlink(outside, join(photos, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(join(photos, 'link', 'secret.txt'))).toBeNull();
    });

    it('allows a granted folder reached through a link (checks the target)', async () => {
        const real = await makeDir('real');
        const viaLink = join(tmp, 'via-link');
        await symlink(real, viaLink, process.platform === 'win32' ? 'junction' : 'dir');
        const store = createGrantStore({ storePath });
        await store.grant(viaLink);
        expect(await store.resolveAllowed(join(viaLink, 'a.jpg'))).not.toBeNull();
        expect(await store.resolveAllowed(join(real, 'a.jpg'))).not.toBeNull();
    });

    it.runIf(process.platform === 'win32')('compares case-insensitively on Windows', async () => {
        const photos = await makeDir('Photos');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(join(photos.toUpperCase(), 'NEW-CHILD', 'x.jpg'))).not.toBeNull();
    });

    it('persists grants atomically and reloads them in a new instance', async () => {
        const photos = await makeDir('photos');
        const a = createGrantStore({ storePath });
        await a.load();
        const res = await a.grant(photos);
        expect(res.persisted).toBe(true);
        await expect(access(storePath + '.tmp')).rejects.toThrow();
        const onDisk = JSON.parse(await readFile(storePath, 'utf-8'));
        expect(onDisk.version).toBe(GRANTS_VERSION);
        expect(onDisk.roots).toHaveLength(1);

        const b = createGrantStore({ storePath });
        expect((await b.load()).ok).toBe(true);
        expect(await b.resolveAllowed(join(photos, 'a.jpg'))).not.toBeNull();
    });

    it('de-duplicates a folder granted twice', async () => {
        const photos = await makeDir('photos');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        await store.grant(join(photos, '.'));
        expect(store.list()).toHaveLength(1);
    });

    it('fails closed on a corrupt store', async () => {
        const photos = await makeDir('photos');
        await mkdir(join(tmp, 'userData'), { recursive: true });
        await writeFile(storePath, 'not json');
        const store = createGrantStore({ storePath });
        expect((await store.load()).ok).toBe(false);
        expect(await store.resolveAllowed(join(photos, 'a.jpg'))).toBeNull();
    });

    it('fails closed on an unknown store version', async () => {
        const photos = await makeDir('photos');
        await mkdir(join(tmp, 'userData'), { recursive: true });
        await writeFile(storePath, JSON.stringify({ version: 99, roots: [{ path: photos, grantedAt: 1 }] }));
        const store = createGrantStore({ storePath });
        expect((await store.load()).ok).toBe(false);
        expect(await store.resolveAllowed(join(photos, 'a.jpg'))).toBeNull();
    });

    it('keeps an in-memory grant when the store cannot be written', async () => {
        const photos = await makeDir('photos');
        const blocker = join(tmp, 'blocker');
        await writeFile(blocker, 'a file, not a directory');
        const store = createGrantStore({ storePath: join(blocker, 'folder-grants.json') });
        const res = await store.grant(photos);
        expect(res.path).not.toBeNull();
        expect(res.persisted).toBe(false);
        expect(await store.resolveAllowed(join(photos, 'a.jpg'))).not.toBeNull();
    });

    it('serializes concurrent grants so both persist', async () => {
        const a = await makeDir('a');
        const b = await makeDir('b');
        const store = createGrantStore({ storePath });
        await Promise.all([store.grant(a), store.grant(b)]);
        const reloaded = createGrantStore({ storePath });
        await reloaded.load();
        expect(reloaded.list()).toHaveLength(2);
    });
});

describe('createTempDirRegistry', () => {
    it('tracks directories it was given and their direct children only', () => {
        const reg = createTempDirRegistry();
        const dir = join(tmpdir(), 'mv-keyframes-abc');
        reg.add(dir);
        expect(reg.has(dir)).toBe(true);
        expect(reg.isChildFile(join(dir, 'frame-001.png'))).toBe(true);
        expect(reg.isChildFile(join(dir, 'sub', 'frame-001.png'))).toBe(false);
        expect(reg.isChildFile(join(dir, '..', 'x.png'))).toBe(false);
        expect(reg.has(join(tmpdir(), 'mv-keyframes-other'))).toBe(false);
        reg.delete(dir);
        expect(reg.has(dir)).toBe(false);
        expect(reg.isChildFile(join(dir, 'frame-001.png'))).toBe(false);
    });

    it('rejects non-strings', () => {
        const reg = createTempDirRegistry();
        expect(reg.has(undefined)).toBe(false);
        expect(reg.isChildFile(42)).toBe(false);
    });
});

// Final-review fixes (G1): raw dot segments and drive-root containment. Paths are built by string
// concatenation on purpose — join() would normalize the segments away before the code sees them.
describe('dot segments and roots (final review I3, I4)', () => {
    const { isInsideDir, hasDotSegment } = require('../path-grants.js');
    const sep = require('path').sep;

    it('refuses a raw . or .. segment even when it would resolve inside a granted folder', async () => {
        const photos = await makeDir('photos');
        await makeDir('photos', 'sub');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(photos + sep + 'sub' + sep + '..' + sep + 'a.jpg')).toBeNull();
        expect(await store.resolveAllowed(photos + sep + '.' + sep + 'a.jpg')).toBeNull();
        expect(await store.resolveAllowed(photos + sep + 'a.jpg')).not.toBeNull(); // control
    });

    it('the temp registry refuses a child path with a raw .. segment', () => {
        const reg = createTempDirRegistry();
        const dir = join(tmpdir(), 'mv-keyframes-dots');
        reg.add(dir);
        expect(reg.isChildFile(dir + sep + 'x' + sep + '..' + sep + 'f.png')).toBe(false);
        expect(reg.isChildFile(dir + sep + 'f.png')).toBe(true); // control
    });

    it('hasDotSegment finds . and .. segments with either separator, and nothing else', () => {
        expect(hasDotSegment('C:\\a\\..\\b')).toBe(true);
        expect(hasDotSegment('/a/./b')).toBe(true);
        expect(hasDotSegment('/a/b..c/.d')).toBe(false);
        expect(hasDotSegment('\\\\server\\share\\x')).toBe(false);
    });

    it.runIf(process.platform === 'win32')('treats every path on a drive-root folder as inside it', () => {
        expect(isInsideDir('E:\\_Tier-1', 'E:\\')).toBe(true);
        expect(isInsideDir('E:\\_Tier-1\\a.jpg', 'E:\\')).toBe(true);
        expect(isInsideDir('F:\\_Tier-1', 'E:\\')).toBe(false);
    });

    it.runIf(process.platform !== 'win32')('treats every path under / as inside it', () => {
        expect(isInsideDir('/_Tier-1', '/')).toBe(true);
    });

    it('isInsideDir is boundary-aware and accepts the root itself', () => {
        const root = join(tmpdir(), 'photos');
        expect(isInsideDir(join(root, 'a.jpg'), root)).toBe(true);
        expect(isInsideDir(root, root)).toBe(true);
        expect(isInsideDir(join(tmpdir(), 'photos2', 'a.jpg'), root)).toBe(false);
    });
});

// Review M-a: a media file that is a link to somewhere outside every grant was refused for every
// operation, including a move, which renames the link entry and never touches its target.
// Review M-b: a granted folder whose drive is absent canonicalized to null and read as "denied",
// so the renderer asked the user to re-confirm it ("security update") on every launch.
describe('entry authorization and grant status (review M-a, M-b)', () => {
    const nodePath = require('path');

    it('resolveEntry accepts a file link inside a granted folder whose target is outside it', async (ctx) => {
        const photos = await makeDir('photos');
        const elsewhere = await makeDir('elsewhere');
        await writeFile(join(elsewhere, 'pic.png'), 'x');
        const link = join(photos, 'pic.png');
        try {
            await symlink(join(elsewhere, 'pic.png'), link, 'file');
        } catch (err) {
            if (err.code === 'EPERM') ctx.skip(); // Windows without Developer Mode
            throw err;
        }
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveAllowed(link)).toBeNull(); // the target is outside: unchanged
        expect(await store.resolveEntry(link)).not.toBeNull();
    });

    it('resolveEntry refuses an entry whose folder is outside every grant', async () => {
        const photos = await makeDir('photos');
        const other = await makeDir('other');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveEntry(join(other, 'a.jpg'))).toBeNull();
    });

    it('resolveEntry refuses a root, a dot segment and a relative path', async () => {
        const photos = await makeDir('photos');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.resolveEntry(nodePath.parse(photos).root)).toBeNull();
        expect(await store.resolveEntry(photos + nodePath.sep + '..' + nodePath.sep + 'x.jpg')).toBeNull();
        expect(await store.resolveEntry('relative/a.jpg')).toBeNull();
    });

    it('status reports granted and denied', async () => {
        const photos = await makeDir('photos');
        const other = await makeDir('other');
        const store = createGrantStore({ storePath });
        await store.grant(photos);
        expect(await store.status(join(photos, 'liked'))).toBe('granted');
        expect(await store.status(join(other, 'liked'))).toBe('denied');
    });

    it('status reports a path under a stored root that resolves nowhere (absent drive) as unreachable', async () => {
        const root = process.platform === 'win32' ? nodePath.join('Q:', nodePath.sep, 'Liked') : '/mnt/absent/Liked';
        const absentDrive = {
            readFile: async () => JSON.stringify({ version: GRANTS_VERSION, roots: [{ path: root, grantedAt: 1 }] }),
            realpath: async () => {
                const err = new Error('no such file or directory');
                err.code = 'ENOENT';
                throw err;
            },
        };
        const store = createGrantStore({ storePath, fs: absentDrive });
        await store.load();
        expect(await store.status(root)).toBe('unreachable');
        expect(await store.status(join(root, 'sub'))).toBe('unreachable');
        expect(await store.status(root + '2')).toBe('denied'); // boundary-aware, like containment
        expect(await store.resolveAllowed(root)).toBeNull(); // unreachable authorizes nothing
    });
});

// Commit security review (2026-10-11): containment compared paths after JS toLowerCase(), but NTFS
// decides name equality with its own upcase table. U+212A KELVIN SIGN lowercases to an ASCII 'k'
// in JS, yet NTFS keeps "\u212Aeys" and "keys" as two directories (measured: separate inodes), so
// a look-alike sibling of a granted folder read as inside it. Canonical paths come from native
// realpath, which returns the on-disk casing, so containment now compares them exactly.
describe('Unicode case-fold look-alikes (commit security review)', () => {
    const { isInsideDir } = require('../path-grants.js');
    const KELVIN_KEYS = '\u212Aeys'; // looks like, and JS-lowercases to, "keys"

    it('a look-alike sibling of a granted folder is outside it, whether or not it exists', async () => {
        const keys = await makeDir('keys');
        const store = createGrantStore({ storePath });
        await store.grant(keys);
        expect(await store.resolveAllowed(join(tmp, KELVIN_KEYS, 'x.png'))).toBeNull();
        await mkdir(join(tmp, KELVIN_KEYS), { recursive: true });
        expect(await store.resolveAllowed(join(tmp, KELVIN_KEYS, 'x.png'))).toBeNull();
        expect(await store.resolveAllowed(join(keys, 'x.png'))).not.toBeNull(); // control
    });

    it('isInsideDir does not equate a look-alike with the root', () => {
        expect(isInsideDir(join(tmp, KELVIN_KEYS, 'x.png'), join(tmp, 'keys'), process.platform)).toBe(false);
    });

    it('the temp-dir registry does not accept a look-alike of a tracked directory', () => {
        const reg = createTempDirRegistry();
        const tracked = join(tmp, 'mv-keyframes-abc');
        reg.add(tracked);
        const lookAlike = join(tmp, 'mv-\u212Aeyframes-abc');
        expect(reg.has(tracked)).toBe(true); // control
        expect(reg.has(lookAlike)).toBe(false);
        expect(reg.isChildFile(join(lookAlike, 'frame-001.png'))).toBe(false);
    });
});
