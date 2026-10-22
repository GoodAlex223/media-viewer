import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { copyFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, seedLocalStorage, createTempFixtureDir } from './helpers/electron-app.js';
import { generateHashFixtures, ENCODING_NAMES } from './fixtures/hash-fixtures.js';

// G2 PR 2 T7: the background hashing route, proven in the real app. The fixtures are generated with sharp (the
// committed 1x1 PNGs are malformed, so createImageBitmap rejects them and they would all take today's route).

const SMALL_IMAGES = ['tiny-40x30.png', 'alpha-small.png', 'odd-257x255.jpg', 'still.gif', 'lossy.webp', 'alpha.png'];

let srcDir;
let allNames;

test.beforeAll(async () => {
    test.setTimeout(180_000);
    srcDir = await mkdtemp(join(tmpdir(), 'mv-e2e-hashfix-'));
    allNames = await generateHashFixtures(srcDir);
});

test.afterAll(async () => {
    if (srcDir) {
        await rm(srcDir, { recursive: true, force: true }).catch(() => {});
    }
});

async function copyInto(dir, names) {
    for (const name of names) {
        await copyFile(join(srcDir, name), join(dir, name));
    }
}

async function waitForIdle(page) {
    await page.waitForFunction(() => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress);
}

test.describe('hash routes on generated fixtures', () => {
    let electronApp;
    let page;
    let tmpFixtures;

    test.beforeAll(async () => {
        test.setTimeout(120_000);
        tmpFixtures = await createTempFixtureDir([]);
        await copyInto(tmpFixtures.dir, allNames);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
        await waitForIdle(page);
    });

    test.afterAll(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('every fixture hashes the same on both routes', async () => {
        test.setTimeout(300_000);
        const names = allNames.filter((n) => !ENCODING_NAMES.includes(n));
        const paths = await page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => [f.name, f.path]));
        const byName = new Map(paths);
        expect(byName.size).toBe(allNames.length);

        const rows = await page.evaluate(
            async (list) => {
                const viewer = window.mediaViewer;
                const out = [];
                const main = new Map();
                for (const [, path] of list) {
                    main.set(path, await viewer.computePerceptualHash(path));
                }
                const pool = viewer._createHashPool();
                try {
                    const canary = await pool.checkCanary();
                    const worker = new Map();
                    for await (const r of pool.hashFiles(
                        list.map(([, p]) => p),
                        { route: 'worker' }
                    )) {
                        worker.set(r.path, r);
                    }
                    for (const [name, path] of list) {
                        const w = worker.get(path);
                        out.push({
                            name,
                            main: main.get(path),
                            worker: w ? w.hash : undefined,
                            route: w ? w.route : undefined,
                            error: w ? w.error : 'no result',
                            canary: canary.ok,
                        });
                    }
                } finally {
                    pool.terminate();
                }
                return out;
            },
            names.map((n) => [n, byName.get(n)])
        );

        expect(rows).toHaveLength(names.length);
        const mismatched = rows.filter((r) => !r.main || r.main !== r.worker).map((r) => r.name);
        const wrongRoute = rows.filter((r) => r.route !== 'worker').map((r) => `${r.name}:${r.route}:${r.error}`);
        expect({ mismatched, wrongRoute }).toEqual({ mismatched: [], wrongRoute: [] });

        // Pixel identity (spec § 11.3) is recorded, not asserted: a difference is a fact about the machine.
        const imageNames = names.filter((n) => !n.endsWith('.jxl'));
        const pixelRows = await page.evaluate(
            async (list) => {
                const { hashImageUrl } = await import('./main-thread-hash.js');
                const { toMediaUrl } = await import('./media-url.js');
                const out = [];
                for (const [name, path] of list) {
                    const url = toMediaUrl(path);
                    const mainSide = await hashImageUrl(url, { wantPixels: true });
                    const worker = new Worker('hash-worker.js', { type: 'module' });
                    try {
                        const reply = await new Promise((resolve, reject) => {
                            worker.onmessage = (e) => resolve(e.data);
                            worker.onerror = (e) => reject(new Error(e.message || 'worker error'));
                            worker.postMessage({ type: 'hash', id: 1, url, wantPixels: true });
                        });
                        const a = new Uint8Array(mainSide.pixels.buffer ?? mainSide.pixels);
                        const b = new Uint8Array(reply.pixels);
                        let differing = a.length === b.length ? 0 : -1;
                        if (differing === 0) {
                            for (let i = 0; i < a.length; i++) {
                                if (a[i] !== b[i]) {
                                    differing++;
                                }
                            }
                        }
                        out.push({
                            name,
                            identical: differing === 0,
                            differing,
                            ok: reply.ok,
                            lengths: [a.length, b.length],
                        });
                    } catch (error) {
                        out.push({ name, identical: false, differing: -2, ok: false, error: String(error) });
                    } finally {
                        worker.terminate();
                    }
                }
                return out;
            },
            imageNames.map((n) => [n, byName.get(n)])
        );
        for (const r of pixelRows) {
            test.info().annotations.push({
                type: 'pixels',
                description: `${r.name}: ${r.identical ? 'identical' : `differs (${r.differing} bytes)`}`,
            });
        }
        test.info().annotations.push({
            type: 'pixels-summary',
            description: `${pixelRows.filter((r) => r.identical).length} of ${pixelRows.length} identical`,
        });
        // Harness sanity, not identity: a missing reply or an empty read-back must not read as "identical".
        expect(pixelRows).toHaveLength(imageNames.length);
        expect(
            pixelRows.filter((r) => !r.ok || r.lengths?.[0] !== 262144 || r.lengths?.[1] !== 262144).map((r) => r.name)
        ).toEqual([]);
    });

    test('the canary passes on this machine', async () => {
        const result = await page.evaluate(async () => {
            const pool = window.mediaViewer._createHashPool();
            try {
                return await pool.checkCanary();
            } finally {
                pool.terminate();
            }
        });
        expect(result.ok, result.detail).toBe(true);
    });

    test('file names that need encoding are hashed by the worker', async () => {
        const rows = await page.evaluate(async (names) => {
            const viewer = window.mediaViewer;
            const files = viewer.mediaFiles.filter((f) => names.includes(f.name));
            window.__encodingRoutes = [];
            const create = viewer._createHashPool.bind(viewer);
            viewer._createHashPool = () => {
                const pool = create();
                const real = pool.hashFiles.bind(pool);
                pool.hashFiles = async function* (paths, opts) {
                    for await (const r of real(paths, opts)) {
                        window.__encodingRoutes.push({ path: r.path, route: r.route });
                        yield r;
                    }
                };
                return pool;
            };
            try {
                const pool = viewer._createHashPool();
                const got = new Map();
                try {
                    await pool.checkCanary();
                    for await (const r of pool.hashFiles(files.map((f) => f.path))) {
                        got.set(r.path, r.hash);
                    }
                } finally {
                    pool.terminate();
                }
                const out = [];
                for (const f of files) {
                    out.push({
                        name: f.name,
                        main: await viewer.computePerceptualHash(f.path),
                        worker: got.get(f.path),
                        route: window.__encodingRoutes.find((r) => r.path === f.path)?.route,
                    });
                }
                return out;
            } finally {
                viewer._createHashPool = create;
            }
        }, ENCODING_NAMES);

        expect(rows.map((r) => r.name).sort()).toEqual([...ENCODING_NAMES].sort());
        for (const r of rows) {
            expect(r.route, r.name).toBe('worker');
            expect(typeof r.main, r.name).toBe('string');
            expect(r.worker, r.name).toBe(r.main);
        }
    });
});

