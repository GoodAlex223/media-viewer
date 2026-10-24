/**
 * Shared E2E test helpers for launching the Electron app, managing fixtures,
 * and seeding state.
 */

import { _electron as electron } from '@playwright/test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures');

// page → electronApp, so page-only helpers (loadFolder, seedLocalStorage) can reach the main
// process to grant a folder without every call site changing signature (G1).
const appByPage = new WeakMap();
// electronApp → its per-launch grant-store directory, removed by closeApp.
const grantsDirByApp = new WeakMap();

/**
 * Get the path to the Electron wrapper script.
 * Workaround for Playwright + Electron 30+ incompatibility:
 * Electron rejects --remote-debugging-port=0 as a CLI flag.
 * The wrapper strips it and sets it via app.commandLine.appendSwitch instead.
 * See: https://github.com/microsoft/playwright/issues/39008
 */
function getElectronWrapperPath() {
    if (process.platform === 'win32') {
        return resolve(__dirname, 'electron-wrapper.cmd');
    }
    // Unix: use the .cjs wrapper directly via node
    return process.execPath; // node binary
}

// Launching main.js directly (not the project directory) means Electron reads no package.json, so
// the app runs as "Electron": its userData — and its session logs — live under %APPDATA%\Electron\,
// apart from the real app's %APPDATA%\media_viewer\. That separation is what stops an E2E run (one
// launch per test) from pruning a debugging session's log away (logger.js keeps the newest 10).
// Keep it if this launch path ever changes.
function getLaunchArgs() {
    if (process.platform === 'win32') {
        return [join(PROJECT_ROOT, 'main.js')];
    }
    // Unix: node runs the wrapper script, which spawns Electron
    return [resolve(__dirname, 'electron-wrapper.cjs'), join(PROJECT_ROOT, 'main.js')];
}

/**
 * Launch the Electron app and wait for it to be ready.
 * `env` adds environment variables for this launch. An inherited MV_HASH_PARITY is always dropped, so a shell
 * that left it set cannot turn the launch into a parity run; pass it in `env` to ask for one.
 * Returns { electronApp, page }.
 */
export async function launchApp({ migrationMarker, env = {} } = {}) {
    // A fresh grant store per launch (G1): main reads MV_E2E_GRANTS_FILE instead of
    // <userData>/folder-grants.json, so a grant left by an earlier test can never make a
    // refusal test pass for the wrong reason. The same env var exposes global.__mvGrants in the
    // main process, reachable only through electronApp.evaluate — never from the renderer.
    const grantsDir = await mkdtemp(join(tmpdir(), 'mv-e2e-grants-'));
    // The one-time localStorage migration (G1 I1) runs only when a test asks for it: a marker already
    // present means "done". Otherwise the shared E2E profile's old file:// store, full of leftovers
    // from earlier runs, would be copied into every launch.
    let marker = migrationMarker;
    if (!marker) {
        marker = join(grantsDir, 'storage-migration.json');
        await writeFile(marker, JSON.stringify({ version: 1, migratedAt: 'e2e-skip', keys: 0, written: 0 }));
    }
    // A shell that left MV_HASH_PARITY set must not turn every E2E launch into a parity run (G2 PR 2, Review Focus
    // #5): drop it, then let the test ask for it through `env`. In any spelling: Windows names are case-insensitive,
    // so a `mv_hash_parity` copied here would still read as MV_HASH_PARITY in main (PR #87 review #9).
    const launchEnv = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'MV_HASH_PARITY')
    );
    const electronApp = await electron.launch({
        executablePath: getElectronWrapperPath(),
        args: getLaunchArgs(),
        cwd: PROJECT_ROOT,
        env: {
            ...launchEnv,
            ...env,
            MV_E2E_GRANTS_FILE: join(grantsDir, 'folder-grants.json'),
            MV_E2E_MIGRATION_MARKER: marker,
        },
    });
    grantsDirByApp.set(electronApp, grantsDir);

    const page = await electronApp.firstWindow();
    appByPage.set(page, electronApp);

    // Wait for the renderer to be fully initialized
    await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined', null, { timeout: 10_000 });

    // A recent-folders list left by a run that crashed before closeApp (G4): clear it and re-render, so every
    // test starts on the bare drop zone — app-launch.test.js clicks its centre.
    await page.evaluate(() => {
        localStorage.removeItem('recentFolders');
        window.mediaViewer.recentFolders = [];
        window.mediaViewer.renderRecentFolders?.();
    });

    return { electronApp, page };
}

