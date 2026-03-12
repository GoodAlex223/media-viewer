/**
 * Shared E2E test helpers for launching the Electron app, managing fixtures,
 * and seeding state.
 */

import { _electron as electron } from '@playwright/test';
import { cp, mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures');

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

function getLaunchArgs() {
    if (process.platform === 'win32') {
        return [join(PROJECT_ROOT, 'main.js')];
    }
    // Unix: node runs the wrapper script, which spawns Electron
    return [resolve(__dirname, 'electron-wrapper.cjs'), join(PROJECT_ROOT, 'main.js')];
}

/**
 * Launch the Electron app and wait for it to be ready.
 * Returns { electronApp, page }.
 */
export async function launchApp() {
    const electronApp = await electron.launch({
        executablePath: getElectronWrapperPath(),
        args: getLaunchArgs(),
        cwd: PROJECT_ROOT,
    });

    const page = await electronApp.firstWindow();

    // Stub lucide CDN to avoid network dependency — the app guards with typeof check
    await page.route('**/unpkg.com/**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: 'window.lucide = { createIcons: function() {} };',
        })
    );

    // Wait for the renderer to be fully initialized
    await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined', null, { timeout: 10_000 });

    return { electronApp, page };
}

/**
 * Close the Electron app with a timeout fallback.
 * electronApp.close() can hang on Windows; kill the process if it takes too long.
 */
export async function closeApp(electronApp) {
    const CLOSE_TIMEOUT = 5_000;
    try {
        await Promise.race([
            electronApp.close(),
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error('close timeout')), CLOSE_TIMEOUT)),
        ]);
    } catch {
        // Force-kill the Electron process tree
        try {
            const proc = electronApp.process();
            proc.kill('SIGKILL');
        } catch {
            // Process already exited
        }
    }
}

/**
 * Set localStorage keys and update the running MediaViewer instance properties.
 * The constructor reads localStorage during init, so we must also update
 * the instance properties and re-enable buttons for the current session.
 */
export async function seedLocalStorage(page, kvMap) {
    await page.evaluate((kv) => {
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
        ipcMain.handle('open-folder-dialog', async () => folderPath);
    }, returnPath);
}

/**
 * Load a folder directly via the renderer's loadFolder method.
 * Waits for media to be displayed.
 */
export async function loadFolder(page, folderPath) {
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
 * Returns { dir, likeDir, dislikeDir, specialDir, cleanup }.
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

    return { dir, likeDir, dislikeDir, specialDir, cleanup };
}
