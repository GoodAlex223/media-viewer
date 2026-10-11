// G1 re-pick — a like/dislike/special folder saved before main kept a grant list must be picked
// again once, and until then every file action on it is refused up front: before any media is
// torn down, and never through the folder-creation prompt (review C1). Every probe stays inside
// this test's own mkdtemp directories.
import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    seedLocalStorage,
    grantFolder,
    mockFolderDialog,
    createTempFixtureDir,
} from './helpers/electron-app.js';

const SUFFIX = ' — folder needs re-confirming (F1)';
const moveNotice = (list) => `Re-confirm your ${list} folder in Settings (F1) before moving files there`;

let electronApp;
let page;
let tmpFixtures;
let saved; // the saved folders live OUTSIDE the source folder, so loading it grants none of them

test.beforeEach(async () => {
    saved = await mkdtemp(join(tmpdir(), 'mv-e2e-saved-'));
    for (const name of ['liked', 'disliked', 'special']) {
        await mkdir(join(saved, name));
    }
    ({ electronApp, page } = await launchApp());
});

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (tmpFixtures) {
        await tmpFixtures.cleanup();
        tmpFixtures = undefined;
    }
    if (saved) {
        await rm(saved, { recursive: true, force: true });
    }
});

async function openSource(names) {
    tmpFixtures = await createTempFixtureDir(names);
    await loadFolder(page, tmpFixtures.dir);
    await waitForMedia(page);
    await waitForIdle();
}

async function waitForIdle() {
    await page.waitForFunction(() => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress);
}

const marks = () => page.evaluate(() => [...(window.mediaViewer.folderNeedsRegrant ?? [])]);

// Runs a MediaViewer method without awaiting it past 3 s: code that falls through to the
// folder-creation prompt waits there for a click that never comes.
async function runAction(method, args = []) {
    await page.evaluate(
        ({ m, a }) => Promise.race([window.mediaViewer[m](...a), new Promise((r) => setTimeout(r, 3000))]),
        { m: method, a: args }
    );
}

async function expectRefused(notice) {
    await expect(page.locator('.notification').filter({ hasText: notice })).toHaveCount(1);
    await expect(page.locator('.folder-creation-modal')).toHaveCount(0);
    expect(await page.evaluate(() => window.mediaViewer._fileOpInFlight)).toBe(false);
}

