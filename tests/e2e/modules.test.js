// v2 P1a exit criteria (spec § 14): an empty module loads, a broken or hung one fails safely, a failure cascades to
// its dependents, and a toggle takes effect through a restart. The test modules live in tests/e2e/fixtures/modules/,
// a second module root main reads only when an E2E launch sets both MV_E2E_STATE_DIR and MV_E2E_MODULE_ROOT (plan
// C5); every launch keeps its modules.json in its own state folder (C7).
import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    grantFolder,
    waitForMedia,
    MODULE_FIXTURES_DIR,
} from './helpers/electron-app.js';

const STATE_FILE = '.e2e_module_state.json';
const HOST_KEYS = ['files', 'folder', 'log', 'module', 'settings', 'store', 'ui'];

async function waitForIdle(page) {
    await page.waitForFunction(
        () =>
            !window.mediaViewer._folderLoadInFlight &&
            !window.mediaViewer.isLoading &&
            !window.mediaViewer.mediaNavigationInProgress,
        null,
        { timeout: 10_000 }
    );
}

const modulesReady = (page) => page.evaluate(() => window.mediaViewer.moduleHost.ready);
const testApi = (page, id) => page.evaluate((m) => window.mediaViewer.modules[m], id);
const row = (page, name) =>
    page.locator('#modulesList .module-row').filter({ has: page.locator('.module-row-name', { hasText: name }) });

// F1 opens the overlay only once a folder is open (the empty state passes undo alone), so these use toggleHelp, which
// the header's help button calls.
async function openModules(page) {
    await page.evaluate(() => window.mediaViewer.toggleHelp());
    await expect(page.locator('#helpOverlay')).toHaveClass(/\bshow\b/);
    await expect(page.locator('#modulesSection')).toBeVisible();
}

async function closeModules(page) {
    await page.evaluate(() => window.mediaViewer.toggleHelp());
    await expect(page.locator('#helpOverlay')).not.toHaveClass(/\bshow\b/);
}

async function newestSessionLogPath(electronApp) {
    const logsDir = await electronApp.evaluate(({ app }) => app.getPath('logs'));
    const names = (await readdir(logsDir)).filter((n) => /^media-viewer-\d.*\.log$/.test(n)).sort();
    return join(logsDir, names[names.length - 1]);
}

// The app still works with these modules: a folder loads and a like moves a file.
async function likeMovesAFile(page, fixtures) {
    await seedLocalStorage(page, { customLikeFolder: fixtures.likeDir, customDislikeFolder: fixtures.dislikeDir });
    await loadFolder(page, fixtures.dir);
    await waitForMedia(page);
    await waitForIdle(page);
    await page.keyboard.press('q');
    await expect.poll(async () => (await readdir(fixtures.likeDir)).length, { timeout: 5000 }).toBe(1);
}

