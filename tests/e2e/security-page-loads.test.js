// G1 I1 — the page and its workers load only the app's own files and media from the granted folders,
// and send nothing off the machine. Each RED test ran first against the unfixed code under a test.fail
// marker (plan Task 1); the task that makes it pass removes the marker. Probe files live only in this
// test's own mkdtemp folders, and a probe script only sets a flag.
import { test, expect } from '@playwright/test';
import { cp, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import http from 'http';
import net from 'net';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, 'fixtures');
const PROJECT_ROOT = resolve(HERE, '..', '..');
const MARK = 'OUTSIDE-7f3a';
const RED_POLICY = 'RED until Task 6 sends the policy header';
const RED_NETWORK = 'RED until Task 7 restricts the renderer network';

const appUrl = (rel) => `app://media-viewer/${rel}`;
const appMediaUrl = (p) => `app://media-viewer/@fs/${encodeURIComponent(p)}`;
// Every way a page can name a file on disk: its file URL, its raw path (a file: base URL resolves a
// drive path as relative) and the app scheme's media door.
const fileForms = (p) => [pathToFileURL(p).href, p, appMediaUrl(p)];

let electronApp;
let page;
let tmpFixtures;
let outside;

test.beforeEach(async () => {
    tmpFixtures = await createTempFixtureDir();
    outside = await mkdtemp(join(tmpdir(), 'mv-e2e-outside-'));
    await writeFile(join(outside, 'outside.txt'), MARK);
    await cp(join(FIXTURES, 'red-1x1.png'), join(outside, 'outside.png'));
    await cp(join(FIXTURES, 'playable-64x64.mp4'), join(outside, 'outside.mp4'));
    await writeFile(join(outside, 'probe-script.js'), 'self.__probeRan = true;');
    await writeFile(join(outside, 'probe-module.mjs'), 'self.__probeRan = true;\nexport const ran = true;\n');
    await writeFile(join(outside, 'probe-style.css'), 'body { --probe: 1; }');
    await writeFile(join(outside, 'probe-worker.js'), "postMessage('probe-worker-ran');");
    ({ electronApp, page } = await launchApp());
    await loadFolder(page, tmpFixtures.dir);
    await waitForMedia(page);
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

// One load attempt from the page: 'loaded' when the content arrived (the mark, the flag, the style
// or the decoded media), 'blocked' when it did not, 'timeout' when neither settled in 5 s.
async function loadOutcome(kindArg, urlArg, markArg = MARK) {
    return page.evaluate(
        async ({ kind, url, mark }) => {
            const settle = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 5000))]);
            delete self.__probeRan;
            if (kind === 'img' || kind === 'video') {
                return settle(
                    new Promise((r) => {
                        const el = document.createElement(kind);
                        el.muted = true;
                        el.addEventListener(kind === 'img' ? 'load' : 'loadedmetadata', () => r('loaded'));
                        el.addEventListener('error', () => r('blocked'));
                        el.src = url;
                    })
                );
            }
            if (kind === 'fetch') {
                return settle(
                    fetch(url)
                        .then((res) => res.text())
                        .then(
                            (t) => (t.includes(mark) ? 'loaded' : 'blocked'),
                            () => 'blocked'
                        )
                );
            }
            if (kind === 'xhr') {
                return settle(
                    new Promise((r) => {
                        const x = new XMLHttpRequest();
                        x.onload = () => r(String(x.responseText).includes(mark) ? 'loaded' : 'blocked');
                        x.onerror = () => r('blocked');
                        try {
                            x.open('GET', url);
                            x.send();
                        } catch (_err) {
                            r('blocked');
                        }
                    })
                );
            }
            if (kind === 'script' || kind === 'style') {
                return settle(
                    new Promise((r) => {
                        const el = document.createElement(kind === 'script' ? 'script' : 'link');
                        const ran = () =>
                            kind === 'script'
                                ? self.__probeRan === true
                                : getComputedStyle(document.body).getPropertyValue('--probe').trim() === '1';
                        el.addEventListener('load', () => {
                            const out = ran() ? 'loaded' : 'blocked';
                            el.remove();
                            r(out);
                        });
                        el.addEventListener('error', () => {
                            el.remove();
                            r('blocked');
                        });
                        if (kind === 'script') {
                            el.src = url;
                        } else {
                            el.rel = 'stylesheet';
                            el.href = url;
                        }
                        document.head.append(el);
                    })
                );
            }
            if (kind === 'import') {
                return settle(
                    import(url).then(
                        () => (self.__probeRan === true ? 'loaded' : 'blocked'),
                        () => 'blocked'
                    )
                );
            }
            return `unknown kind ${kind}`;
        },
        { kind: kindArg, url: urlArg, mark: markArg }
    );
}

