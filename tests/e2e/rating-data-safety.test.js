// G3 "Rating data that can't go wrong": each test here failed on main at 65d8b71 before its fix, except the two
// that say otherwise in their own comment.
// Spec: docs/superpowers/specs/2026-11-02-g3-rating-data-safety-design.md
import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    grantFolder,
    waitForMedia,
} from './helpers/electron-app.js';

async function waitForIdle(page) {
    await page.waitForFunction(
        () =>
            !window.mediaViewer.isLoading &&
            !window.mediaViewer.mediaNavigationInProgress &&
            !window.mediaViewer._fileOpInFlight &&
            !window.mediaViewer._folderLoadInFlight,
        null,
        { timeout: 10_000 }
    );
}

const mediaIn = async (dir) =>
    (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);

test.describe('G3 rating data safety', () => {
    let electronApp, page, source, other;

    async function open(names = ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']) {
        source = await createTempFixtureDir(names);
        await seedLocalStorage(page, {
            customLikeFolder: source.likeDir,
            customDislikeFolder: source.dislikeDir,
            customSpecialFolder: source.specialDir,
        });
        await loadFolder(page, source.dir);
        await waitForMedia(page);
        await waitForIdle(page);
    }

    test.beforeEach(async () => {
        ({ electronApp, page } = await launchApp());
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (source) {
            await source.cleanup();
            source = null;
        }
        if (other) {
            await other.cleanup();
            other = null;
        }
    });

    test.describe('member 1: nothing acts on files while a folder opens', () => {
        test('a rating press after the new list is in place moves nothing the user has not seen', async () => {
            await open();
            other = await createTempFixtureDir(['normal-320x240.png', 'red-1x1.png']);
            await grantFolder(electronApp, other.dir);
            const seen = await page.evaluate(async (folder) => {
                const mv = window.mediaViewer;
                const original = mv.loadBulkRatedFile;
                let pressedOn = null;
                // The press lands inside the load's bulk-rated read: the new list is in place, and nothing of it
                // has been on screen yet.
                mv.loadBulkRatedFile = async function () {
                    mv.loadBulkRatedFile = original;
                    pressedOn = mv.mediaFiles[mv.currentIndex]?.name ?? null;
                    await mv.handleLike();
                    return original.call(mv);
                };
                await mv.switchToFolder(folder);
                return { pressedOn, base: mv.baseFolderPath };
            }, other.dir);
            await waitForIdle(page);
            expect(seen.pressedOn).not.toBeNull(); // the press did land, on a file of the new folder
            expect(seen.base).toBe(other.dir);
            expect(await mediaIn(source.likeDir)).toEqual([]);
            expect((await mediaIn(other.dir)).sort()).toEqual(['normal-320x240.png', 'red-1x1.png']);
        });

        test('a Like that ends after the listing returns cannot be undone into the new folder', async () => {
            await open(['playable-64x64.mp4', 'red-1x1.png']);
            other = await createTempFixtureDir(['green-1x1.png']);
            await grantFolder(electronApp, other.dir);
            await page.evaluate(async () => {
                const mv = window.mediaViewer;
                mv.currentIndex = mv.mediaFiles.findIndex((f) => f.name === 'playable-64x64.mp4');
                await mv.showMedia();
            });
            await waitForMedia(page);
            await waitForIdle(page);
            // The video's 500 ms handle wait keeps the Like's rename behind the listing (the entry's probe).
            await page.evaluate(async (folder) => {
                const mv = window.mediaViewer;
                const loading = mv.loadFolder(folder);
                const liking = mv.handleLike();
                await Promise.all([loading, liking]);
            }, other.dir);
            await waitForIdle(page);
            await page.evaluate(() => window.mediaViewer.handleCancel());
            await waitForIdle(page);
            expect(await mediaIn(other.dir)).toEqual(['green-1x1.png']);
        });

        // The guard alone would pass the test above. This one reaches the undo: a history entry whose origin is not
        // the open folder, which only the dirname rule sends home.
        test('an undo returns a file to the folder it came from, whichever folder is open', async () => {
            await open();
            const name = await page.evaluate(async () => {
                const mv = window.mediaViewer;
                const file = mv.mediaFiles[mv.currentIndex];
                await mv.moveCurrentFile('like');
                window.__entry = mv.moveHistory[mv.moveHistory.length - 1];
                return file.name;
            });
            await waitForIdle(page);
            other = await createTempFixtureDir(['green-1x1.png']);
            await loadFolder(page, other.dir);
            await waitForMedia(page);
            await waitForIdle(page);
            await page.evaluate(async () => {
                const mv = window.mediaViewer;
                mv.moveHistory.push(window.__entry);
                await mv.handleCancel();
            });
            await waitForIdle(page);
            expect(await mediaIn(other.dir)).toEqual(['green-1x1.png']);
            expect(await mediaIn(source.dir)).toContain(name);
            expect(await mediaIn(source.likeDir)).not.toContain(name);
        });
    });

    test.describe('member 3: an undo gives a file back its label and its score', () => {
        async function expectRestored(name, { undo = true, label = 'good', score = 0.9 } = {}) {
            await waitForIdle(page);
            if (undo) {
                await page.evaluate(() => window.mediaViewer.handleCancel());
                await waitForIdle(page);
            }
            const restored = await page.evaluate((n) => {
                const mv = window.mediaViewer;
                const file = mv.mediaFiles.find((f) => f.name === n);
                return {
                    label: mv.bulkRated.get(n) ?? null,
                    score: file ? (mv.predictionScores.get(file.path) ?? null) : null,
                };
            }, name);
            expect(restored).toEqual({ label, score });
            await expect
                .poll(async () => JSON.parse(await readFile(join(source.dir, '.bulk_rated.json'), 'utf8'))[label])
                .toContain(name);
        }

        test('after a single-mode Like', async () => {
            await open();
            const name = await page.evaluate(async () => {
                const mv = window.mediaViewer;
                const file = mv.mediaFiles[mv.currentIndex];
                mv.bulkRated.set(file.name, 'good');
                mv.predictionScores.set(file.path, 0.9);
                await mv.saveBulkRatedFile();
                await mv.moveCurrentFile('like');
                return file.name;
            });
            await expectRestored(name);
        });

        test('after a special move', async () => {
            await open();
            const name = await page.evaluate(async () => {
                const mv = window.mediaViewer;
                const file = mv.mediaFiles[mv.currentIndex];
                mv.bulkRated.set(file.name, 'good');
                mv.predictionScores.set(file.path, 0.9);
                await mv.saveBulkRatedFile();
                await mv.moveToSpecialFolder();
                return file.name;
            });
            await expectRestored(name);
        });

        test('after a compare-pair move, on both files', async () => {
            await open();
            await page.evaluate(() => window.mediaViewer.switchMode('compare'));
            await waitForIdle(page);
            const names = await page.evaluate(async () => {
                const mv = window.mediaViewer;
                const files = [mv.compareLeftFile, mv.compareRightFile];
                // Different on purpose: each file must get its own back, not the other's.
                mv.bulkRated.set(files[0].name, 'good');
                mv.predictionScores.set(files[0].path, 0.9);
                mv.bulkRated.set(files[1].name, 'bad');
                mv.predictionScores.set(files[1].path, 0.2);
                await mv.saveBulkRatedFile();
                await mv.moveComparePair('left', 'like', 'dislike');
                return files.map((f) => f.name);
            });
            await expectRestored(names[0]);
            await expectRestored(names[1], { undo: false, label: 'bad', score: 0.2 });
        });
    });

    test.describe('member 4: an AI order keeps every listed file', () => {
        test('a file the result leaves out stays listed, after the ordered ones', async () => {
            await open();
            const after = await page.evaluate(() => {
                const mv = window.mediaViewer;
                const [first, second, third] = mv.mediaFiles.map((f) => f.name);
                mv.applyPredictionSortResult({
                    sortedFilenames: [third, first],
                    scores: { [third]: 0.9, [first]: 0.1 },
                });
                return { names: mv.mediaFiles.map((f) => f.name), expected: [third, first, second] };
            });
            expect(after.names).toEqual(after.expected);
        });

        test('a chip re-sort keeps an unjudged file the result leaves out', async () => {
            await open();
            const after = await page.evaluate(() => {
                const mv = window.mediaViewer;
                const names = mv.mediaFiles.map((f) => f.name);
                mv.applyPredictionSortResult({ sortedFilenames: names, scores: {} });
                mv.likeOrSkip.recordSkip(mv.mediaFiles[0].path);
                mv.applyPredictionSortResult({ sortedFilenames: [names[2]], scores: {} }, { resort: true });
                return { names: mv.mediaFiles.map((f) => f.name), expected: [names[0], names[2], names[1]] };
            });
            expect(after.names).toEqual(after.expected);
        });
    });

    test.describe('member 5: Continue reconciles against the list as it is when pressed', () => {
        test('a file brought back behind the resume prompt stays in the tournament', async () => {
            await open();
            await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
            await expect(page.locator('#tournamentConfigModal')).toBeVisible();
            await page.locator('#tournamentRoundsSelect').fill('2');
            await page.locator('#tournamentConfigStart').click();
            await page.waitForFunction(
                () => window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine
            );
            await waitForIdle(page);
            await page.evaluate(() => window.mediaViewer.switchMode('single'));
            await expect(page.locator('#tournamentResumeModal')).toBeVisible();
            await page.locator('#tournamentResumeAccept').click();
            await page.waitForFunction(() => !window.mediaViewer.isTournamentMode);
            await waitForIdle(page);

            const liked = await page.evaluate(async () => {
                const mv = window.mediaViewer;
                const file = mv.mediaFiles[mv.currentIndex];
                await mv.moveCurrentFile('like');
                return file.path;
            });
            await waitForIdle(page);

            await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
            await expect(page.locator('#tournamentResumeModal')).toBeVisible();
            expect(await page.locator('#tournamentResumeTitle').textContent()).toBe('Resume tournament?');

            // The list changes while the prompt is open. Keys no longer reach an undo here (the next test), so this
            // calls it directly: Continue must still read the list as it is when pressed.
            await page.evaluate(() => window.mediaViewer.handleCancel());
            await page.waitForFunction((p) => window.mediaViewer.mediaFiles.some((f) => f.path === p), liked);
            await waitForIdle(page);

            await page.locator('#tournamentResumeAccept').click();
            await page.waitForFunction(
                () => window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine
            );
            const files = await page.evaluate(() => window.mediaViewer.tournament.engine.files);
            expect(files).toContain(liked);
        });
    });

    // PR #95 review 3, 7. Not from main's run: added with the review's fixes, and each fails with its fix reverted.
    test.describe('the tournament prompts', () => {
        async function openConfigPrompt() {
            await open();
            await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
            await expect(page.locator('#tournamentConfigModal')).toBeVisible();
            await page.evaluate(() => document.activeElement && document.activeElement.blur());
        }

        test('a rating key behind a prompt moves nothing', async () => {
            await openConfigPrompt();
            await page.keyboard.press('q');
            await page.keyboard.press('e');
            await page.waitForTimeout(300);
            expect(await mediaIn(source.likeDir)).toEqual([]);
            expect(await mediaIn(source.dislikeDir)).toEqual([]);
        });

        // Round 2, issue 1: focus reaches a rating button behind the prompt, and the cursor has been reset unseen.
        test('a rating button reached by focus behind a prompt moves nothing', async () => {
            await openConfigPrompt();
            await page.evaluate(() => document.getElementById('likeBtn').focus());
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);
            expect(await page.evaluate(() => document.activeElement.id)).toBe('likeBtn'); // the press had its target
            expect(await mediaIn(source.likeDir)).toEqual([]);
        });

        test('a folder change closes an open prompt', async () => {
            await openConfigPrompt();
            other = await createTempFixtureDir(['green-1x1.png']);
            await loadFolder(page, other.dir);
            await waitForMedia(page);
            await expect(page.locator('#tournamentConfigModal')).toBeHidden();
        });
    });

    test.describe('member 6: a quit saves what the app still owes the disk', () => {
        test("a visit's unsaved extraction reaches the feature cache on quit", async () => {
            await open();
            const name = await page.evaluate(async () => {
                const mv = window.mediaViewer;
                await mv.featureCacheStore.ensureRead();
                const file = mv.mediaFiles[0];
                mv.featureCacheStore.putFeature(mv.featureCacheStore.visit, file.path, new Float32Array(64).fill(0.5));
                for (const k of ['customLikeFolder', 'customDislikeFolder', 'customSpecialFolder', 'recentFolders']) {
                    localStorage.removeItem(k);
                }
                return file.name;
            });
            await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
            await expect
                .poll(() => readFile(join(source.dir, '.feature_cache.json'), 'utf8').catch(() => ''), {
                    timeout: 8000,
                })
                .toContain(name);
        });

        // It cannot fail on main, where nothing coalesces, so it guards the quit's flush against the saver: without
        // whenIdle at close the second save waits in the renderer and dies with it. Proved by removing that wait.
        test('two saves coalesced just before a close both reach the disk', async () => {
            await open();
            const names = await page.evaluate(() => {
                const mv = window.mediaViewer;
                const [first, second] = mv.mediaFiles.map((f) => f.name);
                mv.bulkRated.set(first, 'good');
                mv.saveBulkRatedFile();
                mv.bulkRated.set(second, 'bad');
                mv.saveBulkRatedFile();
                // In the same tick as the saves, so no write can finish before the close starts.
                mv.handleAppCloseRequest();
                return { first, second };
            });
            await expect
                .poll(() => readFile(join(source.dir, '.bulk_rated.json'), 'utf8').catch(() => ''), { timeout: 8000 })
                .toContain(names.second);
            const onDisk = JSON.parse(await readFile(join(source.dir, '.bulk_rated.json'), 'utf8'));
            expect(onDisk.good).toEqual([names.first]);
            expect(onDisk.bad).toEqual([names.second]);
        });
    });

    test.describe('member 7: main logs what it did not catch', () => {
        async function newestSessionLog() {
            const logsDir = await electronApp.evaluate(({ app }) => app.getPath('logs'));
            const names = (await readdir(logsDir)).filter((n) => /^media-viewer-\d.*\.log$/.test(n)).sort();
            return names.length > 0 ? readFile(join(logsDir, names[names.length - 1]), 'utf-8') : '';
        }

        test("an uncaught throw reaches the session log, and Electron's dialog still shows", async () => {
            await electronApp.evaluate(({ dialog }) => {
                global.__g3Boxes = [];
                dialog.showErrorBox = (title) => global.__g3Boxes.push(title);
                setTimeout(() => {
                    throw new Error('g3-uncaught-probe');
                }, 0);
            });
            await expect.poll(newestSessionLog, { timeout: 5000 }).toContain('g3-uncaught-probe');
            await expect.poll(() => electronApp.evaluate(() => global.__g3Boxes.length), { timeout: 5000 }).toBe(1);
        });

        // Already true on main, so a contract, not a reproduction: Node's warning goes through main's console.error
        // override. An 'unhandledRejection' listener would silence that warning, and this fails if one drops the log.
        test('an unhandled rejection reaches the session log', async () => {
            await electronApp.evaluate(() => {
                setTimeout(() => {
                    Promise.reject(new Error('g3-rejection-probe'));
                }, 0);
            });
            await expect.poll(newestSessionLog, { timeout: 5000 }).toContain('g3-rejection-probe');
        });
    });
});