test.describe('a sort through the workers', () => {
    let electronApp;
    let page;
    let tmpFixtures;

    test.beforeAll(async () => {
        tmpFixtures = await createTempFixtureDir([]);
        await copyInto(tmpFixtures.dir, SMALL_IMAGES);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForIdle(page);
    });

    test.afterAll(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('a sort hashes images in the workers and keeps the app usable', async () => {
        // The gateHashing wrapper of similarity-sort.test.js, plus a record of each result's route and a count of
        // today's route for images.
        await page.evaluate(() => {
            const viewer = window.mediaViewer;
            let open;
            window.__hashGate = new Promise((resolve) => {
                open = resolve;
            });
            window.__openHashGate = () => open();
            window.__hashCalls = 0;
            window.__hashRoutes = [];
            window.__mainImageCalls = 0;
            const mainRoute = viewer.computePerceptualHash.bind(viewer);
            viewer.computePerceptualHash = (filePath) => {
                if (!/\.(mp4|webm|mov)$/i.test(filePath)) {
                    window.__mainImageCalls++;
                }
                return mainRoute(filePath);
            };
            const create = viewer._createHashPool.bind(viewer);
            viewer._createHashPool = () => {
                const pool = create();
                const real = pool.hashFiles.bind(pool);
                pool.hashFiles = async function* (paths, opts) {
                    for await (const r of real(paths, opts)) {
                        window.__hashCalls++;
                        window.__hashRoutes.push({ path: r.path, route: r.route });
                        if (window.__hashCalls >= 2) {
                            await window.__hashGate;
                        }
                        yield r;
                    }
                };
                return pool;
            };
            window.__sortDone = viewer.handleSortBySimilarity();
        });
        await page.waitForFunction(() => window.__hashCalls >= 2);
        await waitForIdle(page);

        // The app is usable while the run is held mid-hash: navigate, then like the file on screen.
        const before = await page.evaluate(() => window.mediaViewer.currentIndex);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForIdle(page);
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).not.toBe(before);
        const likedPath = await page.evaluate(
            () => window.mediaViewer.mediaFiles[window.mediaViewer.currentIndex].path
        );
        await page.evaluate(() => window.mediaViewer.moveCurrentFile('like'));
        await waitForIdle(page);
        expect(await page.evaluate((p) => window.mediaViewer.mediaFiles.some((f) => f.path === p), likedPath)).toBe(
            false
        );

        await page.evaluate(async () => {
            window.__openHashGate();
            await window.__sortDone;
        });
        await waitForIdle(page);

        const offer = page.locator('.notification.sticky').filter({ hasText: 'Similarity order ready' });
        await expect(offer).toBeVisible();
        await offer.locator('.notification-action').click({ force: true });
        await expect(offer).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);

        const paths = await page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => f.path));
        expect(paths).not.toContain(likedPath);

        const routes = await page.evaluate(() => window.__hashRoutes);
        expect(routes).toHaveLength(SMALL_IMAGES.length);
        expect(routes.map((r) => r.route)).toEqual(routes.map(() => 'worker'));
        expect(await page.evaluate(() => window.__mainImageCalls)).toBe(0);
    });
});