async function outcomesFor(kind, urls, mark) {
    const out = [];
    for (const url of urls) {
        out.push(await loadOutcome(kind, url, mark));
    }
    return out;
}

// One of the app's own workers, spawned from the page and driven from the test: the app's code
// making the calls a compromised page could make, so no attacker script needs to exist.
async function spawnAppWorker() {
    const [worker] = await Promise.all([
        page.waitForEvent('worker', (w) => w.url().endsWith('/ml-worker.js')),
        page.evaluate(() => {
            window.__probeWorker = new Worker('ml-worker.js');
        }),
    ]);
    return worker;
}

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

test.describe('G1 I1 — page loads', () => {
    test('control: the fetch probe reports an app file it can read', async () => {
        expect(await loadOutcome('fetch', 'styles.css', '--bg-primary')).toBe('loaded');
    });

    for (const [kind, name] of [
        ['img', 'outside.png'],
        ['video', 'outside.mp4'],
        ['fetch', 'outside.txt'],
        ['xhr', 'outside.txt'],
        ['script', 'probe-script.js'],
        ['style', 'probe-style.css'],
        ['import', 'probe-module.mjs'],
    ]) {
        test(`page ${kind}: a file outside every grant does not load`, async () => {
            expect(await outcomesFor(kind, fileForms(join(outside, name)))).toEqual(['blocked', 'blocked', 'blocked']);
        });
    }

    test('the app folder serves only the app files', async () => {
        const outcomes = [];
        for (const [rel, mark] of [
            ['package.json', '"devDependencies"'],
            ['.gitignore', 'node_modules'],
            ['CLAUDE.md', '# CLAUDE.md'],
        ]) {
            const forms = [pathToFileURL(join(PROJECT_ROOT, rel)).href, rel, appUrl(rel)];
            outcomes.push(...(await outcomesFor('fetch', forms, mark)));
        }
        expect(outcomes).toEqual(Array(9).fill('blocked'));
    });
});

test.describe('G1 I1 — worker loads', () => {
    test('harness: a worker the page spawns can be driven from the test', async () => {
        const worker = await spawnAppWorker();
        expect(await worker.evaluate(() => typeof importScripts)).toBe('function');
    });

    test('worker fetch: a file outside every grant does not load', async () => {
        const worker = await spawnAppWorker();
        const probe = ({ url, mark }) =>
            fetch(url)
                .then((res) => res.text())
                .then(
                    (t) => (t.includes(mark) ? 'loaded' : 'blocked'),
                    () => 'blocked'
                );
        // Control: the same probe reads an app file, so 'blocked' below is not a broken probe.
        expect(await worker.evaluate(probe, { url: 'styles.css', mark: '--bg-primary' })).toBe('loaded');
        const outcomes = [];
        for (const url of fileForms(join(outside, 'outside.txt'))) {
            outcomes.push(await worker.evaluate(probe, { url, mark: MARK }));
        }
        expect(outcomes).toEqual(['blocked', 'blocked', 'blocked']);
    });

    test('worker importScripts: a script outside every grant does not run', async () => {
        const worker = await spawnAppWorker();
        const outcomes = [];
        for (const url of fileForms(join(outside, 'probe-script.js'))) {
            outcomes.push(
                await worker.evaluate((u) => {
                    delete self.__probeRan;
                    try {
                        self.importScripts(u);
                        return self.__probeRan === true ? 'loaded' : 'blocked';
                    } catch (_err) {
                        return 'blocked';
                    }
                }, url)
            );
        }
        expect(outcomes).toEqual(['blocked', 'blocked', 'blocked']);
    });

    test('a worker whose own script is outside every grant does not run', async () => {
        const outcomes = [];
        for (const url of fileForms(join(outside, 'probe-worker.js'))) {
            outcomes.push(
                await page.evaluate(
                    (u) =>
                        new Promise((r) => {
                            let w;
                            try {
                                w = new Worker(u);
                            } catch (_err) {
                                r('blocked');
                                return;
                            }
                            w.onmessage = (e) => r(e.data === 'probe-worker-ran' ? 'loaded' : 'blocked');
                            w.onerror = () => r('blocked');
                            setTimeout(() => r('timeout'), 5000);
                        }),
                    url
                )
            );
        }
        expect(outcomes).toEqual(['blocked', 'blocked', 'blocked']);
    });
});

