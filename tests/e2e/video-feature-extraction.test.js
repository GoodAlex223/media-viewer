// G3 (spec docs/superpowers/specs/2026-10-13-g3-training-video-extraction-design.md § 6): the real
// computeFeatures on a real video with face detection on — the path on which every training-folder video
// failed, so every AI sort retrained. playable-64x64.mp4 is a 1 s H.264 clip made by the bundled ffmpeg:
//   node_modules/ffmpeg-static/ffmpeg.exe -f lavfi -i "testsrc=size=64x64:rate=10:duration=1" -c:v libx264
//     -pix_fmt yuv420p -movflags +faststart -an tests/e2e/fixtures/playable-64x64.mp4
// tiny.mp4 is a 32-byte stub that no player can load: the corrupt-file case.
import { test, expect } from '@playwright/test';
import { join } from 'path';
import { launchApp, closeApp, grantFolder, createTempFixtureDir } from './helpers/electron-app.js';

/**
 * Runs window.mediaViewer.computeFeatures on `filePath` with face detection on, recording every event on the
 * <video> element it creates, then waits a second after it settles so that a post-settle `error` loop shows up in
 * `errorEvents`.
 */
async function runComputeFeatures(page, filePath) {
    return page.evaluate(async (p) => {
        const mv = window.mediaViewer;
        mv.enableFaceDetection = true;
        const realCreate = document.createElement.bind(document);
        const events = [];
        let errorEvents = 0;
        document.createElement = (tag, ...rest) => {
            const el = realCreate(tag, ...rest);
            if (String(tag).toLowerCase() === 'video') {
                for (const type of ['loadeddata', 'seeked', 'emptied', 'error']) {
                    el.addEventListener(type, () => {
                        if (type === 'error') {
                            errorEvents++;
                        }
                        if (events.length < 12) {
                            events.push(type === 'error' ? `error(${el.error && el.error.message})` : type);
                        }
                    });
                }
            }
            return el;
        };
        let outcome;
        try {
            const features = await mv.computeFeatures(p, {}, { useHostCache: false });
            outcome = `resolved:${features.length}`;
        } catch (err) {
            outcome = `rejected:${err.message}`;
        }
        await new Promise((r) => setTimeout(r, 1000));
        document.createElement = realCreate;
        return { outcome, errorEvents, events, faceDetector: !!window.FaceDetector };
    }, filePath);
}

test.describe('Video feature extraction (G3)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        ({ electronApp, page } = await launchApp());
        tmpFixtures = await createTempFixtureDir(['playable-64x64.mp4', 'tiny.mp4']);
        await grantFolder(electronApp, tmpFixtures.dir);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    test('computeFeatures reads a real video with face detection on, and its element fires no error', async () => {
        const out = await runComputeFeatures(page, join(tmpFixtures.dir, 'playable-64x64.mp4'));
        expect(out.faceDetector, 'the old race needs the face detector loaded').toBe(true);
        expect(out.outcome, JSON.stringify(out.events)).toBe('resolved:64');
        expect(out.errorEvents, JSON.stringify(out.events)).toBe(0);
    });

    test('a video that cannot load rejects once, then goes quiet (Review Focus 1)', async () => {
        const out = await runComputeFeatures(page, join(tmpFixtures.dir, 'tiny.mp4'));
        expect(out.outcome, JSON.stringify(out.events)).toBe('rejected:Video load error');
        expect(out.errorEvents, JSON.stringify(out.events)).toBe(1);
    });
});