test.describe('v2 P1a: the module host', () => {
    let electronApp, page, fixtures, stateDir;
    const extraApps = [];

    test.afterEach(async () => {
        for (const app of [electronApp, ...extraApps.splice(0)]) {
            if (app) {
                await closeApp(app).catch(() => {});
            }
        }
        electronApp = null;
        if (fixtures) {
            await fixtures.cleanup();
            fixtures = null;
        }
        if (stateDir) {
            await rm(stateDir, { recursive: true, force: true });
            stateDir = null;
        }
    });

    test('a default launch has no modules, says so in F1, and works as before', async () => {
        fixtures = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());
        await modulesReady(page);
        expect(await page.evaluate(() => window.mediaViewer.modules)).toEqual({});
        await openModules(page);
        await expect(page.locator('#modulesList')).toHaveText('No modules yet');
        await expect(page.locator('#modulesRestartBar')).toBeHidden();
        await closeModules(page);
        await likeMovesAFile(page, fixtures);
    });

    test('an empty module activates and gets the seven host groups', async () => {
        ({ electronApp, page } = await launchApp({
            moduleRoot: MODULE_FIXTURES_DIR,
            modulesEnabled: { 'e2e-empty': true },
        }));
        await modulesReady(page);
        const api = await testApi(page, 'e2e-empty');
        expect(api.activated).toBe(true);
        expect(api.hostKeys).toEqual(HOST_KEYS);
        await openModules(page);
        await expect(row(page, 'E2E empty')).toContainText('On');
    });

    test('a module that throws fails alone, its dependent is disabled, and the app still works', async () => {
        fixtures = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp({
            moduleRoot: MODULE_FIXTURES_DIR,
            modulesEnabled: { 'e2e-throws': true, 'e2e-needs-throws': true },
        }));
        await modulesReady(page);
        await openModules(page);
        await expect(row(page, 'E2E throws on start')).toContainText('Failed: e2e-throws: planted activation failure');
        await expect(row(page, 'E2E needs the thrower')).toContainText('Disabled because e2e-throws failed to start');
        expect(await readFile(await newestSessionLogPath(electronApp), 'utf8')).toContain('[module:e2e-throws]');
        await closeModules(page);
        await likeMovesAFile(page, fixtures);
    });

    test('a module that never finishes activating fails at 5 s, and a folder loaded at launch still shows', async () => {
        fixtures = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp({
            moduleRoot: MODULE_FIXTURES_DIR,
            modulesEnabled: { 'e2e-hangs': true },
        }));
        const started = Date.now();
        await loadFolder(page, fixtures.dir); // waits for the host, at most 5 s
        await waitForMedia(page);
        expect(Date.now() - started).toBeLessThan(10_000);
        await modulesReady(page);
        await openModules(page);
        await expect(row(page, 'E2E hangs on start')).toContainText('Failed: did not finish activating within 5 s');
    });

    test('an invalid manifest and a missing dependency show at discovery', async () => {
        ({ electronApp, page } = await launchApp({
            moduleRoot: MODULE_FIXTURES_DIR,
            modulesEnabled: { 'e2e-needs-empty': true },
        }));
        await modulesReady(page);
        await openModules(page);
        await expect(row(page, 'e2e-invalid')).toContainText('Not valid:');
        await expect(row(page, 'e2e-invalid')).toContainText('folder name');
        await expect(row(page, 'E2E needs empty')).toContainText('Disabled because e2e-empty is off');
        await expect(row(page, 'e2e-invalid').locator('input')).toBeDisabled();
    });

    test('a toggle is saved at once and takes effect through Restart now', async () => {
        stateDir = await mkdtemp(join(tmpdir(), 'mv-e2e-state-'));
        ({ electronApp, page } = await launchApp({ moduleRoot: MODULE_FIXTURES_DIR, stateDir }));
        await modulesReady(page);
        await openModules(page);
        await row(page, 'E2E empty').locator('input').check();
        await expect(page.locator('#modulesRestartBar')).toBeVisible();
        await expect(row(page, 'E2E empty')).toContainText('restart to apply');
        await expect
            .poll(async () => JSON.parse(await readFile(join(stateDir, 'modules.json'), 'utf8')).enabled)
            .toEqual({ 'e2e-empty': true });

        // app.relaunch would start a real second app outside Playwright: main logs instead, and the test reads it.
        await electronApp.evaluate(({ app }) => {
            app.relaunch = () => console.log('MV_E2E relaunch stub');
        });
        const logPath = await newestSessionLogPath(electronApp);
        const closed = electronApp.waitForEvent('close');
        await page.locator('#modulesRestartBtn').click();
        await closed;
        const log = await readFile(logPath, 'utf8');
        const asked = log.indexOf('Restart requested');
        expect(asked).toBeGreaterThan(-1);
        expect(log.indexOf('MV_E2E relaunch stub')).toBeGreaterThan(asked);

        extraApps.push(electronApp);
        ({ electronApp, page } = await launchApp({ moduleRoot: MODULE_FIXTURES_DIR, stateDir }));
        await modulesReady(page);
        expect((await testApi(page, 'e2e-empty')).activated).toBe(true);
    });

    test("a module's folder file goes through its visit: written, read, removed, and refused once the visit ends", async () => {
        fixtures = await createTempFixtureDir();
        const second = await createTempFixtureDir();
        try {
            ({ electronApp, page } = await launchApp({
                moduleRoot: MODULE_FIXTURES_DIR,
                modulesEnabled: { 'e2e-storage': true },
            }));
            await modulesReady(page);
            const visits = () => page.evaluate(() => window.mediaViewer.modules['e2e-storage'].visitFolders().length);
            await loadFolder(page, fixtures.dir);
            await expect.poll(visits).toBe(1);
            await waitForIdle(page);
            const call = (method, ...args) =>
                page.evaluate(([m, a]) => window.mediaViewer.modules['e2e-storage'][m](...a), [method, args]);
            const target = join(fixtures.dir, STATE_FILE);

            expect(await call('write', { n: 1 })).toEqual({ success: true });
            expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ n: 1 });
            expect(await call('read')).toEqual({ status: 'ok', value: { n: 1 }, recovered: false });
            expect(await call('remove')).toEqual({ success: true });
            await expect(readFile(target, 'utf8')).rejects.toThrow();
            expect(await call('read')).toEqual({ status: 'absent' });

            await loadFolder(page, second.dir);
            await expect.poll(visits).toBe(2);
            expect(await call('writeTo', 0, { late: true })).toEqual({ success: false, error: 'visit ended' });
            expect(await readdir(fixtures.dir)).not.toContain(STATE_FILE);
            expect(await readdir(second.dir)).not.toContain(STATE_FILE);
            expect(await call('readUndeclared')).toContain('not declared');
        } finally {
            await second.cleanup();
        }
    });

    test('main refuses a folder file for an owner that is not active: unreadable, never absent', async () => {
        fixtures = await createTempFixtureDir();
        await writeFile(join(fixtures.dir, STATE_FILE), '{"kept":true}');
        ({ electronApp, page } = await launchApp({ moduleRoot: MODULE_FIXTURES_DIR })); // e2e-storage stays off
        await modulesReady(page);
        await grantFolder(electronApp, fixtures.dir);
        const reply = await page.evaluate(
            ([dir, name]) => window.electronAPI.folderFileRead('e2e-storage', dir, name),
            [fixtures.dir, STATE_FILE]
        );
        expect(reply).toEqual({ status: 'unreadable', reason: 'Not permitted' });
        expect(await readFile(join(fixtures.dir, STATE_FILE), 'utf8')).toBe('{"kept":true}');
    });

    test('a toggle in one launch does not reach the next launch with its own state folder', async () => {
        ({ electronApp, page } = await launchApp({ moduleRoot: MODULE_FIXTURES_DIR }));
        await modulesReady(page);
        const saved = await page.evaluate(() => window.electronAPI.setModuleEnabled('e2e-empty', true));
        expect(saved.restartNeeded).toBe(true);
        extraApps.push(electronApp);
        await closeApp(electronApp);

        ({ electronApp, page } = await launchApp({ moduleRoot: MODULE_FIXTURES_DIR }));
        await modulesReady(page);
        expect(await testApi(page, 'e2e-empty')).toBeUndefined();
        await openModules(page);
        await expect(row(page, 'E2E empty')).toContainText('Off');
    });
});
