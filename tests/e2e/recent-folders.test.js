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
    waitForNotification,
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
        const b = await makeFolder('Liked_3');
        const c = await makeFolder('Clips');
        await openFolders(a, b, c);
        await restart();
        await mockFolderDialog(electronApp, a);
        await page.locator('#recentFoldersDrop .recent-folders-heading').click();
        await page.waitForTimeout(300); // a dialog the click asked for would have been counted by now
        expect(await dialogCalls()).toBe(0);
        await expect(page.locator('#dropZone')).toBeVisible();

        // A ✕ re-renders the list before its click reaches the drop zone, so the click's target is already
        // detached there: still not a click on the drop zone (G4 final review F2).
        await page
            .locator('#recentFoldersDrop .recent-folder-row')
            .filter({ hasText: 'Clips' })
            .locator('.recent-folder-remove')
            .click();
        await expect(dropRows()).toHaveCount(2);
        await page.waitForTimeout(300);
        expect(await dialogCalls()).toBe(0);

        // Document click listeners see list clicks: G2 F5's blur leaves no clicked button holding keyboard focus,
        // even while a row's check runs (seconds on a slow share). Main answers slowly and 'unreachable', so the
        // drop zone stays.
        await electronApp.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler('get-grant-status');
            ipcMain.handle('get-grant-status', async (_e, paths) => {
                await new Promise((r) => setTimeout(r, 1500));
                return paths.map(() => 'unreachable');
            });
        });
        await dropRows().filter({ hasText: 'Liked_3' }).click();
        const during = await page.evaluate(() => ({
            checking: window.mediaViewer._recentOpenInFlight,
            focusedListButton:
                document.activeElement?.tagName === 'BUTTON' &&
                document.getElementById('recentFoldersDrop').contains(document.activeElement),
        }));
        expect(during).toEqual({ checking: true, focusedListButton: false });
        await waitForNotification(page, '"Liked_3" is on a drive that isn\'t connected');
        expect(await dialogCalls()).toBe(0);
        await expect(page.locator('#dropZone')).toBeVisible();
        // Control: the drop zone outside the list still opens the dialog.
        await page.locator('#dropZone .drop-title').click();
        await expect.poll(dialogCalls).toBe(1);
    });

    test('at the minimum window size all 8 rows stay reachable: the list scrolls inside its bound', async () => {
        // G4 final review F5. Rendering asks main nothing, so these folders need not exist.
        const entries = Array.from({ length: 8 }, (_, i) => ({
            path: join(root, `Folder ${i + 1}`),
            openedAt: 8 - i,
        }));
        await page.evaluate(
            (list) => localStorage.setItem('recentFolders', JSON.stringify({ version: 1, entries: list })),
            entries
        );
        const minimum = await electronApp.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows()[0];
            const [w, h] = win.getMinimumSize();
            win.setSize(w, h);
            return [w, h];
        });
        expect(minimum).toEqual([800, 600]); // main.js: minWidth 800, minHeight 600
        await restart();
        await page.waitForFunction(() => window.innerHeight < 600);
        // E2E stubs Lucide, so the drop zone has no folder icon: stand in the production 64 px svg
        // (styles.css .drop-icon svg), or the overflow would be hidden.
        await page.evaluate(() => {
            const icon = document.querySelector('#dropZone .drop-icon');
            icon.replaceChildren(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
        });
        expect(await dropRows().count()).toBe(8);
        const geo = await page.evaluate(() => {
            const r = (sel) => document.querySelector(sel).getBoundingClientRect();
            return {
                innerHeight: window.innerHeight,
                icon: r('#dropZone .drop-icon'),
                title: r('#dropZone .drop-title'),
                list: r('#recentFoldersDrop .recent-folders-list'),
                row: r('#recentFoldersDrop .recent-folder-row'),
            };
        });
        expect(geo.icon.height).toBeGreaterThanOrEqual(64);
        expect(geo.icon.top).toBeGreaterThanOrEqual(0); // the overflow cut the icon first, then the title
        expect(geo.title.top).toBeGreaterThanOrEqual(0);
        expect(geo.list.bottom).toBeLessThanOrEqual(geo.innerHeight);
        // The 8th row's ✕ is reachable by the list's own scroll — the page itself never scrolls.
        const hit = await page.evaluate(() => {
            const rows = document.querySelectorAll('#recentFoldersDrop .recent-folder-row');
            const remove = rows[7].querySelector('.recent-folder-remove');
            remove.scrollIntoView({ block: 'nearest' });
            const box = remove.getBoundingClientRect();
            return {
                hit: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === remove,
                pageScroll: document.scrollingElement.scrollTop,
                listScroll: document.querySelector('#recentFoldersDrop .recent-folders-list').scrollTop,
            };
        });
        expect(hit.hit).toBe(true);
        expect(hit.pageScroll).toBe(0);
        expect(hit.listScroll).toBeGreaterThan(0);

        const listScroll = () =>
            page.evaluate(() => document.querySelector('#recentFoldersDrop .recent-folders-list').scrollTop);
        const scrollListToTop = () =>
            page.evaluate(() => {
                document.querySelector('#recentFoldersDrop .recent-folders-list').scrollTop = 0;
            });
        // A mouse wheel over the list scrolls it natively: with no folder open, the document wheel handler
        // returns before its preventDefault.
        await scrollListToTop();
        const listBox = await page.locator('#recentFoldersDrop .recent-folders-list').boundingBox();
        await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
        await page.mouse.wheel(0, 200);
        await expect.poll(listScroll).toBeGreaterThan(0);
        // Tab reaches the 8th row and the browser scrolls it into view: nothing prevents Tab with no folder open.
        await scrollListToTop();
        await dropRows().first().focus();
        for (let i = 0; i < 14; i++) {
            await page.keyboard.press('Tab'); // each row: its folder button, then its ✕
        }
        await expect(dropRows().nth(7)).toBeFocused();
        const seen = await page.evaluate(() => {
            const item = document.querySelectorAll('#recentFoldersDrop .recent-folder-item')[7];
            const box = item.getBoundingClientRect();
            return {
                hit:
                    document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('button') ===
                    item,
                pageScroll: document.scrollingElement.scrollTop,
            };
        });
        expect(seen.hit).toBe(true);
        expect(seen.pageScroll).toBe(0);
        expect(await listScroll()).toBeGreaterThan(0);
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

        // A wheel with the pointer off the menu, over the page margin — not over media, where the wheel zooms
        // (G4 final review F6). Moving there is no pointerdown, so the menu stays open.
        const margin = await page.evaluate(() => {
            const p = { x: 8, y: window.innerHeight - 8 };
            const el = document.elementFromPoint(p.x, p.y);
            return {
                ...p,
                offMenu: !document.getElementById('recentFoldersMenu').contains(el),
                offMedia: !el.classList.contains('media-display') && !el.closest('.media-wrapper'),
            };
        });
        expect(margin).toMatchObject({ offMenu: true, offMedia: true });
        await page.mouse.move(margin.x, margin.y);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(500); // past the wheel debounce
        await expect(page.locator('#recentFoldersMenu')).toBeVisible();
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).toBe(0);

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

