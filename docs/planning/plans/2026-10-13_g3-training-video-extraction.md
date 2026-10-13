# G3. Training-Folder Video Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G3 (🔵), re-scoped 2026-10-13. It supersedes [2026-10-13_g3-source-clip-reuse.md](2026-10-13_g3-source-clip-reuse.md), whose Task 1 (`713af35`) stays on this branch. Origin: BACKLOG 🔵 [2026-10-04] "Explain and trim the retrain that runs after files are moved into the like folder outside the app".
**Spec**: [2026-10-13-g3-training-video-extraction-design.md](../../superpowers/specs/2026-10-13-g3-training-video-extraction-design.md) (committed `5d9b9e6`, user-approved 2026-10-13)
**Created**: 2026-10-13
**Status**: In progress — plan approved 2026-10-13, executing subagent-driven (Sonnet · `high`, the controller commits). Task 1 ✅ `4c37cbd`; Task 2 ✅ `341026c`; Checkpoint B (the user's after run) pending; then Task 3.
**Last Updated**: 2026-10-13
**Branch**: `g3-source-vector-reuse` @ `5d9b9e6` (from `main` @ `c2673c4`)

**Goal:** Every training-folder video gets its 64-dim features again, so a training set with videos produces a cacheable model and the AI sort stops retraining when nothing changed. This is proven by the user's after run against the before run already recorded.

**Architecture:** A new `MediaViewer._releaseVideo(video)` (`removeAttribute('src')` + `load()`) becomes the only way `computeFeatures` and `computePerceptualHash` let go of a `<video>`. No `error` handler touches `src` any more. `computeFeatures` detaches its `error` handler before releasing, and also releases on timeout. Separately, `ml-training.js`'s perf line counts a failed call's time and shows `failed=N` per folder.

**Tech Stack:** Electron 39 renderer (`media-viewer.js`, ES module, no bundler), pure-ESM `ml-training.js`, Vitest 4 (node environment, extract-method tests), Playwright + Electron E2E, the bundled `ffmpeg-static` (fixture generation only), Prettier 3, ESLint 9 flat config.

**Spec:** [docs/superpowers/specs/2026-10-13-g3-training-video-extraction-design.md](../../superpowers/specs/2026-10-13-g3-training-video-extraction-design.md). Executors read both.

## Global Constraints

- **D1 — fix the loaders only.** No change to `cacheable` or the rule that a failed file blocks caching. No failure memory, no ffmpeg frame fallback.
- **D2 — release, never empty.** `_releaseVideo(video)` is exactly `video.removeAttribute('src'); video.load();`. It is the only way `computeFeatures` and `computePerceptualHash` let go of a `<video>`. After this plan, `video.src = ''` appears nowhere in those two methods.
- **D3 — no `error` handler touches `src`.** The two loaders' `error` handlers are registered `{ once: true }` and only clear the timeout and reject.
- **Messages unchanged, verbatim:**
  - `computeFeatures`: `Video load error` and `Timeout`;
  - `computePerceptualHash`: `` `Video load error: ${error.message || 'Unknown error'}` `` and `Timeout: processing took too long`.

  The session log's `Skipping <file> in <folder>: Video load error` lines must stay recognisable.
- **D4 — perf format, exactly:** `<label>: load=Nms (disk N) misses=N failed=N features=Nms clip=Nms save=Nms`. Every other part of the `ML training:` and `AI sort:` lines is unchanged.
- **Out of scope:**
  - `loadMediaAsImageData` stays unchanged (spec § 4.4, follow-up R7);
  - so do the image and JXL branches of both loaders, and `computePerceptualHash`'s timeout.
- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. Code below may wrap differently after formatting — expected.
- **ESLint**: `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; `_` prefix for unused). One-line `if (…) return;` bodies are fine (`curly` is switched off by `eslint-config-prettier`).
- **Extracted-method tests run in the global scope.** Every `this.*` a method touches must be on the mock ctx. Free identifiers such as `document`, `window` and `extractFeatures` (a global from `feature-extractor.js`) resolve through `globalThis`, so the test installs and restores them.
- **Every new test must fail against the code before its step lands**, and for the reason the plan names. Record it in the Progress Log. A test that passes by construction is labelled where it appears, with the mutation that makes it fail.
- **The E2E RED must prove its reason:** the recorded event order shows `seeked` and then `error(MEDIA_ELEMENT_ERROR: Empty src attribute)`. That rules out the fixture failing for a reason of its own (memory: a probe must discriminate).
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Never `--no-verify`. The pre-push hook runs the full E2E suite for any non-docs push.
- **Grep rule (CLAUDE.md § Best Practices)**: re-read every comment attached to code you change; grep code, tests and comments for prose describing changed behavior (e.g. "src = ''", "Video load error").
- **Commits**: one per task, made by the **controller** (memory: subagent commits vs the memory hook). Implementers leave changes in the working tree. Trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A corrupt or truncated video** (like the repo's 32-byte `tests/e2e/fixtures/tiny.mp4`). Expected: `computeFeatures` rejects once with `Video load error`, then the element is silent. Pinned in Task 1's E2E (`a video that cannot load rejects once, then goes quiet`).
2. **Two videos back to back in one rebuild** (the training loop is sequential). Expected: each resolves, and one element's release never touches the next. Pinned in Task 1 (`two videos in a row both resolve…`).
3. **Face detection off.** Expected: it resolves and goes quiet. This is the endless loop without the race, which the old code hit even when it resolved. Pinned in Task 1 (`with face detection off it resolves too…`).
4. **A video that still fails during a rebuild.** Expected: its folder segment reads `failed=1`, and the line has no `modelCacheWrite=` segment, so the line says why the model was not saved. Pinned in Task 2 (`counts the time of a call that throws…`).
5. **An engine that fires `error` on a release** (a deviation from the spec). Expected: `computeFeatures` still resolves, because its handler is detached before the release. Pinned in Task 1 (`still resolves if releasing fires an error…`, labelled).

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `media-viewer.js` | Modify | New `_releaseVideo`; the video branches of `computeFeatures` (with the timeout release) and `computePerceptualHash` |
| `ml-training.js` | Modify | `_collectFolderVectors`: timings in `finally`, `stats.failed`; `formatTrainingPerfLine`: `failed=N` |
| `tests/video-release.test.js` | Create | The fake `<video>`, and unit tests for `_releaseVideo` and both loaders |
| `tests/e2e/video-feature-extraction.test.js` | Create | The real `computeFeatures` on a playable video and on a corrupt one |
| `tests/e2e/fixtures/playable-64x64.mp4` | Create (binary, ~2.8 KB) | A real 1 s H.264 video, generated by the bundled ffmpeg |
| `tests/ml-training.test.js` | Modify | The two exact perf strings, and the new failed-call test |
| `CLAUDE.md` | Modify | Active gotcha; fixtures list; the perf lines in § Cache Management |

## Planning-time refinements of the spec (no design change)

1. **The E2E fixture.**
   - The spec names `tiny.mp4`. It is a 32-byte `ftyp`-only stub: `generate.js` says "not playable", and ffprobe says "moov atom not found". It would fail for its own reason.
   - Task 1 adds a real `playable-64x64.mp4` (H.264 like 60 of the user's 71 files, 2.8 KB), made by the bundled ffmpeg. The command is recorded in the E2E file header.
   - `tiny.mp4` becomes the corrupt-file case (Review Focus 1).
   - Git's `text=auto` treats it as binary (it contains NUL bytes), as it already does for `static.jxl`.
2. **The helper lands first.** `_releaseVideo` gets its own step, so the loader tests fail for behavioral reasons, not "method not found".
3. **The `errorOnRelease` fake** pins the detach-before-release step, which the spec calls load-bearing (§ 4.2) and which a spec-conforming fake cannot observe.
4. **The timeout release** uses a `releaseOnTimeout` hook that the video branch sets, because the timer is created before the branch.

## Task Ordering

| Order | Task | Depends on | Execute with |
| --- | --- | --- | --- |
| 1 | `_releaseVideo` + both video loaders, with unit and E2E tests | — | Sonnet · `high` |
| 2 | The perf line counts failures (`failed=N`, failed-call time) | — | Sonnet · `high` |
| B | **Checkpoint — the user's after run** | Tasks 1, 2 committed | the user |
| 3 | Docs: `CLAUDE.md` | Task 1 | Sonnet · `medium` |
| — | Finish: suite, lint, push, PR, review | all | controller |

Tasks 1 and 2 touch different files and may run in either order. Run them one at a time, never in parallel.

---

## Task 1: `_releaseVideo` and the two video loaders

**Files:**
- Modify: `media-viewer.js`. The parts:
  - the new `_releaseVideo`, directly before `async computeFeatures(` (~L8576);
  - `computeFeatures`' promise head and video branch (~L8620-8710);
  - `computePerceptualHash`'s video branch (~L7044-7087).
- Create: `tests/video-release.test.js`, `tests/e2e/video-feature-extraction.test.js`, `tests/e2e/fixtures/playable-64x64.mp4`

**Interfaces:**
- Produces: `MediaViewer._releaseVideo(video) → void`. It removes the `src` attribute, calls `load()` and fires no `error`.

- [ ] **Step 1: Generate the playable fixture**

Run from the repo root:

```bash
node_modules/ffmpeg-static/ffmpeg.exe -hide_banner -loglevel error -y -f lavfi -i "testsrc=size=64x64:rate=10:duration=1" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an tests/e2e/fixtures/playable-64x64.mp4
node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe -v error -show_entries stream=codec_name,width,height:format=duration -of compact tests/e2e/fixtures/playable-64x64.mp4
```

Expected: a ~2.8 KB file and `stream|codec_name=h264|width=64|height=64`, `format|duration=1.000000`.

- [ ] **Step 2: Write the E2E test**

Create `tests/e2e/video-feature-extraction.test.js`:

```js
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
 * <video> element it creates, then waits a second and counts the `error` events that fired after it settled.
 */
async function runComputeFeatures(page, filePath) {
    return page.evaluate(async (p) => {
        const mv = window.mediaViewer;
        mv.enableFaceDetection = true;
        const realCreate = document.createElement.bind(document);
        const events = [];
        let errorEvents = 0;
        let lateErrors = 0;
        let settled = false;
        document.createElement = (tag, ...rest) => {
            const el = realCreate(tag, ...rest);
            if (String(tag).toLowerCase() === 'video') {
                for (const type of ['loadeddata', 'seeked', 'emptied', 'error']) {
                    el.addEventListener(type, () => {
                        if (type === 'error') {
                            errorEvents++;
                            if (settled) lateErrors++;
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
        settled = true;
        await new Promise((r) => setTimeout(r, 1000));
        document.createElement = realCreate;
        return { outcome, errorEvents, lateErrors, events, faceDetector: !!window.FaceDetector };
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

    test('computeFeatures reads a real video with face detection on, and its element goes quiet', async () => {
        const out = await runComputeFeatures(page, join(tmpFixtures.dir, 'playable-64x64.mp4'));
        expect(out.faceDetector, 'the old race needs the face detector loaded').toBe(true);
        expect(out.outcome, JSON.stringify(out.events)).toBe('resolved:64');
        expect(out.lateErrors, JSON.stringify(out.events)).toBe(0);
    });

    test('a video that cannot load rejects once, then goes quiet (Review Focus 1)', async () => {
        const out = await runComputeFeatures(page, join(tmpFixtures.dir, 'tiny.mp4'));
        expect(out.outcome, JSON.stringify(out.events)).toBe('rejected:Video load error');
        expect(out.errorEvents, JSON.stringify(out.events)).toBe(1);
    });
});
```

- [ ] **Step 3: Run it to verify it fails, for the named reason**

Run: `npx playwright test tests/e2e/video-feature-extraction.test.js --reporter=line`

Expected: both FAIL.
- **Test 1:** `rejected:Video load error`. Its message prints `out.events`, which must start `["loadeddata","seeked",…` and contain `"error(MEDIA_ELEMENT_ERROR: Empty src attribute)"`. That is the proof that the fixture loaded and the `src` clearing failed it.
- **Test 2:** `errorEvents` in the tens of thousands, not 1.

Copy both failure messages into the Progress Log. If test 1 fails any other way (e.g. no `seeked` in the events), STOP and report: the fixture is not reproducing the bug.

- [ ] **Step 4: Write the unit tests**

Create `tests/video-release.test.js`:

```js
// G3 training-folder video extraction (spec docs/superpowers/specs/2026-10-13-g3-training-video-extraction-design.md
// § 6): computeFeatures and computePerceptualHash let go of a <video> through _releaseVideo, never by emptying its
// src. Run against a fake element that follows the two HTML rules the fix rests on.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable, sync or async (the technique of like-or-skip-glue.test.js). */
function extract(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(([^)]*)\\)\\s*\\{`, 'm'));
    if (!match) {
        throw new Error(`Could not find method: ${name}`);
    }
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            const Ctor = match[1] ? AsyncFunction : Function;
            return new Ctor(match[2], source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

const ERROR_CAP = 50;

/**
 * A fake <video> that follows the two HTML rules G3 rests on (spec § 2.2, D2): setting `src` to '' is a load
 * failure that fires `error`; with NO src attribute, `load()` just empties the element. It stops firing `error`
 * at ERROR_CAP, so the old endless loop shows up as a count instead of hanging the test.
 *   loadable: false — every load fails (a corrupt file);  stall: true — the file never answers (the timeout);
 *   errorOnRelease: true — a release fires `error` too. Not what the spec says; used only to pin that
 *   computeFeatures detaches its handler before it releases.
 */
class FakeVideo extends EventTarget {
    constructor({ loadable = true, stall = false, errorOnRelease = false } = {}) {
        super();
        Object.assign(this, { loadable, stall, errorOnRelease });
        this.errors = 0;
        this.srcAttr = null; // null: no src attribute
        this.videoWidth = 64;
        this.videoHeight = 48;
        this.error = null;
    }
    get src() {
        return this.srcAttr ?? '';
    }
    set src(value) {
        this.srcAttr = String(value);
        if (this.srcAttr === '' || !this.loadable) {
            this._fail();
        } else if (!this.stall) {
            this._fire('loadeddata');
        }
    }
    getAttribute(name) {
        return name === 'src' ? this.srcAttr : null;
    }
    removeAttribute(name) {
        if (name === 'src') this.srcAttr = null;
    }
    load() {
        if (this.srcAttr !== null) return;
        this._fire('emptied');
        if (this.errorOnRelease) this._fail();
    }
    set currentTime(_t) {
        this._fire('seeked');
    }
    _fire(type) {
        setTimeout(() => this.dispatchEvent(new Event(type)), 0);
    }
    _fail() {
        if (this.errors >= ERROR_CAP) return;
        this.errors++;
        this.error = { code: 4, message: 'MEDIA_ELEMENT_ERROR: Empty src attribute' };
        this._fire('error');
    }
}

// Long enough for the old loop to reach ERROR_CAP (one setTimeout(0) per error).
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const saved = { window: globalThis.window, document: globalThis.document, extractFeatures: globalThis.extractFeatures };
let videos;
let videoOptions;
beforeEach(() => {
    videos = [];
    videoOptions = {};
    globalThis.document = {
        createElement: (tag) => {
            if (tag === 'video') {
                const v = new FakeVideo(videoOptions);
                videos.push(v);
                return v;
            }
            return {
                width: 0,
                height: 0,
                getContext: () => ({
                    drawImage() {},
                    putImageData() {},
                    getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
                }),
            };
        },
    };
    globalThis.window = {
        electronAPI: { probeVideo: vi.fn(async () => ({ success: false })) },
        // Async on purpose: this await is what let the old `error` settle the promise first.
        FaceDetector: {
            detect: vi.fn(async () => {
                await new Promise((r) => setTimeout(r, 5));
                return { hasFace: false, count: 0, areaRatio: 0 };
            }),
        },
    };
    globalThis.extractFeatures = vi.fn(() => new Float32Array(64).fill(0.5));
});
afterEach(() => {
    vi.useRealTimers();
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.extractFeatures = saved.extractFeatures;
});

describe('_releaseVideo (G3)', () => {
    it('drops the src attribute and fires no error', async () => {
        const release = extract('_releaseVideo');
        const v = new FakeVideo();
        v.src = '/t/clip.mp4';
        release.call({}, v);
        await settle(20);
        expect(v.getAttribute('src')).toBeNull();
        expect(v.errors).toBe(0);
    });
});

describe('computeFeatures — video (G3)', () => {
    const computeFeatures = extract('computeFeatures');
    const ctxFor = (overrides = {}) => ({
        featureCache: new Map(),
        featureMetadata: new Map(),
        mediaFiles: [],
        enableFaceDetection: true,
        _releaseVideo: extract('_releaseVideo'),
        ...overrides,
    });
    const run = (ctx, file = '/t/clip.mp4') => computeFeatures.call(ctx, file, { size: 1 }, { useHostCache: false });

    it('resolves with face detection on, and its element fires no error afterwards', async () => {
        const features = await run(ctxFor());
        expect(features).toHaveLength(64);
        await settle();
        expect(videos[0].errors).toBe(0);
        expect(videos[0].getAttribute('src')).toBeNull();
    });

    it('with face detection off it resolves too, and still fires no error afterwards (Review Focus 3)', async () => {
        const features = await run(ctxFor({ enableFaceDetection: false }));
        expect(features).toHaveLength(64);
        await settle();
        expect(videos[0].errors).toBe(0);
    });

    it('a video that cannot load rejects once, and nothing empties its src afterwards', async () => {
        videoOptions = { loadable: false };
        await expect(run(ctxFor())).rejects.toThrow('Video load error');
        await settle();
        expect(videos[0].errors).toBe(1);
    });

    it('a stalled video times out and is released', async () => {
        vi.useFakeTimers();
        videoOptions = { stall: true };
        const assertion = expect(run(ctxFor())).rejects.toThrow('Timeout');
        await vi.advanceTimersByTimeAsync(30000);
        await assertion;
        expect(videos[0].getAttribute('src')).toBeNull();
    });

    it('two videos in a row both resolve, and neither element fires an error (Review Focus 2)', async () => {
        const ctx = ctxFor();
        expect(await run(ctx, '/t/a.mp4')).toHaveLength(64);
        expect(await run(ctx, '/t/b.webm')).toHaveLength(64);
        await settle();
        expect(videos.map((v) => v.errors)).toEqual([0, 0]);
    });

    it('still resolves if releasing fires an error — the handler is detached first (Review Focus 5)', async () => {
        // Models an engine that deviates from the spec. Mutation-check: delete the
        // `video.removeEventListener('error', onError)` line in computeFeatures' seeked handler → this rejects.
        videoOptions = { errorOnRelease: true };
        expect(await run(ctxFor())).toHaveLength(64);
    });
});

describe('computePerceptualHash — video (G3)', () => {
    const computePerceptualHash = extract('computePerceptualHash');
    const ctxFor = () => ({ blockhash: vi.fn(() => 'hash-1'), _releaseVideo: extract('_releaseVideo') });

    it('returns the hash, and its element fires no error afterwards', async () => {
        // The hash part passed before G3 as well (it resolved before the queued error); the error count is the RED.
        expect(await computePerceptualHash.call(ctxFor(), '/t/clip.mp4')).toBe('hash-1');
        await settle();
        expect(videos[0].errors).toBe(0);
        expect(videos[0].getAttribute('src')).toBeNull();
    });

    it('a video that cannot load rejects once, and nothing empties its src afterwards', async () => {
        videoOptions = { loadable: false };
        await expect(computePerceptualHash.call(ctxFor(), '/t/clip.mp4')).rejects.toThrow(
            'Video load error: Unknown error'
        );
        await settle();
        expect(videos[0].errors).toBe(1);
    });
});
```

- [ ] **Step 5: Run it to verify it fails at collection**

Run: `npx vitest run tests/video-release.test.js`
Expected: FAIL, 9 of 9. Every test extracts `_releaseVideo`, either directly or through `ctxFor`, so each fails with `Could not find method: _releaseVideo`. Record it.

- [ ] **Step 6: Add `_releaseVideo`**

In `media-viewer.js`, directly before `    async computeFeatures(filePath, fileInfo = null, { useHostCache = true } = {}) {`, add:

```js
    // Lets go of a <video> without firing `error` (G3 spec D2). With NO src attribute, the media element load
    // algorithm just empties the element; an EMPTY src attribute is a load failure that fires `error`, and an
    // `error` handler that empties src again loops forever (~37,000 events a second, measured). The only way
    // computeFeatures and computePerceptualHash release a video. Never `video.src = ''`.
    _releaseVideo(video) {
        video.removeAttribute('src');
        video.load();
    }

```

- [ ] **Step 7: Run it to verify the loader tests fail for behavioral reasons**

Run: `npx vitest run tests/video-release.test.js`

Expected: `_releaseVideo (G3)` passes. The other eight tests FAIL:
- `resolves with face detection on…`, `two videos in a row…` and `still resolves if releasing fires an error…`: rejected with `Video load error` (the race).
- `with face detection off…` and both `computePerceptualHash` tests' error counts: `expected 50 to be 0` (the loop at `ERROR_CAP`).
- Both "cannot load" tests: `expected 50 to be 1`.
- `a stalled video times out…`: `expected '/t/clip.mp4' to be null`.

Record the output.

- [ ] **Step 8: Fix `computeFeatures`**

Replace the promise head:

```js
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 30000);
            const cleanup = () => clearTimeout(timeout);
```

with:

```js
        return new Promise((resolve, reject) => {
            // Set by the video branch, so a stalled video is released rather than left holding its decoder (G3).
            let releaseOnTimeout = () => {};
            const timeout = setTimeout(() => {
                releaseOnTimeout();
                reject(new Error('Timeout'));
            }, 30000);
            const cleanup = () => clearTimeout(timeout);
```

Replace the video branch:

```js
            if (isVideo) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;

                video.addEventListener('loadeddata', () => {
                    video.currentTime = 0.1;
                });

                video.addEventListener('seeked', () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 256;
                    canvas.height = 256;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, 256, 256);
                    const imageData = ctx.getImageData(0, 0, 256, 256);
                    const videoWidth = video.videoWidth;
                    const videoHeight = video.videoHeight;
                    video.src = '';
                    processImageData(imageData, videoWidth, videoHeight);
                });

                video.addEventListener('error', () => {
                    video.src = '';
                    cleanup();
                    reject(new Error('Video load error'));
                });

                video.src = filePath;
            } else {
```

with:

```js
            if (isVideo) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;

                // G3: nothing here empties `src` (see _releaseVideo). Before, `seeked` emptied it ahead of the async
                // processImageData, whose face-detection await let the resulting `error` reject every video —
                // so every training-folder video failed and no training set with one could be cached.
                const onError = () => {
                    cleanup();
                    reject(new Error('Video load error'));
                };
                releaseOnTimeout = () => {
                    video.removeEventListener('error', onError);
                    this._releaseVideo(video);
                };

                video.addEventListener('loadeddata', () => {
                    video.currentTime = 0.1;
                });

                video.addEventListener('seeked', () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 256;
                    canvas.height = 256;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, 256, 256);
                    const imageData = ctx.getImageData(0, 0, 256, 256); // a copy: the element can go now
                    const videoWidth = video.videoWidth;
                    const videoHeight = video.videoHeight;
                    // Detach before releasing: processImageData settles the promise later, so an `error`
                    // reaching onError now would reject a frame that was read successfully.
                    video.removeEventListener('error', onError);
                    this._releaseVideo(video);
                    processImageData(imageData, videoWidth, videoHeight);
                });

                video.addEventListener('error', onError, { once: true });

                video.src = filePath;
            } else {
```

- [ ] **Step 9: Fix `computePerceptualHash`**

In its video branch, replace:

```js
                video.addEventListener('loadeddata', () => {
                    try {
                        video.currentTime = 0.1; // Seek to 0.1s to avoid black frames
                    } catch (error) {
                        cleanup();
                        video.src = '';
                        reject(error);
                    }
                });
```

with:

```js
                video.addEventListener('loadeddata', () => {
                    try {
                        video.currentTime = 0.1; // Seek to 0.1s to avoid black frames
                    } catch (error) {
                        cleanup();
                        this._releaseVideo(video);
                        reject(error);
                    }
                });
```

Replace:

```js
                        const hash = this.blockhash(imageData, 16);
                        cleanup();
                        video.src = '';
                        resolve(hash);
                    } catch (error) {
                        cleanup();
                        video.src = '';
                        reject(error);
                    }
                });

                video.addEventListener('error', (error) => {
                    cleanup();
                    video.src = '';
                    reject(new Error(`Video load error: ${error.message || 'Unknown error'}`));
                });
```

with:

```js
                        const hash = this.blockhash(imageData, 16);
                        cleanup();
                        this._releaseVideo(video);
                        resolve(hash);
                    } catch (error) {
                        cleanup();
                        this._releaseVideo(video);
                        reject(error);
                    }
                });

                // G3: never empties `src` (see _releaseVideo). The old `video.src = ''` here fired `error` again,
                // forever, after every video this method hashed.
                video.addEventListener(
                    'error',
                    (error) => {
                        cleanup();
                        reject(new Error(`Video load error: ${error.message || 'Unknown error'}`));
                    },
                    { once: true }
                );
```

(The image branch's `blockhash` site, ~L7101, is untouched.)

- [ ] **Step 10: Run the unit tests, then the E2E**

Run: `npx vitest run tests/video-release.test.js`. Expected: PASS, 9 tests.

Run: `npx playwright test tests/e2e/video-feature-extraction.test.js --reporter=line`. Expected: PASS, 2 tests.

Then confirm with `grep -n "video.src = ''" media-viewer.js` that the only remaining hits are in `loadMediaAsImageData` (out of scope, R7).

- [ ] **Step 11: Mutation checks**

Apply each mutation, run the named file, confirm the named test FAILS, then restore:
1. Delete `video.removeEventListener('error', onError);` from `computeFeatures`' `seeked` handler. Run the unit file; `still resolves if releasing fires an error…` should fail.
2. Change `_releaseVideo`'s body to `video.src = '';`. Run the unit file; every loader test that checks `errors` should fail. Run the E2E file; test 1 should fail.

Record both in the Progress Log.

- [ ] **Step 12: Run the unit suite and lint**

Run: `npx vitest run`. Expected: PASS. Run `npm run lint`: no new findings. Run `npx prettier --check media-viewer.js tests/video-release.test.js tests/e2e/video-feature-extraction.test.js`.

- [ ] **Step 13: Commit (controller)**

```bash
git add media-viewer.js tests/video-release.test.js tests/e2e/video-feature-extraction.test.js tests/e2e/fixtures/playable-64x64.mp4
git commit -m "fix(features): release videos without emptying src — every training video failed (G3)"
```

Add the trailer. Then confirm the fixture went in byte-identical: `git show HEAD:tests/e2e/fixtures/playable-64x64.mp4 | cmp - tests/e2e/fixtures/playable-64x64.mp4`. Record the SHA.

---

## Task 2: The perf line counts failures

**Files:**
- Modify: `ml-training.js` (`formatTrainingPerfLine` ~L264-282; `_collectFolderVectors` ~L511-575)
- Test: `tests/ml-training.test.js` (~L222-234, ~L1963-1975, and a new test in `perf line (G3)`)

**Interfaces:**
- Consumes: the Task-1-of-the-superseded-plan `stats` object, `formatTrainingPerfLine` and `_now` (shipped in `713af35`).
- Produces: `stats.failed` (number); the folder segment `… misses=N failed=N features=…`.

- [ ] **Step 1: Write the failing tests**

In `tests/ml-training.test.js`, in `formatTrainingPerfLine (G3)` → `rounds to whole milliseconds…`, change the `likes` object to:

```js
                likes: { loadMs: 40.5, diskCount: 1200, misses: 5, failed: 2, featuresMs: 300.2, clipMs: 912.7, saveMs: 80 },
```

and its expected string to:

```js
            'ML training: source=trained total=1235ms | scan=4ms | likes: load=41ms (disk 1200) misses=5 failed=2 features=300ms clip=913ms save=80ms | train=150ms'
```

In `perf line (G3)` → `writes one line for a rebuild, with every phase`, change the expected string to:

```js
                    'ML training: source=trained total=0ms | scan=0ms | likes: load=0ms (disk 0) misses=3 failed=0 features=0ms clip=0ms save=0ms | dislikes: load=0ms (disk 0) misses=3 failed=0 features=0ms clip=0ms save=0ms | bulk=0ms | train=0ms | modelCacheWrite=0ms',
```

At the end of `perf line (G3)` (before its closing `});`), add:

```js
        it('counts the time of a call that throws, and shows failed=N (G3 re-scope, Review Focus 4)', async () => {
            // Before: a throwing computeFeatures' time was dropped, so the before run's `dislikes: features=0ms`
            // hid 66 failed calls, and nothing in the line said why the model was not cached.
            let t = 0;
            const { m } = scenario({
                managerOverrides: {
                    logPerf: vi.fn(),
                    now: () => t,
                    computeFeatures: vi.fn(async (p) => {
                        t += 100;
                        if (p === '/likes/l1.jpg') throw new Error('Video load error');
                        return new Float32Array(64).fill(0.5);
                    }),
                },
            });
            await m.ensureTrainedModel({});
            const line = m.logPerf.mock.calls[0][0];
            expect(line).toContain('likes: load=0ms (disk 0) misses=3 failed=1 features=300ms clip=0ms save=0ms');
            expect(line).toContain('dislikes: load=0ms (disk 0) misses=3 failed=0 features=300ms');
            expect(line).not.toContain('modelCacheWrite='); // a failed file still blocks the model cache (D1)
        });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ml-training.test.js`

Expected: three FAIL.
- The two exact strings: the output has no `failed=`.
- The new test: `features=200ms` and no `failed=1`.

The `not.toContain('modelCacheWrite=')` assertion passes by construction (D1 leaves the rule alone). Record it.

- [ ] **Step 3: Implement**

In `formatTrainingPerfLine`, replace:

```js
            `${label}: load=${ms(f.loadMs)} (disk ${f.diskCount}) misses=${f.misses} ` +
```

with:

```js
            `${label}: load=${ms(f.loadMs)} (disk ${f.diskCount}) misses=${f.misses} failed=${f.failed} ` +
```

In `_collectFolderVectors`, replace:

```js
        const stats = { loadMs: 0, diskCount: 0, misses: 0, featuresMs: 0, clipMs: 0, saveMs: 0 };
```

with:

```js
        const stats = { loadMs: 0, diskCount: 0, misses: 0, failed: 0, featuresMs: 0, clipMs: 0, saveMs: 0 };
```

Replace:

```js
                try {
                    const tFeatures = this._now();
                    const feature = hadHit ? hit.feature : await this.computeFeatures(file.path, file);
                    if (!hadHit) stats.featuresMs += this._now() - tFeatures;
                    const tClip = this._now();
                    const clip = await this.extractClipEmbedding(file.path);
                    stats.clipMs += this._now() - tClip;
```

with:

```js
                try {
                    // Timed in `finally`, so a call that throws is counted too (G3 re-scope: the before run's
                    // `features=0ms` hid 66 failed calls).
                    let feature;
                    const tFeatures = this._now();
                    try {
                        feature = hadHit ? hit.feature : await this.computeFeatures(file.path, file);
                    } finally {
                        if (!hadHit) stats.featuresMs += this._now() - tFeatures;
                    }
                    let clip;
                    const tClip = this._now();
                    try {
                        clip = await this.extractClipEmbedding(file.path);
                    } finally {
                        stats.clipMs += this._now() - tClip;
                    }
```

In the same method's `catch (err) {`, replace:

```js
                } catch (err) {
                    failed++;
```

with:

```js
                } catch (err) {
                    failed++;
                    stats.failed++;
```

Re-read the comment block above `_collectFolderVectors` and the `// Per-folder timings and counts for the perf line` comment (grep rule). Neither should need a change, but confirm.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ml-training.test.js`. Expected: PASS, including the unchanged `writes source=failed and still rejects…` regex test. Then run `npx vitest run` and `npm run lint`.

- [ ] **Step 5: Mutation check**

Move `stats.featuresMs += …` back after the `await` (out of the `finally`). Run `npx vitest run tests/ml-training.test.js -t "counts the time of a call that throws"`; it should FAIL with `features=200ms`. Restore and record.

- [ ] **Step 6: Commit (controller)**

```bash
git add ml-training.js tests/ml-training.test.js
git commit -m "feat(ml): perf line counts failed calls — failed=N and their time (G3)"
```

Add the trailer. Record the SHA. **Tasks 1 and 2 together make the after-run build.**

---

## Checkpoint B: the user's after run

The controller asks the user to do the following on the after-run build, then paste the output (spec § 7):

1. Close the app (the old session's error loops die with it).
2. `npm start`. Open `Liked_2` with the usual like (`Liked_3`) and dislike (`Liked_1`) folders. Run the AI sort once.
3. Run the AI sort again, in the same session.
4. Close the app, `npm start`, and run the AI sort once more.
5. Paste: `Get-Content "$env:APPDATA\media_viewer\logs\media-viewer-perf.log" -Tail 6`.

**Acceptance (spec § 7):**

| Run | Expected |
| --- | --- |
| Run 1 | `failed=0` in both folder segments; `dislikes: misses` ≈ 66 plus anything new; real `features=`/`clip=` times; a `modelCacheWrite=` segment |
| Run 2 | `source=session`, `training=` ≈ the scan time, and no `sourceCacheLoad` |
| Run 3 | `source=model-cache` |

Record all six lines verbatim under **After run**, with the comparison against **Before run**. The before run is in the superseded plan's § Before run; copy it here first.

If run 1 shows `failed=N > 0`, read the session log's `Skipping … :` lines. Those files fail for a reason of their own, which is follow-up R1/R2's case. Note it and continue: the fix is still correct for the 71 known files.

---

## Task 3: Docs — `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: The fixtures line in § Architecture**

Replace:

```
│   └── e2e/             # fixtures/ (1x1 PNGs, tiny.mp4, static.jxl) + helpers/ (electron-app.js, electron-wrapper.cjs/.cmd, rdp-preload.cjs)
```

with:

```
│   └── e2e/             # fixtures/ (1x1 PNGs, tiny.mp4 — a 32-byte unplayable stub, playable-64x64.mp4 — a real 1 s H.264 clip, static.jxl) + helpers/ (electron-app.js, electron-wrapper.cjs/.cmd, rdp-preload.cjs)
```

- [ ] **Step 2: The training-vector cache bullet in § Cache Management**

After the sentence `Source-folder maps are read-only to the manager (\`getBulkRatedContext\`) — bulk-rated files legitimately live there; training-folder files never do.`, insert:

```
Each `ensureTrainedModel` call writes one `ML training: …` line and each AI sort one `AI sort: …` line to `media-viewer-perf.log` (G3); a folder segment's `failed=N` names files that block the model cache (`rowsFailed > 0` → not cacheable → every sort retrains).
```

- [ ] **Step 3: An active gotcha**

In § Git Insights → **Active gotchas**, directly before the line that starts `- JXL rendering:`, insert:

```
- **Release a `<video>` with `_releaseVideo(video)` (`removeAttribute('src')` + `load()`), never `video.src = ''`.** An empty `src` attribute is itself a load failure that fires `error`. An `error` handler that empties `src` again loops forever (~37,000 events a second per element, measured). Emptying it before an `await` lets that `error` settle the promise first. Until G3 (2026-10-13) this made `computeFeatures` reject every video while face detection was on. Every training-folder video failed, and since a failed file blocks the model cache, every AI sort retrained. `computePerceptualHash` leaked the same loop. `loadMediaAsImageData` still empties `src` once it is done: one stray `error`, no loop (BACKLOG).
```

- [ ] **Step 4: Check and commit (controller)**

Run `node scripts/check-docs-index.js`. Expected: no output, exit 0.

```bash
git add CLAUDE.md
git commit -m "docs: G3 video-release gotcha, fixtures and perf lines in CLAUDE.md"
```

Add the trailer.

---

## Finish (after Task 3)

- [ ] Run `npx vitest run`, `npm run lint` and `npm run format:check`. All must be clean.
- [ ] Re-read every comment attached to changed code (grep rule). Grep `media-viewer.js` and `tests/` for `video.src = ''` and for prose such as "clear the src".
- [ ] Update this plan: Status, Progress Log, Before/After run, Key Discoveries. Mark the superseded plan's Status `Superseded` (done at planning time; confirm).
- [ ] Push (pre-push runs the E2E suite; expected: RUN, all green; record the count). Open the PR. Its body:
  - a summary;
  - the before and after lines;
  - both specs' links and the redirect story;
  - the test plan;
  - follow-ups R1–R7.

  The body ends with the `🤖 Generated with [Claude Code](https://claude.com/claude-code)` line.
- [ ] Review: standard (`high`). **Ask the user** before running any code review in this chat (memory: the usual flow is PR → review in a separate chat).

## Improvements (minimum 2 required before Extract)

From spec § 8, each routed 🟤 at closeout with the before-run numbers:

- 🟤 **R1 — Remember a stable failure** (`name` + `size` + `mtime`) so a genuinely undecodable file stops being retried and stops blocking the model cache. This changes the 2026-09-10 rule. Trigger: `failed=N > 0` in a real run.
- 🟤 **R2 — An ffmpeg frame fallback** for videos Chromium cannot decode, as the CLIP path already does with `extractKeyframes`.
- 🟤 **R4 — The source-folder cache load costs 25.1 s** (`sourceCacheLoad`) on each session's first sort, for 16,213 entries.
- 🟤 **R5 — F1 train/score skew:** source-folder 64-dim vectors are extracted without file metadata, so dims 42–47 and 54–61 differ between training and scoring.
- 🟤 **R6 — The parked source-CLIP reuse** (`g3-departed-clips-parked` @ `e11b36e`, with F2/F3). Revisit only if a measurement shows CLIP on moved or rated files matters.
- 🟤 **R7 — `loadMediaAsImageData` still empties `src`** (one stray `error` per video, no loop). Move it to `_releaseVideo`.
- 🟤 **R8 — Three other video teardown sites** (`media-viewer.js` ~L2143, ~L3350-3351, ~L6667) already release with `removeAttribute('src')` + `load()` by hand. Route them through `_releaseVideo` so the rule has one owner. Surfaced by Task 1's review.

## Residuals for Extract

- **R3:** annotate BACKLOG item (1)'s 🟤 entry ("every rebuild re-streams both training folders' `.feature_cache.json` in full") with `load=` 31.2 s + 27.7 s = 58.9 s of a 90.7 s rebuild, measured 2026-10-13. After this fix it is the dominant cost of every rebuild.
- From the superseded plan's Task 1 review, the deferred minors for the final review to triage:
  - `misses` also counts CLIP-only re-extractions;
  - a throwing `ensureTrainedModel` leaves no `training` phase in the `AI sort:` line.

  Its third minor (a failed call's time is dropped) is fixed by Task 2.

## Closeout (after the merge, on `main`)

Per `~/.claude/rules/planning-closeout.md`:
1. **Extract:** the Improvements → BACKLOG 🟤 under `### [YYYY-MM-DD] From: G3 closeout`; the Residuals annotations.
2. **Archive:** this plan *and* the superseded plan → `docs/archive/plans/`; `git rm` both originals; index both in `docs/README.md`.
3. **Transition:**
   - a DONE.md entry naming the re-scope;
   - WEEKLY's Summary-Table G3 Status → `✅ <merge-SHA> (PR #N)`, and its row text re-scoped;
   - the Wednesday Daily-Schedule row;
   - the 🔵 [2026-10-04] entry — check it off if the user agrees the retrain they reported is explained and trimmed, else annotate it.
4. A post-implementation note on both specs.
5. **Commit.**
6. **Capture learnings:**
   - the measure-first run overturned the BACKLOG premise;
   - an empty `src` fires `error`;
   - a 32-byte stub fixture is not a video.

Propagation check: any late measurement or review fix that changes what `CLAUDE.md` now says.

## Progress Log

- **2026-10-13** — Re-scoped by the user after the before run (superseded plan, § Before run and its Progress Log). Root cause probed in the real app (spec § 2.2). Spec `5d9b9e6`, approved. Plan written. At planning, found that `tiny.mp4` is an unplayable 32-byte stub, so a playable fixture is added (refinement 1).
- **2026-10-13** — The user approved the plan ("Agree with subagent-driven"). The pre-flight scan found no cross-task conflict; one prose overlap in Task 1 Step 7 was ruled on (the hash cannot-load test expects `… to be 1`). Ledger: `.superpowers/sdd/2026-10-13_g3-training-video-extraction/progress.md`.
- **2026-10-13 — Task 1 ✅ `4c37cbd`.** Fixture: 2862 B, `h264 64x64`, `duration=1.000000`, byte-identical in the commit (`cmp`).
  - **E2E RED (gate passed).**
    - Test 1: `rejected:Video load error`, with events `["loadeddata","seeked","emptied","error(MEDIA_ELEMENT_ERROR: Empty src attribute)","emptied","error(…)",…]`. The fixture loaded and seeked, and the empty `src` failed it.
    - Test 2 (`tiny.mp4`): `errorEvents` **31,898** in about 1 s. The first error is `PipelineStatus::DEMUXER_ERROR_COULD_NOT_OPEN`, then the empty-src loop.
  - **Unit RED.**
    - Step 5: 9/9 failed with `Could not find method: _releaseVideo`.
    - Step 7: 8 failed, each for its named reason:
      - 3 race rejections with `Video load error`;
      - the stall test with `expected '/t/clip.mp4' to be null`;
      - the loop tests with `expected 13|15 to be 0` and `expected 16 to be 1`.

      The counts are 13–16, not the 50 of `ERROR_CAP`: a 150 ms settle window at Windows timer granularity. The cause is the same.
  - **GREEN.** Unit 9/9; E2E 2/2. Test 1's events are `["loadeddata","seeked","emptied"]` and `errorEvents` is 0, so the real engine fires no `error` on `removeAttribute('src')` + `load()` (D2 holds).
  - **Mutations.**
    - Deleting the detach in `seeked` fails `still resolves if releasing fires an error…`.
    - Setting `_releaseVideo`'s body to `src = ''` fails 6 unit tests. In the E2E, the first run caught nothing: Step 11's claim was wrong, because the single release `error` fired before `settled`, so `lateErrors` stayed 0. Ruled: test 1 now asserts `errorEvents === 0`, which the mutation fails (`expected 0, received 1`).
  - Full suite 1381 passed, 1 skipped. Lint 0 errors.
  - Step 10's grep returns 3 hits, not 1: two are comments that quote `video.src = ''` on purpose, and the code hit is `loadMediaAsImageData` (R7).
  - **Rulings.**
    - `_releaseVideo` sits above `computeFeatures`' JSDoc. The literal placement would have orphaned the JSDoc.
    - The `settle` comment was corrected.
  - **Task review (Opus):** spec ✅, Approved, 0 Critical/Important. Its 7 minors:
    - 4 are parked for the final-review fix (labels, a `blockhash`-throws test, two comment wordings);
    - 1 is new Improvement R8;
    - 2 are kept or noted.
- **2026-10-13 — Task 2 ✅ `341026c`.**
  - **RED: 3 tests.** Both exact strings had no `failed=`. The new test showed `features=200ms` and no `failed=1`. Its `not.toContain('modelCacheWrite=')` passes by construction (D1).
  - **GREEN:** `tests/ml-training.test.js` passes 116/116. The full suite has 1382 passed and 1 skipped.
  - **Mutation:** moving the features timing out of `finally` gives `features=200ms` again.
  - **Grep:** no other place spells out the old format.
  - **Task review (Sonnet):** spec ✅, Approved, 0 Critical/Important. Its 2 cosmetic minors are accepted as is.
  - Tasks 1 and 2 make the after-run build.

### Before run

Copied from the superseded plan's § Before run. Build `713af35`, 2026-10-13. The 16:51 pair is the before run (5 files moved into `Liked_3`: 1 mp4, 1 gif, 2 jpg, 1 png); 16:35 is the earlier first rebuild.

```
[2026-10-13 16:35:53.682] [PERF] ML training: source=trained total=293535ms | scan=8474ms | likes: load=37649ms (disk 15434) misses=428 features=75511ms clip=66246ms save=3815ms | dislikes: load=31256ms (disk 12821) misses=230 features=27881ms clip=24165ms save=3020ms | bulk=30ms | train=2523ms
[2026-10-13 16:37:05.012] [PERF] AI sort: outcome=done total=395896ms | mlInit=86ms | clipLoad=3716ms | sourceCacheLoad=27226ms | training=293536ms (trained) | extract=69242ms | sort=903ms | files=16213
[2026-10-13 16:51:40.121] [PERF] ML training: source=trained total=90722ms | scan=3703ms | likes: load=31236ms (disk 15855) misses=12 features=5663ms clip=1202ms save=4065ms | dislikes: load=27675ms (disk 12979) misses=72 features=0ms clip=247ms save=0ms | bulk=2ms | train=2633ms
[2026-10-13 16:51:42.292] [PERF] AI sort: outcome=done total=119804ms | mlInit=54ms | clipLoad=1803ms | sourceCacheLoad=25052ms | training=90723ms (trained) | extract=667ms | sort=1031ms | files=16208
```

- CLIP for the moved files took ≤ 1.2 s, about 1% of the sort.
- The training caches' `load=` took 31.2 + 27.7 = 58.9 s of the 90.7 s rebuild; `sourceCacheLoad` took 25.1 s.
- Neither line has a `modelCacheWrite=` segment: the 71 failing videos made the model uncacheable.
- About 14 s of the rebuild is unaccounted for: the time of failed calls, which the line dropped (Task 2 fixes this).

### After run

_(Checkpoint B — the user's lines, verbatim, and the comparison.)_

## Key Discoveries

- **Measure first paid for itself.** The BACKLOG entry's mechanism ("each moved file is extracted from scratch") was true, but it cost about 1% of the sort. The measured cause of the retrain was unrelated to the moves: every sort retrained because every training-folder video failed (memory: a BACKLOG entry's stated mechanism is a hypothesis).
- **An empty `src` attribute is a load failure.** `video.src = ''` fires `error`, and in an `error` handler that does it again, the loop never ends.