test.describe('parity mode', () => {
    let electronApp;
    let page;
    let tmpFixtures;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
            electronApp = null;
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    test('parity mode via MV_HASH_PARITY', async () => {
        test.setTimeout(120_000);
        tmpFixtures = await createTempFixtureDir(['playable-64x64.mp4']);
        await copyInto(tmpFixtures.dir, SMALL_IMAGES);
        ({ electronApp, page } = await launchApp({ env: { MV_HASH_PARITY: '1' } }));
        expect(await page.evaluate(() => window.mediaViewer.hashParityMode)).toBe(true);
        await loadFolder(page, tmpFixtures.dir);
        await waitForIdle(page);

        const orderBefore = await page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => f.path));
        await page.evaluate(async () => {
            window.confirm = () => true;
            await window.mediaViewer.handleSortBySimilarity();
        });
        await waitForIdle(page);

        const report = await page.evaluate(() => window.mediaViewer.lastHashParityReport);
        expect(report, 'a report was left on the viewer').toBeTruthy();
        expect({
            verdict: report.verdict,
            compared: report.compared,
            identical: report.identical,
            videos: report.videos,
        }).toEqual({ verdict: 'pass', compared: 6, identical: 6, videos: 1 });

        expect(existsSync(join(tmpFixtures.dir, '.hash_cache.json'))).toBe(false);
        expect(existsSync(join(tmpFixtures.dir, '.sort_cache.json'))).toBe(false);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => f.path))).toEqual(orderBefore);
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
    });

    // Review Focus #5: a shell that left MV_HASH_PARITY set must not turn an ordinary launch into a parity run.
    test('a normal launch is not in parity mode even when the shell sets MV_HASH_PARITY', async () => {
        const previous = process.env.MV_HASH_PARITY;
        process.env.MV_HASH_PARITY = '1';
        try {
            ({ electronApp, page } = await launchApp());
            expect(await page.evaluate(() => window.mediaViewer.hashParityMode)).toBe(false);
        } finally {
            if (previous === undefined) {
                delete process.env.MV_HASH_PARITY;
            } else {
                process.env.MV_HASH_PARITY = previous;
            }
        }
    });
});