/**
 * Close the Electron app with a timeout fallback.
 * electronApp.close() can hang on Windows; kill the process if it takes too long.
 *
 * The wrapper pattern (electron-wrapper.cjs → electron.exe) means SIGKILL on the
 * wrapper orphans the real Electron child on Windows. Use taskkill /F /T /PID to
 * kill the entire process tree.
 */
export async function closeApp(electronApp) {
    // Don't leak saved folders into the next launch: since G1, a saved folder main has not
    // granted raises a re-confirm notice at startup, and E2E launches share one profile. The
    // recent-folders list (G4) would otherwise list folders from earlier tests on the drop zone.
    try {
        const win = electronApp.windows()[0];
        if (win) {
            await win.evaluate(() => {
                for (const k of ['customLikeFolder', 'customDislikeFolder', 'customSpecialFolder', 'recentFolders']) {
                    localStorage.removeItem(k);
                }
            });
        }
    } catch {
        // Renderer already gone — nothing to clear
    }
    const CLOSE_TIMEOUT = 5_000;
    let timer;
    try {
        await Promise.race([
            electronApp.close().then((v) => {
                clearTimeout(timer);
                return v;
            }),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('close timeout')), CLOSE_TIMEOUT);
            }),
        ]);
    } catch {
        // Force-kill the entire process tree (wrapper + electron.exe children)
        try {
            const proc = electronApp.process();
            if (process.platform === 'win32') {
                // taskkill /T kills the process tree; /F forces termination
                const { execSync } = await import('child_process');
                execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
            } else {
                proc.kill('SIGKILL');
            }
        } catch {
            // Process already exited
        }
    }
    const grantsDir = grantsDirByApp.get(electronApp);
    if (grantsDir) {
        await rm(grantsDir, { recursive: true, force: true }).catch(() => {});
    }
}

/**
 * Grant a folder in the main process, as a pick in the native folder dialog would (G1).
 * Returns 'no-hook' on a build without grants (before G1), so RED tests run unchanged there.
 */
export async function grantFolder(electronApp, folderPath) {
    const outcome = await electronApp.evaluate(async (_electron, p) => {
        if (!global.__mvGrants) {
            return 'no-hook';
        }
        const res = await global.__mvGrants.grant(p);
        return res.path ? 'granted' : 'failed';
    }, folderPath);
    if (outcome === 'failed') {
        throw new Error(`grantFolder: main refused to grant ${folderPath}`);
    }
    return outcome;
}

/**
 * Set localStorage keys and update the running MediaViewer instance properties.
 * The constructor reads localStorage during init, so we must also update
 * the instance properties and re-enable buttons for the current session.
 * Since G1 the three folder keys are also granted in main first (pass { grant: false } to seed
 * a folder main has not granted, as a folder saved before G1 would be).
 */
export async function seedLocalStorage(page, kvMap, { grant = true } = {}) {
    const app = appByPage.get(page);
    if (grant && app) {
        for (const key of ['customLikeFolder', 'customDislikeFolder', 'customSpecialFolder']) {
            if (kvMap[key]) {
                await grantFolder(app, kvMap[key]);
            }
        }
    }
    await page.evaluate(async (kv) => {
        const viewer = window.mediaViewer;
        for (const [key, value] of Object.entries(kv)) {
            localStorage.setItem(key, value);
            // Sync instance properties with localStorage keys
            if (key === 'customLikeFolder') {
                viewer.customLikeFolder = value;
            }
            if (key === 'customDislikeFolder') {
                viewer.customDislikeFolder = value;
            }
            if (key === 'customSpecialFolder') {
                viewer.customSpecialFolder = value;
            }
        }
        // Since G1: re-ask main which saved folders are granted (marks + tooltips).
        await viewer.refreshFolderGrants?.();
        // Re-enable rating buttons after updating folder paths
        viewer.updateRatingButtonsState();
        viewer.updateSpecialButtonsState();
    }, kvMap);
}

