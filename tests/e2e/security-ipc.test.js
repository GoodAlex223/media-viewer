// G1 — main-process file IPC authorization (F2) and tournament-apply confinement (F6/F7).
// Every probe stays inside this test's own mkdtemp directories.
import { test, expect } from '@playwright/test';
import { access, mkdir, mkdtemp, rm, writeFile, readFile, cp, symlink, lstat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve, dirname, sep } from 'path';
import { execFileSync } from 'child_process';
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

    // Deep review #1 (pre-existing): fs.rename replaces an existing file on Windows, so liking a
    // second IMG_0001.jpg silently destroyed the first one already in the like folder.
    test('a move never replaces a same-named file at the destination', async () => {
        await cp(join(FIXTURES, 'green-1x1.png'), join(tmpFixtures.likeDir, 'red-1x1.png'));
        const before = await readFile(join(tmpFixtures.likeDir, 'red-1x1.png'));
        const res = await page.evaluate(
            ({ src, dir }) =>
                window.electronAPI.moveFile({ sourcePath: src, targetFolder: dir, fileName: 'red-1x1.png' }),
            { src: join(tmpFixtures.dir, 'red-1x1.png'), dir: tmpFixtures.likeDir }
        );
        expect(res.success).toBe(true);
        expect(res.targetPath).toBe(join(tmpFixtures.likeDir, 'red-1x1 (1).png'));
        expect(await readFile(join(tmpFixtures.likeDir, 'red-1x1.png'))).toEqual(before);
        await access(join(tmpFixtures.likeDir, 'red-1x1 (1).png'));
    });

    // Deep review #8: a cache file of chosen text could be renamed to any name under a grant.
    test('a move cannot give a non-media file a chosen name', async () => {
        const wrote = await page.evaluate(
            (d) => window.electronAPI.writeFolderCache(d, 'hash', 'not a hash'),
            tmpFixtures.dir
        );
        expect(wrote.success).toBe(true);
        const res = await page.evaluate(
            ({ src, dir }) => window.electronAPI.moveFile({ sourcePath: src, targetFolder: dir, fileName: 'x.url' }),
            { src: join(tmpFixtures.dir, '.hash_cache.json'), dir: tmpFixtures.likeDir }
        );
        expect(res.success).toBe(false);
        await expect(access(join(tmpFixtures.likeDir, 'x.url'))).rejects.toThrow();
        await access(join(tmpFixtures.dir, '.hash_cache.json'));
    });

    // Deep review #7: a refusal returned false, the same as "missing", so the renderer offered to
    // create a folder that exists, or auto-created one mid-pair.
    test('an existence check on a folder outside every grant is refused as null, not "missing"', async () => {
        expect(
            await page.evaluate((p) => window.electronAPI.checkFolderExists(p), join(outside, 'keep-dir'))
        ).toBeNull();
        expect(await page.evaluate((p) => window.electronAPI.checkFolderExists(p), tmpFixtures.likeDir)).toBe(true);
    });

    // Deep review #4: a pick main cannot grant used to look exactly like Cancel.
    test('a folder pick that cannot be granted tells the user instead of looking like Cancel', async () => {
        const ungrantable = [outside, '..', 'x'].join(sep); // a dot segment: canonicalize refuses it
        await electronApp.evaluate(({ dialog }, p) => {
            global.__mvMessageBoxes = [];
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
            dialog.showMessageBox = async (_win, opts) => {
                global.__mvMessageBoxes.push(opts);
                return { response: 0 };
            };
        }, ungrantable);
        expect(await page.evaluate(() => window.electronAPI.openFolderDialog())).toBeNull();
        const boxes = await electronApp.evaluate(() => global.__mvMessageBoxes);
        expect(boxes).toHaveLength(1);
        expect(boxes[0].message).toBe("This folder couldn't be opened");
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

    // Commit security review: the tier-folder link check compared realpaths after JS toLowerCase(),
    // which equates names NTFS keeps distinct (U+212A KELVIN SIGN vs 'k'), so a planted _Tier-N
    // junction into a look-alike sibling of the folder passed it and the files moved out.
    test('a _Tier-N junction into a look-alike sibling of the folder is refused', async () => {
        const keys = join(parent, 'keys');
        const lookAlike = join(parent, '\u212Aeys'); // NTFS keeps it apart from "keys"
        await mkdir(keys);
        await mkdir(join(lookAlike, '_Tier-1'), { recursive: true });
        await cp(join(FIXTURES, 'red-1x1.png'), join(keys, 'red-1x1.png'));
        await symlink(
            join(lookAlike, '_Tier-1'),
            join(keys, '_Tier-1'),
            process.platform === 'win32' ? 'junction' : 'dir'
        );
        await loadFolder(page, keys);
        const src = join(keys, 'red-1x1.png');
        const res = await page.evaluate(
            ([f, s]) => window.electronAPI.applyTournamentResults(f, { [s]: 1 }),
            [keys, src]
        );
        expect(res.success).toBe(false);
        await expect(access(src)).resolves.toBeUndefined();
        await expect(access(join(lookAlike, '_Tier-1', 'red-1x1.png'))).rejects.toThrow();
    });

    // Deep review #5: the _Tier-N link check folded the whole realpath, so in a case-sensitive tree
    // a junction into a sibling differing only by case passed and Apply moved the files out.
    test('in a case-sensitive tree, a _Tier-N junction into a case-variant sibling is refused', async () => {
        const cs = join(parent, 'cs');
        await mkdir(cs);
        try {
            execFileSync('fsutil.exe', ['file', 'setCaseSensitiveInfo', cs, 'enable'], { stdio: 'ignore' });
        } catch {
            test.skip(true, 'needs the per-directory case-sensitivity feature (Windows)');
        }
        const Photos = join(cs, 'Photos');
        const photos = join(cs, 'photos');
        await mkdir(Photos);
        await mkdir(join(photos, '_Tier-1'), { recursive: true });
        await cp(join(FIXTURES, 'red-1x1.png'), join(Photos, 'red-1x1.png'));
        await symlink(join(photos, '_Tier-1'), join(Photos, '_Tier-1'), 'junction');
        await loadFolder(page, Photos);
        const src = join(Photos, 'red-1x1.png');
        const res = await page.evaluate(
            ([f, s]) => window.electronAPI.applyTournamentResults(f, { [s]: 1 }),
            [Photos, src]
        );
        expect(res.success).toBe(false);
        await expect(access(src)).resolves.toBeUndefined();
        await expect(access(join(photos, '_Tier-1', 'red-1x1.png'))).rejects.toThrow();
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
