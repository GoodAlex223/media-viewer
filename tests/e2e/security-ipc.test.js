// G1 — main-process file IPC authorization (F2) and tournament-apply confinement (F6/F7).
// Every probe stays inside this test's own mkdtemp directories.
import { test, expect } from '@playwright/test';
import { access, mkdir, mkdtemp, rm, writeFile, readFile, cp, symlink, lstat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp, loadFolder, createTempFixtureDir } from './helpers/electron-app.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

let electronApp;
let page;
let tmpFixtures;
let outside;

test.beforeEach(async () => {
    tmpFixtures = await createTempFixtureDir();
    outside = await mkdtemp(join(tmpdir(), 'mv-e2e-outside-'));
    await writeFile(join(outside, 'note.txt'), 'not for the app');
    await mkdir(join(outside, 'keep-dir'));
    ({ electronApp, page } = await launchApp());
    await loadFolder(page, tmpFixtures.dir);
});

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (tmpFixtures) {
        await tmpFixtures.cleanup();
    }
    if (outside) {
        await rm(outside, { recursive: true, force: true });
    }
});

test.describe('G1 F2 — file IPC is confined to granted folders', () => {
    test('control: a file in the granted folder is still reachable', async () => {
        const exists = await page.evaluate(
            (p) => window.electronAPI.checkFileExists(p),
            join(tmpFixtures.dir, 'red-1x1.png')
        );
        expect(exists).toBe(true);
    });

    // The one production grant site (review M-d): mockFolderDialog replaces the whole handler and
    // grants by itself, so without this test deleting main's grant call would leave the suite
    // green. Only Electron's native dialog is stubbed here; the real guarded handler runs.
    test('a pick in the real folder dialog grants the folder', async () => {
        const probe = join(outside, 'note.txt');
        expect(await page.evaluate((p) => window.electronAPI.checkFileExists(p), probe)).toBe(false);

        await electronApp.evaluate(({ dialog }, dir) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
        }, outside);
        expect(await page.evaluate(() => window.electronAPI.openFolderDialog())).toBe(outside);

        expect(await page.evaluate((p) => window.electronAPI.checkFileExists(p), probe)).toBe(true);
    });

    // Review M-a: a media file that is a link to somewhere outside every grant. A move renames the
    // link entry (its target never moves), so it is authorized by the folder holding the entry; a
    // content read follows the link only to a media file.
    async function plantLink(target, name) {
        const link = join(tmpFixtures.dir, name);
        try {
            await symlink(target, link, 'file');
        } catch (err) {
            test.skip(err.code === 'EPERM', 'file symlinks need Developer Mode on Windows');
            throw err;
        }
        return link;
    }

    test('a symlinked media file pointing outside the folder can be checked, read and moved', async () => {
        await cp(join(FIXTURES, 'red-1x1.png'), join(outside, 'real.png'));
        const link = await plantLink(join(outside, 'real.png'), 'linked.png');

        expect(await page.evaluate((p) => window.electronAPI.checkFileExists(p), link)).toBe(true);
        const bytes = await page.evaluate(async (p) => {
            const b = await window.electronAPI.readFileBuffer(p);
            return b ? b.byteLength : null;
        }, link);
        expect(bytes).toBeGreaterThan(0);
        const res = await page.evaluate(
            ({ src, dir }) =>
                window.electronAPI.moveFile({ sourcePath: src, targetFolder: dir, fileName: 'linked.png' }),
            { src: link, dir: tmpFixtures.likeDir }
        );
        expect(res.success).toBe(true);
        expect((await lstat(join(tmpFixtures.likeDir, 'linked.png'))).isSymbolicLink()).toBe(true);
        await access(join(outside, 'real.png')); // the target never moved
    });

    test('a planted link to a non-media file is still refused for reading', async () => {
        const link = await plantLink(join(outside, 'note.txt'), 'planted.png');
        expect(await page.evaluate((p) => window.electronAPI.readFileBuffer(p), link)).toBeNull();
    });

    test('reading bytes outside every granted folder is refused', async () => {
        const result = await page.evaluate((p) => window.electronAPI.readFileBuffer(p), join(outside, 'note.txt'));
        expect(result).toBeNull();
    });

    test('an existence check outside every granted folder reports false', async () => {
        const exists = await page.evaluate((p) => window.electronAPI.checkFileExists(p), join(outside, 'note.txt'));
        expect(exists).toBe(false);
    });

    test('creating a folder outside every granted folder is refused and creates nothing', async () => {
        const res = await page.evaluate((p) => window.electronAPI.createFolder(p), join(outside, 'made'));
        expect(res.success).toBe(false);
        await expect(access(join(outside, 'made'))).rejects.toThrow();
    });

    test('removing a directory main did not create is refused', async () => {
        const res = await page.evaluate((p) => window.electronAPI.cleanupKeyframes(p), join(outside, 'keep-dir'));
        expect(res.success).toBe(false);
        await expect(access(join(outside, 'keep-dir'))).resolves.toBeUndefined();
    });

    test('moving a file into a folder that was never granted is refused', async () => {
        const src = join(tmpFixtures.dir, 'red-1x1.png');
        const res = await page.evaluate(
            ([s, t]) => window.electronAPI.moveFile({ sourcePath: s, targetFolder: t, fileName: 'red-1x1.png' }),
            [src, outside]
        );
        expect(res.success).toBe(false);
        await expect(access(src)).resolves.toBeUndefined();
    });
});