test.describe('G1 I1 — the media door', () => {
    test('control: the URL the app shows a granted image by loads', async () => {
        const src = await page.evaluate(() => document.querySelector('img.media-display')?.src);
        expect(src).toBeTruthy();
        expect(await loadOutcome('img', src)).toBe('loaded');
    });

    test('a non-media file inside a granted folder does not load', async () => {
        await writeFile(join(tmpFixtures.dir, 'notes.txt'), MARK);
        expect(await outcomesFor('fetch', fileForms(join(tmpFixtures.dir, 'notes.txt')))).toEqual([
            'blocked',
            'blocked',
            'blocked',
        ]);
    });

    // Not RED on Windows: Chromium's file: loader answers a file symlink with an empty body (measured on
    // the unfixed code, for a link to a png as well), so every form already reads nothing there. On the
    // branch this guards the media door's resolved-target check; the main-process read below is the RED
    // test for that rule.
    test('a media-named link to a non-media file inside a granted folder does not load', async () => {
        await writeFile(join(tmpFixtures.dir, 'notes.txt'), MARK);
        const link = await plantLink(join(tmpFixtures.dir, 'notes.txt'), 'notes-link.png');
        expect(await outcomesFor('fetch', fileForms(link))).toEqual(['blocked', 'blocked', 'blocked']);
    });

    test('main refuses to read a media-named link to a non-media file inside a granted folder', async () => {
        await writeFile(join(tmpFixtures.dir, 'notes.txt'), MARK);
        const link = await plantLink(join(tmpFixtures.dir, 'notes.txt'), 'notes-link.png');
        expect(await page.evaluate((p) => window.electronAPI.readFileBuffer(p), link)).toBeNull();
    });
});

test.describe('G1 I1 — nothing leaves the renderer', () => {
    let httpServer;
    let tcpServer;
    let httpPort;
    let tcpPort;
    let arrived;

    const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

    test.beforeEach(async () => {
        arrived = { http: [], tcp: 0 };
        httpServer = http.createServer((req, res) => {
            arrived.http.push(req.url);
            res.end('ok');
        });
        httpServer.on('upgrade', (req, socket) => {
            arrived.http.push(`upgrade ${req.url}`);
            socket.destroy();
        });
        tcpServer = net.createServer((socket) => {
            arrived.tcp += 1;
            socket.on('error', () => {});
            socket.destroy();
        });
        httpPort = await listen(httpServer);
        tcpPort = await listen(tcpServer);
    });

    test.afterEach(async () => {
        httpServer.closeAllConnections();
        await new Promise((r) => httpServer.close(r));
        await new Promise((r) => tcpServer.close(r));
    });

    // Also the positive control for the listener, and proof that main-process network (CLIP model
    // downloads use Node's own fetch) is untouched by anything this change sets on the session.
    test('control: a request from the main process reaches the listener', async () => {
        await electronApp.evaluate(async (_electron, url) => {
            await fetch(url).catch(() => {});
        }, `http://127.0.0.1:${httpPort}/main-control`);
        await expect.poll(() => arrived.http).toContain('/main-control');
    });

    test('worker fetch and WebSocket to a local listener send nothing', async () => {
        test.fail(true, RED_POLICY);
        const worker = await spawnAppWorker();
        await worker.evaluate((port) => {
            fetch(`http://127.0.0.1:${port}/worker-fetch`).catch(() => {});
            try {
                const ws = new WebSocket(`ws://127.0.0.1:${port}/worker-ws`);
                ws.onerror = () => {};
            } catch (_err) {
                // refused at construction: nothing sent
            }
        }, httpPort);
        await page.waitForTimeout(2000);
        expect(arrived.http).toEqual([]);
    });

    test('a WebRTC TURN connection to a local listener opens nothing', async () => {
        test.fail(true, RED_NETWORK);
        await page.evaluate(async (port) => {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: `turn:127.0.0.1:${port}?transport=tcp`, username: 'probe', credential: 'probe' }],
            });
            pc.createDataChannel('probe');
            await pc.setLocalDescription(await pc.createOffer());
            await new Promise((r) => setTimeout(r, 4000));
            pc.close();
        }, tcpPort);
        expect(arrived.tcp).toBe(0);
    });

    // Regression only: the page policy already blocks these on main.
    test('page beacon, page WebSocket and a blob worker send nothing (regression)', async () => {
        await page.evaluate((port) => {
            try {
                navigator.sendBeacon(`http://127.0.0.1:${port}/beacon`, 'x');
            } catch (_err) {
                // refused
            }
            try {
                const ws = new WebSocket(`ws://127.0.0.1:${port}/page-ws`);
                ws.onerror = () => {};
            } catch (_err) {
                // refused
            }
            try {
                const code = `fetch('http://127.0.0.1:${port}/blob-worker').catch(() => {});`;
                window.__blobWorker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
                window.__blobWorker.onerror = () => {};
            } catch (_err) {
                // refused
            }
        }, httpPort);
        await page.waitForTimeout(2000);
        expect(arrived.http).toEqual([]);
    });
});
