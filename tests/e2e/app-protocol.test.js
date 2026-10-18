// G1 I1 — behaviour of the app scheme: what must keep working once the window is served from it.
import { test, expect } from '@playwright/test';
import { access, cp, mkdtemp, readFile, rm, stat, symlink } from 'fs/promises';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    seedLocalStorage,
    createTempFixtureDir,
} from './helpers/electron-app.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, 'fixtures');
const PROJECT_ROOT = resolve(HERE, '..', '..');

// Ends the app the way a crash would: no graceful quit, so storage Chromium still holds only in
// memory never reaches disk. closeApp then only cleans up after it.
async function killApp(app) {
    const proc = app.process();
    if (process.platform === 'win32') {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' });
    } else {
        proc.kill('SIGKILL');
    }
    await closeApp(app);
}

let electronApp;
let page;
let tmpFixtures;

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
        electronApp = undefined;
    }
    if (tmpFixtures) {
        await tmpFixtures.cleanup();
        tmpFixtures = undefined;
    }
});

test('icons render from the vendored Lucide build', async () => {
    ({ electronApp, page } = await launchApp());
    expect(await page.evaluate(() => document.querySelector('script[src*="lucide"]')?.getAttribute('src'))).toBe(
        'vendor/lucide/lucide.min.js'
    );
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('svg.lucide').length)).toBeGreaterThan(0);
});

// Review Focus 5 and spec § 4.4: a real clip of tens of MB, moov atom at the end (no +faststart), so
// the player must range-request the tail before it can play, and a seek near the end reads far past
// what it buffered. A passthrough without real 206 responses failed here (spike § 3.2). The noise
// keeps the encoder from compressing the clip small: a clip under a few MB is buffered whole, and
// then plays and seeks with byte ranges ignored (measured), which would make this test unable to fail.
test('a large video plays and seeks through the handler, and its file is released', async () => {
    test.setTimeout(120_000);
    tmpFixtures = await createTempFixtureDir([]);
    const clip = join(tmpFixtures.dir, 'clip.mp4');
    execFileSync(ffmpegPath, [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=640x480:rate=25:duration=20',
        '-vf',
        'noise=alls=80:allf=t+u',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-b:v',
        '16M',
        '-g',
        '25',
        clip,
    ]);
    expect((await stat(clip)).size).toBeGreaterThan(20 * 1024 * 1024); // the precondition above
    ({ electronApp, page } = await launchApp());
    // Ratings need both folders configured (areFoldersConfigured).
    await seedLocalStorage(page, {
        customLikeFolder: tmpFixtures.likeDir,
        customDislikeFolder: tmpFixtures.dislikeDir,
    });
    await loadFolder(page, tmpFixtures.dir);
    await waitForMedia(page);
    const seek = await page.evaluate(async () => {
        const v = document.querySelector('video.media-display');
        // A broken range path errors or never settles; fail fast with which step, not at the test timeout.
        const within = (p, label) =>
            Promise.race([
                p,
                new Promise((_r, reject) => setTimeout(() => reject(new Error(`${label}: timed out`)), 15_000)),
            ]);
        const failed = () =>
            new Promise((_r, reject) =>
                v.addEventListener('error', () => reject(new Error(`video error ${v.error?.code}`)), { once: true })
            );
        if (v.readyState < 1) {
            await within(
                Promise.race([new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true })), failed()]),
                'metadata'
            );
        }
        const target = v.duration - 1;
        await within(
            Promise.race([
                new Promise((r) => {
                    v.addEventListener('seeked', r, { once: true });
                    v.currentTime = target;
                }),
                failed(),
            ]),
            'seek'
        );
        const c = document.createElement('canvas');
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext('2d');
        ctx.drawImage(v, 0, 0, 16, 16);
        ctx.getImageData(0, 0, 1, 1); // throws if the frame tainted the canvas (cross-origin media)
        return { duration: v.duration, currentTime: v.currentTime, target };
    });
    expect(seek.duration).toBeGreaterThan(19);
    expect(seek.currentTime).toBeGreaterThan(seek.target - 0.5);

    await page.keyboard.press('q'); // Like: moves the playing file
    await expect
        .poll(() =>
            access(join(tmpFixtures.likeDir, 'clip.mp4')).then(
                () => true,
                () => false
            )
        )
        .toBe(true);
    await expect
        .poll(() => electronApp.evaluate(() => global.__mvAppProtocol.openStreams()), { timeout: 10_000 })
        .toBe(0);
});

// Review Focus 1.
test('media in a folder whose name needs encoding displays', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mv e2e #% [é中] '));
    try {
        await cp(join(FIXTURES, 'normal-320x240.png'), join(dir, 'a #1 %20.png'));
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, dir);
        await waitForMedia(page);
        await expect
            .poll(() => page.evaluate(() => document.querySelector('img.media-display')?.naturalWidth ?? 0))
            .toBe(320);
    } finally {
        if (electronApp) {
            await closeApp(electronApp);
            electronApp = undefined;
        }
        await rm(dir, { recursive: true, force: true });
    }
});

// A link in a granted folder to media elsewhere is read through, as main's own reads always did
// (review M-a): the media door serves the link's target.
test('a symlinked media file inside a granted folder displays', async () => {
    tmpFixtures = await createTempFixtureDir([]);
    const elsewhere = await mkdtemp(join(tmpdir(), 'mv-e2e-elsewhere-'));
    try {
        await cp(join(FIXTURES, 'normal-320x240.png'), join(elsewhere, 'real.png'));
        try {
            await symlink(join(elsewhere, 'real.png'), join(tmpFixtures.dir, 'linked.png'), 'file');
        } catch (err) {
            test.skip(err.code === 'EPERM', 'file symlinks need Developer Mode on Windows');
            throw err;
        }
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await expect
            .poll(() => page.evaluate(() => document.querySelector('img.media-display')?.naturalWidth ?? 0))
            .toBe(320);
    } finally {
        await rm(elsewhere, { recursive: true, force: true });
    }
});