/**
 * Replace the open-folder-dialog IPC handler in the main process
 * to return a preset path instead of showing a native dialog.
 */
export async function mockFolderDialog(electronApp, returnPath) {
    await electronApp.evaluate(({ ipcMain }, folderPath) => {
        ipcMain.removeHandler('open-folder-dialog');
        // How often the dialog opened since this mock was installed (G4: "no dialog" is asserted directly).
        global.__mvDialogCalls = 0;
        ipcMain.handle('open-folder-dialog', async (_event, defaultPath) => {
            global.__mvDialogCalls += 1;
            // Where the dialog would have opened (G1 re-pick opens it at the saved folder).
            global.__mvLastDialogDefaultPath = defaultPath;
            // A real pick grants the folder (G1); mirror that so later IPC on it is allowed.
            await global.__mvGrants?.grant(folderPath);
            return folderPath;
        });
    }, returnPath);
}

/**
 * Load a folder directly via the renderer's loadFolder method.
 * Waits for media to be displayed. Grants the folder in main first (G1), as the dialog would.
 */
export async function loadFolder(page, folderPath) {
    const app = appByPage.get(page);
    if (app) {
        await grantFolder(app, folderPath);
    }
    await page.evaluate((fp) => window.mediaViewer.loadFolder(fp), folderPath);
    // Wait for the drop zone to be hidden (folder loaded successfully)
    await page.waitForFunction(
        () => {
            const dropZone = document.getElementById('dropZone');
            return dropZone && dropZone.style.display === 'none';
        },
        null,
        { timeout: 10_000 }
    );
}

/**
 * Wait for a .media-display element to be visible (image or video loaded).
 */
export async function waitForMedia(page) {
    await page.locator('.media-display').first().waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Wait for a notification containing specific text.
 */
export async function waitForNotification(page, textPattern) {
    await page.locator('.notification').filter({ hasText: textPattern }).waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Copy named fixtures to a new temp directory.
 * Creates 'liked' and 'disliked' subdirs for rating tests.
 * Returns { dir, likeDir, dislikeDir, specialDir, cleanup, addFile }.
 * addFile(name) copies a fixed fixture (red-1x1.png) into `dir` under `name` — see its own
 * comment below for why.
 */
export async function createTempFixtureDir(fixtureNames = ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']) {
    const dir = await mkdtemp(join(tmpdir(), 'mv-e2e-'));
    const likeDir = join(dir, 'liked');
    const dislikeDir = join(dir, 'disliked');
    const specialDir = join(dir, 'special');

    await mkdir(likeDir, { recursive: true });
    await mkdir(dislikeDir, { recursive: true });
    await mkdir(specialDir, { recursive: true });

    for (const name of fixtureNames) {
        await cp(join(FIXTURES_DIR, name), join(dir, name));
    }

    const cleanup = async () => {
        await rm(dir, { recursive: true, force: true });
    };

    // Copies a fixed fixture (red-1x1.png) into this directory under `name`. Lets a test mutate
    // a training folder mid-run (e.g. adding a file to change its fingerprint) without needing a
    // distinct fixture per call — the pixel content is irrelevant, only that it is a real,
    // decodable image the feature extractor can process.
    const addFile = async (name) => {
        await cp(join(FIXTURES_DIR, 'red-1x1.png'), join(dir, name));
    };

    return { dir, likeDir, dislikeDir, specialDir, cleanup, addFile };
}

// Absolute path of the committed visual-evidence directory. Screenshots taken here are
// deliberately checked into git: WEEKLY G2's acceptance check is that they exist, not that
// a reviewer saw them once in a CI artifact.
const EVIDENCE_DIR = join(__dirname, '..', '..', '..', 'docs', 'superpowers', 'specs', 'assets');

/**
 * Capture a full-page screenshot into the committed evidence directory.
 * @param {import('@playwright/test').Page} page
 * @param {string} name - file stem, e.g. 'g2-compare-short-after'
 * @returns {Promise<string>} the path written
 */
export async function captureScreenshot(page, name) {
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const target = join(EVIDENCE_DIR, `${name}.png`);
    await page.screenshot({ path: target });
    return target;
}