test.describe('G4 recent folders — opening one', () => {
    test('from the drop zone: it opens without the dialog, and moves to the front', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await mockFolderDialog(electronApp, b);
        await dropRows().filter({ hasText: 'Wallpapers' }).click();
        await waitForMedia(page);
        expect(await page.evaluate(() => window.mediaViewer.baseFolderPath)).toBe(a);
        expect(await dialogCalls()).toBe(0);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentFolders')).entries[0].path)).toBe(a);
    });

    test('from the header menu: it switches folders without the dialog, even from a playing video (Review Focus 4)', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Clips', ['playable-64x64.mp4']);
        await openFolders(a, b);
        await mockFolderDialog(electronApp, a);
        expect(await page.evaluate(() => window.mediaViewer.currentMedia?.tagName)).toBe('VIDEO');
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await page.locator('#recentFoldersMenu .recent-folder-item').filter({ hasText: 'Wallpapers' }).click();
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
        await page.waitForFunction((dir) => window.mediaViewer.baseFolderPath === dir, a);
        await waitForMedia(page);
        await waitForIdle();
        expect(await page.evaluate(() => window.mediaViewer.currentMedia?.tagName)).toBe('IMG');
        expect(await dialogCalls()).toBe(0);
        await expect(page.locator('.notification.error')).toHaveCount(0);
    });

    test('a folder that no longer exists is removed with a notice, and no dialog opens', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await rm(b, { recursive: true, force: true });
        await mockFolderDialog(electronApp, a);
        await dropRows().filter({ hasText: 'Liked_3' }).click();
        await waitForNotification(page, '"Liked_3" no longer exists — removed from recent folders');
        expect(await dropNames()).toEqual(['Wallpapers']);
        await expect(page.locator('#dropZone')).toBeVisible();
        expect(await dialogCalls()).toBe(0);
    });

    test('a folder chosen while a slow check runs is not replaced when the check answers', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        // Main answers the click-time status query slowly, as an offline share (~21 s) or a waking NAS would
        // (G4 final review F1). The replaced handler lives only for this launch.
        await electronApp.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler('get-grant-status');
            ipcMain.handle('get-grant-status', async (_e, paths) => {
                await new Promise((r) => setTimeout(r, 1500));
                return paths.map(() => true);
            });
        });
        await mockFolderDialog(electronApp, b);
        await dropRows().filter({ hasText: 'Wallpapers' }).click();
        // The check is in flight: the row says so, and the rest of the drop zone stays live.
        await expect(dropRows().filter({ hasText: 'Wallpapers' }).locator('.recent-folder-path')).toHaveText(
            'Checking…'
        );
        await page.locator('#dropZone .drop-title').click();
        await page.waitForFunction((dir) => window.mediaViewer.baseFolderPath === dir, b);
        await waitForMedia(page);
        expect(await dialogCalls()).toBe(1);
        // Past the slow answer: the check has finished, and its stale 'open' did nothing.
        await page.waitForTimeout(2000);
        expect(await page.evaluate(() => window.mediaViewer._recentOpenInFlight)).toBe(false);
        expect(await page.evaluate(() => window.mediaViewer.baseFolderPath)).toBe(b);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentFolders')).entries[0].path)).toBe(b);
    });

    test('a folder main has not granted reopens through the dialog, opened at that folder', async () => {
        const c = await makeFolder('Liked_1'); // never granted: each launch starts with an empty grant store
        await page.evaluate(
            (dir) =>
                localStorage.setItem(
                    'recentFolders',
                    JSON.stringify({ version: 1, entries: [{ path: dir, openedAt: Date.now() }] })
                ),
            c
        );
        await restart();
        await mockFolderDialog(electronApp, c);
        await dropRows().first().click();
        await waitForNotification(page, 'Confirm "Liked_1" — press Select Folder (security update)');
        await waitForMedia(page);
        expect(await electronApp.evaluate(() => global.__mvLastDialogDefaultPath)).toBe(c);
        expect(await dialogCalls()).toBe(1);
        expect(await page.evaluate(() => window.mediaViewer.baseFolderPath)).toBe(c);
    });
});

