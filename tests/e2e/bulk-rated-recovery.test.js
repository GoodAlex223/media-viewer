import { test, expect } from '@playwright/test';
import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, waitForMedia, createTempFixtureDir } from './helpers/electron-app.js';

// The user's ruling on PR #87 review #2 (2026-10-24): when another program holds .bulk_rated.json open, the writer
// overwrites it in place, keeping its whole tmp until that write is complete. A crash mid-overwrite leaves the file
// torn with the tmp beside it. Main's load then reads the tmp, and the renderer writes the file back whole. A file
// that is missing, not torn, is left missing, so ratings the user deleted are not brought back.

const WHOLE = { version: 1, good: ['red-1x1.png'], bad: ['blue-1x1.png'] };
// A name the writer gives its tmps (atomic-write.js tmpPathFor: <file>.<12 hex>.tmp).
const TMP = '.bulk_rated.json.0123456789ab.tmp';

test.describe('Bulk-rated recovery from the writer’s last whole copy', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        ({ electronApp, page } = await launchApp());
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    const ratingsOnScreen = () =>
        page.evaluate(() => Object.fromEntries([...window.mediaViewer.bulkRated.entries()].sort()));
    const onDisk = async () => JSON.parse(await readFile(join(tmpFixtures.dir, '.bulk_rated.json'), 'utf8'));

    test('a torn file loads its ratings from the whole copy, and is written back whole', async () => {
        await writeFile(join(tmpFixtures.dir, '.bulk_rated.json'), '{"version":1,"good":["red-1'); // the crash
        await writeFile(join(tmpFixtures.dir, TMP), JSON.stringify(WHOLE));
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        expect(await ratingsOnScreen()).toEqual({ 'blue-1x1.png': 'bad', 'red-1x1.png': 'good' });
        await expect.poll(() => onDisk().catch(() => null)).toEqual(WHOLE);
    });

    test('a missing file stays missing, whatever copy lies beside it', async () => {
        await writeFile(join(tmpFixtures.dir, TMP), JSON.stringify(WHOLE));
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        expect(await ratingsOnScreen()).toEqual({});
        await page.waitForTimeout(500);
        await expect(access(join(tmpFixtures.dir, '.bulk_rated.json'))).rejects.toThrow();
    });

    test('a whole file wins over a copy beside it', async () => {
        await writeFile(
            join(tmpFixtures.dir, '.bulk_rated.json'),
            JSON.stringify({ version: 1, good: ['green-1x1.png'], bad: [] })
        );
        await writeFile(join(tmpFixtures.dir, TMP), JSON.stringify(WHOLE));
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        expect(await ratingsOnScreen()).toEqual({ 'green-1x1.png': 'good' });
    });
});