test.describe('G1 F6/F7 — tournament apply stays inside the folder', () => {
    let parent;
    let folder;

    test.beforeEach(async () => {
        parent = await mkdtemp(join(tmpdir(), 'mv-e2e-apply-'));
        folder = join(parent, 'media');
        await mkdir(folder);
        await cp(join(FIXTURES, 'red-1x1.png'), join(folder, 'red-1x1.png'));
        await cp(join(FIXTURES, 'red-1x1.png'), join(parent, 'sibling.png'));
        await loadFolder(page, folder);
    });

    test.afterEach(async () => {
        if (parent) {
            await rm(parent, { recursive: true, force: true });
        }
    });

    test('a non-integer tier is refused and nothing is created or moved', async () => {
        const src = join(folder, 'red-1x1.png');
        const res = await page.evaluate(
            ([f, s]) => window.electronAPI.applyTournamentResults(f, { [s]: 'x/../../escaped' }),
            [folder, src]
        );
        expect(res.success).toBe(false);
        await expect(access(join(parent, 'escaped'))).rejects.toThrow();
        await expect(access(src)).resolves.toBeUndefined();
    });

    test('a file that is not a direct child of the folder is refused', async () => {
        const res = await page.evaluate(
            ([f, s]) => window.electronAPI.applyTournamentResults(f, { [s]: 1 }),
            [folder, join(parent, 'sibling.png')]
        );
        expect(res.success).toBe(false);
        await expect(access(join(parent, 'sibling.png'))).resolves.toBeUndefined();
        await expect(access(join(folder, '_Tier-1'))).rejects.toThrow();
    });

    // Found by the claude-security patch review: mkdir(recursive) succeeds silently on an existing
    // _Tier-N, and rename follows it if it is a link. The link here points at a sibling directory
    // inside this test's own temp parent.
    test('a pre-existing _Tier-N link is refused and nothing moves through it', async () => {
        const elsewhere = join(parent, 'elsewhere');
        await mkdir(elsewhere);
        await symlink(elsewhere, join(folder, '_Tier-1'), process.platform === 'win32' ? 'junction' : 'dir');
        const src = join(folder, 'red-1x1.png');
        const res = await page.evaluate(
            ([f, s]) => window.electronAPI.applyTournamentResults(f, { [s]: 1 }),
            [folder, src]
        );
        expect(res.success).toBe(false);
        await expect(access(src)).resolves.toBeUndefined();
        await expect(access(join(elsewhere, 'red-1x1.png'))).rejects.toThrow();
    });

    test('control: a valid apply still moves the file into _Tier-N', async () => {
        const src = join(folder, 'red-1x1.png');
        const res = await page.evaluate(
            ([f, s]) => window.electronAPI.applyTournamentResults(f, { [s]: 2 }),
            [folder, src]
        );
        expect(res.success).toBe(true);
        await expect(access(join(folder, '_Tier-2', 'red-1x1.png'))).resolves.toBeUndefined();
    });
});

// Final review I2: main joins a fixed file name onto a granted folder, but the file at that name
// can itself be a link out of the folder. Each probe links to a file in this test's own `outside`
// temp directory. File symlinks on Windows need Developer Mode; without it the test skips.
test.describe('G1 F2 — a fixed-name file that is a link is not followed', () => {
    async function plantFileLink(linkPath, target) {
        try {
            await symlink(target, linkPath, 'file');
            return true;
        } catch (err) {
            if (err.code === 'EPERM') {
                return false;
            }
            throw err;
        }
    }

    test('reading a folder cache through a planted link is refused', async () => {
        const target = join(outside, 'note.txt');
        const planted = await plantFileLink(join(tmpFixtures.dir, '.sort_cache.json'), target);
        test.skip(!planted, 'file symlinks need Developer Mode on Windows');
        const data = await page.evaluate((f) => window.electronAPI.readFolderCache(f, 'sort'), tmpFixtures.dir);
        expect(data).toBeNull();
    });

    test('writing a folder cache through a planted link is refused and the target is unchanged', async () => {
        const target = join(outside, 'note.txt');
        const planted = await plantFileLink(join(tmpFixtures.dir, '.hash_cache.json'), target);
        test.skip(!planted, 'file symlinks need Developer Mode on Windows');
        const res = await page.evaluate((f) => window.electronAPI.writeFolderCache(f, 'hash', '{}'), tmpFixtures.dir);
        expect(res.success).toBe(false);
        expect(await readFile(target, 'utf-8')).toBe('not for the app');
    });

    test('a saved-state write through a planted temp-file link is refused and the target is unchanged', async () => {
        const target = join(outside, 'note.txt');
        const planted = await plantFileLink(join(tmpFixtures.dir, '.tournament_state.json.tmp'), target);
        test.skip(!planted, 'file symlinks need Developer Mode on Windows');
        const res = await page.evaluate(
            (f) => window.electronAPI.writeTournamentState(f, { version: 2 }),
            tmpFixtures.dir
        );
        expect(res.success).toBe(false);
        expect(await readFile(target, 'utf-8')).toBe('not for the app');
    });
});
