// G4 recently opened folders (spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md § 9.2).
// Every folder lives under this test's own mkdtemp root. A "restart" is a page reload: the renderer's
// constructor runs again over the same localStorage, and main keeps its grants.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    mockFolderDialog,
    seedLocalStorage,
} from './helpers/electron-app.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

let electronApp;
let page;
let root;

test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mv-e2e-recent-'));
    ({ electronApp, page } = await launchApp());
});

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (root) {
        await rm(root, { recursive: true, force: true });
        root = undefined;
    }
});

/** A folder named `name` under this test's root, holding the named fixtures. */
async function makeFolder(name, files = ['red-1x1.png']) {
    const dir = join(root, name);
    await mkdir(dir, { recursive: true });
    for (const f of files) {
        await cp(join(FIXTURES, f), join(dir, f));
    }
    return dir;
}

async function waitForIdle() {
    await page.waitForFunction(
        () =>
            !window.mediaViewer.isLoading &&
            !window.mediaViewer.mediaNavigationInProgress &&
            !window.mediaViewer._fileOpInFlight
    );
}

/** Open each folder in turn, as the user would one after another (each is granted, as a dialog pick would be). */
async function openFolders(...dirs) {
    for (const dir of dirs) {
        await loadFolder(page, dir);
        await waitForMedia(page);
        await waitForIdle();
    }
}

async function restart() {
    await page.reload();
    await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined');
}

const dialogCalls = () => electronApp.evaluate(() => global.__mvDialogCalls ?? 0);
const dropRows = () => page.locator('#recentFoldersDrop .recent-folder-item');
const dropNames = () => page.locator('#recentFoldersDrop .recent-folder-name').allTextContents();
const revealHeader = () => page.evaluate(() => document.querySelector('.header').classList.add('show'));
const menuNames = () => page.locator('#recentFoldersMenu .recent-folder-name').allTextContents();

test.describe('G4 recent folders — the drop-zone list', () => {
    test('a first launch shows no list', async () => {
        await expect(page.locator('#dropZone')).toBeVisible();
        await expect(page.locator('#recentFoldersDrop')).toBeHidden();
    });

    test('a folder that showed media is listed after a restart, newest first', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await expect(page.locator('#recentFoldersDrop')).toBeVisible();
        expect(await dropNames()).toEqual(['Liked_3', 'Wallpapers']);
        await expect(dropRows().first()).toHaveAttribute('title', b);
        await expect(page.locator('#recentFoldersDrop .recent-folder-path').first()).toHaveText(b);
    });

    test('✕ removes a folder from the list and from storage', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await page.locator('#recentFoldersDrop .recent-folder-remove').first().click();
        expect(await dropNames()).toEqual(['Wallpapers']);
        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('recentFolders')).entries.map((e) => e.path)
        );
        expect(stored).toEqual([a]);
        await page.locator('#recentFoldersDrop .recent-folder-remove').first().click();
        await expect(page.locator('#recentFoldersDrop')).toBeHidden();
    });

    test('a folder name is shown as text, never parsed as markup', async () => {
        // Windows forbids < and > in names; an innerHTML render would show this entity as "a&b".
        const odd = await makeFolder('a&amp;b');
        await openFolders(odd);
        await restart();
        expect(await dropNames()).toEqual(['a&amp;b']);
    });

    test('a long folder name stays inside its row (Review Focus 2)', async () => {
        const long = await makeFolder('L'.repeat(100));
        await openFolders(long);
        await restart();
        const fits = await page.evaluate(() => {
            const list = document.querySelector('#recentFoldersDrop .recent-folders-list').getBoundingClientRect();
            const remove = document.querySelector('#recentFoldersDrop .recent-folder-remove').getBoundingClientRect();
            return remove.right <= list.right + 0.5;
        });
        expect(fits).toBe(true);
    });

    test('clicking the list is not a click on the drop zone', async () => {
        const a = await makeFolder('Wallpapers');
        await openFolders(a);
        await restart();
        await mockFolderDialog(electronApp, a);
        await page.locator('#recentFoldersDrop .recent-folders-heading').click();
        expect(await dialogCalls()).toBe(0);
        await expect(page.locator('#dropZone')).toBeVisible();
        // Control: the drop zone outside the list still opens the dialog.
        await page.locator('#dropZone .drop-title').click();
        await expect.poll(dialogCalls).toBe(1);
    });
});