// Review Focus 4: F12 opens DevTools on the app page (main's before-input-event toggle).
test('F12 opens DevTools', async () => {
    ({ electronApp, page } = await launchApp());
    const opened = () =>
        electronApp.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some((w) => w.webContents.isDevToolsOpened())
        );
    expect(await opened()).toBe(false);
    // Through Electron's own input path: Playwright's key events never reach before-input-event (measured).
    await electronApp.evaluate(({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0].webContents;
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'F12' });
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'F12' });
    });
    await expect.poll(opened).toBe(true);
    await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.closeDevTools())
    );
});

// Review Focus 4.
test('the app page reloads and keeps its IPC', async () => {
    tmpFixtures = await createTempFixtureDir();
    ({ electronApp, page } = await launchApp());
    await loadFolder(page, tmpFixtures.dir);
    await page.reload();
    await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined');
    expect(page.url()).toBe('app://media-viewer/index.html');
    const probe = join(tmpFixtures.dir, 'red-1x1.png');
    expect(await page.evaluate((p) => window.electronAPI.checkFileExists(p), probe)).toBe(true);
});

// Spec § 6. Test-only keys carry the shapes real settings have (a Windows path, JSON, non-ASCII
// text): the migration copies keys without regard to their names, and real keys would leak into
// later tests through the shared E2E profile.
test('settings under the old page origin are carried over once and never overwrite', async () => {
    test.setTimeout(120_000);
    const markerDir = await mkdtemp(join(tmpdir(), 'mv-e2e-migration-'));
    const marker = join(markerDir, 'storage-migration.json');
    const migratePage = join(PROJECT_ROOT, 'migrate.html');
    const seeded = {
        'mv-e2e-migration-path': 'C:\\Users\\someone\\Pictures\\liked',
        'mv-e2e-migration-json': JSON.stringify({ version: 2, single: { like: 'KeyQ' } }),
        'mv-e2e-migration-text': 'Фото ☃ 中文 \u2028 "quoted" \\ end',
        'mv-e2e-migration-preset': 'old',
    };
    const setScript = (pairs) =>
        `(() => { for (const [k, v] of ${JSON.stringify(pairs)}) localStorage.setItem(k, v); return true; })()`;
    const removeScript = (keys) =>
        `(() => { for (const k of ${JSON.stringify(keys)}) localStorage.removeItem(k); return true; })()`;
    // Runs a script in a hidden window on the OLD (file://) origin, then flushes storage to disk.
    const inOldOrigin = (app, code) =>
        app.evaluate(
            async ({ BrowserWindow, session }, { file, script }) => {
                const w = new BrowserWindow({ show: false });
                try {
                    await w.loadFile(file);
                    return await w.webContents.executeJavaScript(script);
                } finally {
                    await session.defaultSession.flushStorageData();
                    w.destroy();
                }
            },
            { file: migratePage, script: code }
        );
    const appKeys = () => page.evaluate(() => Object.keys(localStorage));
    let before = [];
    try {
        // Launch 1, migration skipped: seed the old origin, and pre-set one key on the app origin.
        ({ electronApp, page } = await launchApp());
        await inOldOrigin(electronApp, setScript(Object.entries(seeded)));
        await page.evaluate(() => localStorage.setItem('mv-e2e-migration-preset', 'new'));
        before = await appKeys();
        await electronApp.evaluate(({ session }) => session.defaultSession.flushStorageData());
        await closeApp(electronApp);

        // Launch 2, fresh marker path: the migration runs. It ends in a hard kill, as a crash would:
        // the marker must not be on disk unless the settings it records are too.
        const readSeeded = () =>
            page.evaluate(
                (keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])),
                Object.keys(seeded)
            );
        ({ electronApp, page } = await launchApp({ migrationMarker: marker }));
        expect(await readSeeded()).toEqual({ ...seeded, 'mv-e2e-migration-preset': 'new' });
        const written = JSON.parse(await readFile(marker, 'utf-8'));
        expect(written.version).toBe(1);
        expect(written.keys).toBeGreaterThanOrEqual(Object.keys(seeded).length);
        await killApp(electronApp);

        // Launch 3, same marker: the copied settings survived the kill. A key the old origin gains
        // after the migration…
        ({ electronApp, page } = await launchApp({ migrationMarker: marker }));
        expect(await readSeeded()).toEqual({ ...seeded, 'mv-e2e-migration-preset': 'new' });
        await inOldOrigin(electronApp, setScript([['mv-e2e-migration-late', 'x']]));
        await closeApp(electronApp);

        // Launch 4, same marker: …is never copied, because nothing runs again.
        ({ electronApp, page } = await launchApp({ migrationMarker: marker }));
        expect(await page.evaluate(() => localStorage.getItem('mv-e2e-migration-late'))).toBeNull();
        expect(JSON.parse(await readFile(marker, 'utf-8'))).toEqual(written);
    } finally {
        // Leave the shared profile as it was: the seeded keys off both origins, and every key the
        // migration copied in removed from the app origin.
        if (electronApp) {
            const added = (await appKeys().catch(() => [])).filter((k) => !before.includes(k));
            await page
                .evaluate(
                    (keys) => keys.forEach((k) => localStorage.removeItem(k)),
                    [...added, 'mv-e2e-migration-preset']
                )
                .catch(() => {});
            await inOldOrigin(electronApp, removeScript([...Object.keys(seeded), 'mv-e2e-migration-late'])).catch(
                () => {}
            );
        }
        await rm(markerDir, { recursive: true, force: true });
    }
});
