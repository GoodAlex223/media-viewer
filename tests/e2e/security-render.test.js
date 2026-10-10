// G1 — renderer sinks (F1/F3, F4, F5 + the folder-creation dialog), CSP and the navigation lock.
// The three tournament-modal tests carry no RED marker: claude-security patch F1 fixed them before
// this file existed; their failure on the unfixed renderer was checked by reverting the fix.
// The HTML probe is an inert <b data-probe>; the CSP probe only sets a window flag.
import { test, expect } from '@playwright/test';
import { writeFile, rm, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { launchApp, closeApp, loadFolder, createTempFixtureDir } from './helpers/electron-app.js';

const PROBE = '<b data-probe="1">7</b>';

let electronApp;
let page;
let tmpFixtures;

test.beforeEach(async () => {
    tmpFixtures = await createTempFixtureDir();
    ({ electronApp, page } = await launchApp());
    await loadFolder(page, tmpFixtures.dir);
});

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (tmpFixtures) {
        await tmpFixtures.cleanup();
    }
});

// Count parsed probe elements under `selector`, and return its text.
async function probeIn(selector) {
    return page.evaluate((sel) => {
        const root = document.querySelector(sel);
        return { probes: root ? root.querySelectorAll('[data-probe]').length : -1, text: root?.textContent ?? '' };
    }, selector);
}

test.describe('G1 renderer sinks render values as text', () => {
    test('resume prompt (F1/F3)', async () => {
        await page.evaluate((probe) => {
            const state = {
                version: 2,
                strategy: 'swiss',
                files: ['a', 'b'],
                options: { rounds: 3 },
                createdAt: Date.now(),
                gamesPlayed: probe,
                strategyState: {},
            };
            window.mediaViewer.showTournamentContinuePrompt(state, ['a', 'b']);
        }, PROBE);
        const r = await probeIn('#tournamentResumeBody');
        expect(r.probes).toBe(0);
        expect(r.text).toContain(PROBE);
    });

    test('summary modal (F4)', async () => {
        await page.evaluate(async (probe) => {
            const mv = window.mediaViewer;
            await mv.tournament.handleStartClick(mv.baseFolderPath, 3);
            mv.tournament.engine.strategy.options.rounds = probe;
            mv.showTournamentSummaryModal();
        }, PROBE);
        const r = await probeIn('#tournamentSummaryBody');
        expect(r.probes).toBe(0);
        expect(r.text).toContain(PROBE);
    });

    test('leave prompt (F5)', async () => {
        await page.evaluate(async (probe) => {
            const mv = window.mediaViewer;
            await mv.tournament.handleStartClick(mv.baseFolderPath, 3);
            mv.tournament.engine.strategy.gamesPlayed = probe;
            mv.showTournamentLeavePrompt(() => {});
        }, PROBE);
        const r = await probeIn('#tournamentResumeBody');
        expect(r.probes).toBe(0);
        expect(r.text).toContain(PROBE);
    });

    test('folder-creation dialog', async () => {
        await page.evaluate((probe) => {
            void window.mediaViewer.showFolderCreationDialog(probe);
        }, PROBE);
        const r = await probeIn('.folder-creation-modal');
        expect(r.probes).toBe(0);
        expect(r.text).toContain(PROBE);
    });
});

test.describe('G1 CSP and navigation lock', () => {
    test('an inline event-handler attribute does not run (the image itself loads)', async () => {
        test.fail(true, 'RED until the G1 CSP task');
        const r = await page.evaluate(async () => {
            window.__inlineRan = false;
            const host = document.createElement('div');
            host.innerHTML =
                '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=" ' +
                'onload="window.__inlineRan = true">';
            const img = host.firstChild;
            const loaded = new Promise((resolve) => {
                img.addEventListener('load', () => resolve(true), { once: true });
                img.addEventListener('error', () => resolve(false), { once: true });
            });
            document.body.append(host);
            const ok = await loaded;
            await new Promise((resolve) => setTimeout(resolve, 100));
            host.remove();
            return { loaded: ok, ran: window.__inlineRan };
        });
        expect(r.loaded).toBe(true); // discriminates: the image loaded, so only the handler was blocked
        expect(r.ran).toBe(false);
    });

    test('the window cannot be navigated away from the app', async () => {
        test.fail(true, 'RED until the G1 navigation-lock task');
        const dir = await mkdtemp(join(tmpdir(), 'mv-e2e-nav-'));
        try {
            const other = join(dir, 'other.html');
            await writeFile(other, '<!doctype html><title>other</title>');
            await page.evaluate((u) => {
                window.location.href = u;
            }, pathToFileURL(other).href);
            await page.waitForTimeout(750); // settle: a navigation that will happen has started by now
            expect(page.url()).toMatch(/index\.html$/);
            expect(await page.evaluate(() => typeof window.mediaViewer)).toBe('object');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test('window.open is denied', async () => {
        test.fail(true, 'RED until the G1 navigation-lock task');
        await page.evaluate(() => {
            window.open('about:blank');
        });
        await page.waitForTimeout(500);
        expect(electronApp.windows()).toHaveLength(1);
    });
});