test.describe('G1 re-pick — folders saved before grants', () => {
    test('a saved folder main has not granted is marked at startup, with one notice and the title suffix', async () => {
        const likeDir = join(saved, 'liked');
        const dislikeDir = join(saved, 'disliked');
        await seedLocalStorage(page, { customLikeFolder: likeDir, customDislikeFolder: dislikeDir }, { grant: false });
        await grantFolder(electronApp, dislikeDir);

        await page.reload(); // the constructor runs again with the saved settings in place
        await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined');

        await expect(
            page.locator('.notification').filter({
                hasText:
                    'Re-confirm your like folder in Settings (F1) — click Browse and pick it again (security update)',
            })
        ).toHaveCount(1);
        await expect(page.locator('.notification').filter({ hasText: 'Re-confirm your' })).toHaveCount(1);
        expect(await marks()).toEqual(['like']);
        const titles = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return { like: mv.likeBtn.title, leftLike: mv.leftLikeBtn.title, dislike: mv.dislikeBtn.title };
        });
        expect(titles.like.endsWith(SUFFIX)).toBe(true);
        expect(titles.leftLike.endsWith(SUFFIX)).toBe(true);
        expect(titles.dislike).not.toContain('re-confirming');
    });

    test('a Like to an ungranted folder is refused before the video is torn down, with no create prompt', async () => {
        // tiny.mp4 may not decode here and never show as .media-display, so open on the image and
        // then put the video on screen (it is still a <video>, which is what the move tears down).
        await openSource(['red-1x1.png', 'tiny.mp4']);
        await page.evaluate(async () => {
            const mv = window.mediaViewer;
            mv.mediaFiles.sort((a) => (a.name === 'tiny.mp4' ? -1 : 1));
            mv.currentIndex = 0;
            await mv.showMedia();
        });
        await page.waitForFunction(() => window.mediaViewer.currentMedia?.tagName === 'VIDEO');
        await waitForIdle();
        await seedLocalStorage(
            page,
            { customLikeFolder: join(saved, 'liked'), customDislikeFolder: join(saved, 'disliked') },
            { grant: false }
        );
        await page.evaluate(() => {
            window.__shown = window.mediaViewer.currentMedia;
        });

        await runAction('moveCurrentFile', ['like']);

        await expectRefused(moveNotice('like'));
        expect(
            await page.evaluate(() => {
                const v = window.mediaViewer.currentMedia;
                return v === window.__shown && v.isConnected;
            })
        ).toBe(true);
        await access(join(tmpFixtures.dir, 'tiny.mp4'));
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(2);
    });

    test('a saved folder deleted since is refused, never offered for creation', async () => {
        await openSource();
        const gone = join(saved, 'gone');
        await seedLocalStorage(
            page,
            { customLikeFolder: gone, customDislikeFolder: join(saved, 'disliked') },
            { grant: false }
        );

        await runAction('moveCurrentFile', ['like']);

        await expectRefused(moveNotice('like'));
        await expect(access(gone)).rejects.toThrow();
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
    });

    test('a compare-pair move with an ungranted folder is refused and both panes stay on screen', async () => {
        await openSource();
        const likeDir = join(saved, 'liked');
        await grantFolder(electronApp, likeDir);
        await seedLocalStorage(
            page,
            { customLikeFolder: likeDir, customDislikeFolder: join(saved, 'disliked') },
            { grant: false }
        );
        await page.evaluate(() => window.mediaViewer.switchMode('compare'));
        await page.waitForFunction(() => {
            const mv = window.mediaViewer;
            return mv.isCompareMode && mv.leftMedia && mv.rightMedia && !mv.isLoading && !mv.mediaNavigationInProgress;
        });
        await page.evaluate(() => {
            window.__panes = [window.mediaViewer.leftMedia, window.mediaViewer.rightMedia];
        });

        await runAction('moveComparePair', ['left', 'like', 'dislike']);

        await expectRefused(moveNotice('dislike'));
        expect(
            await page.evaluate(() => {
                const mv = window.mediaViewer;
                const [l, r] = window.__panes;
                return mv.leftMedia === l && mv.rightMedia === r && l.isConnected && r.isConnected;
            })
        ).toBe(true);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
    });

    test('a special move to an ungranted folder is refused with no create prompt', async () => {
        await openSource();
        await seedLocalStorage(page, { customSpecialFolder: join(saved, 'special') }, { grant: false });

        await runAction('moveToSpecialFolder');

        await expectRefused(moveNotice('special'));
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
    });

    test('re-picking the folder in Settings clears the mark, and the next Like moves the file', async () => {
        await openSource();
        const likeDir = join(saved, 'liked');
        const dislikeDir = join(saved, 'disliked');
        await grantFolder(electronApp, dislikeDir);
        await seedLocalStorage(page, { customLikeFolder: likeDir, customDislikeFolder: dislikeDir }, { grant: false });
        expect(await marks()).toEqual(['like']);

        await mockFolderDialog(electronApp, likeDir);
        await page.evaluate(() => document.getElementById('likeFolderBrowse').click());
        await page.waitForFunction(() => !window.mediaViewer.folderNeedsRegrant.has('like'));

        expect(await electronApp.evaluate(() => global.__mvLastDialogDefaultPath)).toBe(likeDir);
        expect(await page.evaluate(() => window.mediaViewer.likeBtn.title)).not.toContain('re-confirming');
        const name = await page.evaluate(() => window.mediaViewer.mediaFiles[window.mediaViewer.currentIndex].name);
        await waitForIdle();
        await page.evaluate(() => window.mediaViewer.moveCurrentFile('like'));
        await access(join(likeDir, name));
    });

    test('the AI sort stops before training while the like folder needs re-confirming', async () => {
        await openSource();
        const dislikeDir = join(saved, 'disliked');
        await grantFolder(electronApp, dislikeDir);
        await seedLocalStorage(
            page,
            { customLikeFolder: join(saved, 'liked'), customDislikeFolder: dislikeDir },
            { grant: false }
        );
        await page.evaluate(() => {
            window.mediaViewer.isMlEnabled = true;
            window.mediaViewer.enableClipFeatures = false;
        });

        await runAction('handleSortByPrediction');

        await expect(
            page
                .locator('.notification')
                .filter({ hasText: 'Re-confirm your like folder in Settings (F1) before using the AI sort' })
        ).toHaveCount(1);
        expect(
            await page.evaluate(() => {
                const mv = window.mediaViewer;
                return { worker: !!mv.mlWorker, sorting: mv.isPredictionSorting, sorted: mv.isSortedByPrediction };
            })
        ).toEqual({ worker: false, sorting: false, sorted: false });
    });

    // Review M-b: a folder granted in an earlier session whose drive is absent now (removable or
    // offline network drive) is not "needs re-confirming": refusing with the security-update text
    // sent the user to re-pick a folder they cannot reach.
    test('a granted folder on an absent drive is refused as unreachable, not as needing re-confirming', async () => {
        test.skip(process.platform !== 'win32', 'the absent-drive case is exercised on Windows');
        const letter = [...'QRSTUVWXYZ'].find((l) => !existsSync(`${l}:/`));
        test.skip(!letter, 'no free drive letter');
        const absent = join(`${letter}:/`, 'Liked'); // join gives the native separator

        // Persist a grant for the absent folder, as an earlier session would have, and reload it.
        const storeFile = await electronApp.evaluate(() => process.env.MV_E2E_GRANTS_FILE);
        await writeFile(storeFile, JSON.stringify({ version: 1, roots: [{ path: absent, grantedAt: 1 }] }));
        await electronApp.evaluate(() => global.__mvGrants.load());

        await openSource();
        const dislikeDir = join(saved, 'disliked');
        await grantFolder(electronApp, dislikeDir);
        await seedLocalStorage(page, { customLikeFolder: absent, customDislikeFolder: dislikeDir }, { grant: false });
        await page.evaluate(() => window.mediaViewer.refreshFolderGrants({ notify: true }));

        expect(await marks()).toEqual([]);
        await expect(page.locator('.notification').filter({ hasText: 'Re-confirm your' })).toHaveCount(0);
        expect(await page.evaluate(() => window.mediaViewer.likeBtn.title)).toMatch(/ — folder not reachable$/);

        await runAction('moveCurrentFile', ['like']);

        await expectRefused("Your like folder isn't reachable — check that its drive is connected");
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
    });

    test('opening a folder that contains a saved folder clears its mark', async () => {
        tmpFixtures = await createTempFixtureDir();
        await seedLocalStorage(
            page,
            { customLikeFolder: tmpFixtures.likeDir, customDislikeFolder: tmpFixtures.dislikeDir },
            { grant: false }
        );
        expect(await marks()).toEqual(['like', 'dislike']);

        await loadFolder(page, tmpFixtures.dir);

        await page.waitForFunction(() => window.mediaViewer.folderNeedsRegrant.size === 0);
        expect(await page.evaluate(() => window.mediaViewer.likeBtn.title)).not.toContain('re-confirming');
    });
});