test.describe('G4 recent folders — the header menu', () => {
    test('the ▾ button is disabled while the only recent folder is the one on screen', async () => {
        const a = await makeFolder('Wallpapers');
        await openFolders(a);
        await expect(page.locator('#recentFoldersBtn')).toBeVisible();
        await expect(page.locator('#recentFoldersBtn')).toBeDisabled();
        await expect(page.locator('#recentFoldersBtn')).toHaveAttribute('title', 'No other recent folders');
    });

    test('the menu lists the other folders, the one on screen marked current; a click outside closes it', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await expect(page.locator('#recentFoldersMenu')).toBeVisible();
        expect(await menuNames()).toEqual(['Liked_3', 'Wallpapers']);
        const items = page.locator('#recentFoldersMenu .recent-folder-item');
        await expect(items.nth(0)).toBeDisabled();
        await expect(items.nth(0).locator('.recent-folder-current')).toHaveText('current');
        await expect(items.nth(1)).toBeEnabled();
        await expect(items.nth(1)).toBeFocused();
        await page.locator('#folderInfo').click();
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
    });

    test('✕ in the menu removes a folder; with nothing else left the menu closes', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await page.locator('#recentFoldersMenu .recent-folder-remove').nth(1).click();
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
        await expect(page.locator('#recentFoldersBtn')).toBeDisabled();
        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('recentFolders')).entries.map((e) => e.path)
        );
        expect(stored).toEqual([b]);
    });

    test('while the menu is open a rating key moves nothing, a wheel changes nothing, and Escape closes it (Review Focus 5)', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3', ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        const likeDir = join(root, 'liked');
        const dislikeDir = join(root, 'disliked');
        await mkdir(likeDir);
        await mkdir(dislikeDir);
        // Both folders: a rating with only one configured is refused ("Configure like/dislike folders"), which
        // would make the key-swallowed assertions below pass without the menu and the control press fail.
        await seedLocalStorage(page, { customLikeFolder: likeDir, customDislikeFolder: dislikeDir });
        await openFolders(a, b);
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await expect(page.locator('#recentFoldersMenu')).toBeVisible();

        await page.keyboard.press('q');
        const box = await page.locator('#recentFoldersMenu').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(500); // past the wheel debounce and a move's first await
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).toBe(0);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
        expect(await readdir(likeDir)).toEqual([]);

        await page.keyboard.press('Escape');
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
        expect(await page.evaluate(() => window.mediaViewer.isCompareMode || window.mediaViewer.isTournamentMode)).toBe(
            false
        );

        // Control: with the menu closed, the same key moves the file.
        await page.keyboard.press('q');
        await expect.poll(() => readdir(likeDir)).toHaveLength(1);
    });

    test('the header stays visible while the menu is open, past the auto-hide delay', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        const btn = await page.locator('#recentFoldersBtn').boundingBox();
        await page.mouse.move(btn.x + btn.width / 2, 10); // the top band: the header's own show(), which arms its 3 s hide
        await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
        await expect(page.locator('#recentFoldersMenu')).toBeVisible();
        const row = await page.locator('#recentFoldersMenu .recent-folder-item').nth(1).boundingBox();
        const pt = { x: row.x + row.width / 2, y: row.y + row.height / 2 };
        await page.mouse.move(pt.x, pt.y); // resting in the menu, below the band
        await page.waitForTimeout(4000); // the 3 s hide plus its opacity transition
        const state = await page.evaluate(
            (p) => ({
                opacity: getComputedStyle(document.querySelector('.header')).opacity,
                hit: document.elementFromPoint(p.x, p.y)?.closest('.recent-folder-item') != null,
            }),
            pt
        );
        expect(state).toEqual({ opacity: '1', hit: true });
    });
});
