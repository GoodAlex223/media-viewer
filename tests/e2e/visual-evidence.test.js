import { test } from '@playwright/test';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
    captureScreenshot,
} from './helpers/electron-app.js';

// Capture-only: no assertions. These produce the committed visual evidence WEEKLY G2 requires.
// The stem is passed in so the same file can run on `main` (before) and on the branch (after).
const STAGE = process.env.G2_EVIDENCE_STAGE || 'after';

test.describe('G2 visual evidence', () => {
    let electronApp, page, tmpFixtures;

    test.afterEach(async () => {
        if (page) {
            await page
                .evaluate(() => {
                    if (window.mediaViewer && window.mediaViewer.tournament) {
                        window.mediaViewer.tournament.engine = null;
                    }
                })
                .catch(() => {});
        }
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    for (const [label, fixture] of [
        ['short', 'wide-short-64x4.png'],
        ['normal', 'normal-320x240.png'],
    ]) {
        test(`compare mode on ${label} media`, async () => {
            tmpFixtures = await createTempFixtureDir([fixture, 'red-1x1.png']);
            ({ electronApp, page } = await launchApp());
            await seedLocalStorage(page, {
                customLikeFolder: tmpFixtures.likeDir,
                customDislikeFolder: tmpFixtures.dislikeDir,
            });
            await loadFolder(page, tmpFixtures.dir);
            await waitForMedia(page);

            await page.evaluate(() => window.mediaViewer.switchMode('compare'));
            await page.waitForFunction(() => window.mediaViewer.isCompareMode && !window.mediaViewer.isLoading);

            await captureScreenshot(page, `g2-compare-${label}-${STAGE}`);
        });
    }
});