// D3: the same Save & leave / Discard / Cancel prompt as Escape. Started the way tournament-mode.test.js does.
async function startTournament() {
    await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
    await expect(page.locator('#tournamentConfigModal')).toBeVisible();
    await page.locator('#tournamentRoundsSelect').fill('2');
    await page.locator('#tournamentConfigStart').click();
    await page.waitForFunction(() => window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine);
    await page.waitForFunction(() => !window.mediaViewer._tournamentRenderLoop && !window.mediaViewer.isLoading);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
}

async function pickOnce() {
    await page.keyboard.press('q');
    await page.waitForFunction(
        () => window.mediaViewer.tournament.engine.history.filter((e) => (e.kind ?? 'pick') !== 'prune').length === 1
    );
}

async function chooseFromMenu(name) {
    await revealHeader();
    await page.locator('#recentFoldersBtn').click();
    await page.locator('#recentFoldersMenu .recent-folder-item').filter({ hasText: name }).click();
}

test.describe('G4 recent folders — leaving an unfinished tournament (D3)', () => {
    test('a switch from the menu asks first; Cancel stays in the tournament, in this folder', async () => {
        const other = await makeFolder('Wallpapers');
        const here = await makeFolder('Liked_3', ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        await openFolders(other, here);
        await startTournament();
        await pickOnce();
        await chooseFromMenu('Wallpapers');
        await expect(page.locator('#tournamentResumeModal')).toBeVisible();
        await expect(page.locator('#tournamentResumeTitle')).toHaveText('Leave tournament?');
        await page.locator('#tournamentResumeCancel').click();
        await expect(page.locator('#tournamentResumeModal')).toBeHidden();
        expect(
            await page.evaluate(() => ({
                tournament: window.mediaViewer.isTournamentMode,
                engine: window.mediaViewer.tournament.engine !== null,
                folder: window.mediaViewer.baseFolderPath,
            }))
        ).toEqual({ tournament: true, engine: true, folder: here });
    });

    test('Save & leave writes the last pick, then switches', async () => {
        const other = await makeFolder('Wallpapers');
        const here = await makeFolder('Liked_3', ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        await openFolders(other, here);
        await startTournament();
        await pickOnce();
        // Before D3 this pick was never written on a fast switch: loadFolder dropped the engine, and the debounced
        // write skips itself once the engine is gone. The pick's 500 ms write is still queued here; cancelling its
        // timer leaves Save & leave's flush as the only thing that can write it, however long the clicks below take.
        // flush() marks the state dirty itself (tournament.js), so it still writes. serialize() stamps lastUpdatedAt
        // with the time of the call and the flush rewrites it: compare everything but that stamp. The pick itself
        // (gamesPlayed, playedPairs, winCounts) must match.
        const snap = await page.evaluate(() => {
            const t = window.mediaViewer.tournament;
            const pending = t._persistTimer !== null;
            clearTimeout(t._persistTimer);
            t._persistTimer = null;
            const { lastUpdatedAt: _stamp, ...rest } = t.engine.serialize();
            return { expected: rest, pending };
        });
        const readOnDisk = () =>
            page.evaluate(async (dir) => {
                const { lastUpdatedAt: _stamp, ...rest } = (await window.electronAPI.readTournamentState(dir)).state;
                return rest;
            }, here);
        expect(snap.pending).toBe(true); // the pick's write had not been drained
        expect(snap.expected.gamesPlayed).toBe(1);
        expect((await readOnDisk()).gamesPlayed).toBe(0); // the start's flush wrote the initial state; nothing since
        await chooseFromMenu('Wallpapers');
        await page.locator('#tournamentResumeAccept').click();
        await page.waitForFunction(
            (dir) => window.mediaViewer.baseFolderPath === dir && !window.mediaViewer.isTournamentMode,
            other
        );
        await waitForMedia(page);
        expect(await readOnDisk()).toEqual(snap.expected);
    });
});
