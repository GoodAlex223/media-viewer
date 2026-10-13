# G3. Training-Folder Video Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G3 (🔵), re-scoped 2026-10-13. It supersedes [2026-10-13_g3-source-clip-reuse.md](2026-10-13_g3-source-clip-reuse.md), whose Task 1 (`713af35`) stays on this branch. Origin: BACKLOG 🔵 [2026-10-04] "Explain and trim the retrain that runs after files are moved into the like folder outside the app".
**Spec**: [2026-10-13-g3-training-video-extraction-design.md](../../superpowers/specs/2026-10-13-g3-training-video-extraction-design.md) (committed `5d9b9e6`, user-approved 2026-10-13)
**Created**: 2026-10-13
**Status**: In progress — plan approved 2026-10-13, executing subagent-driven (Sonnet · `high`, the controller commits). Task 1 ✅ `4c37cbd`; Task 2 ✅ `341026c`; Checkpoint B done 2026-10-13. The video fix worked but nothing was cached, so Task 2b was added (spec § 11, approved 2026-10-14) and is ✅ `2cd6186` + `a19aef5`. Checkpoint B2 ✅ 2026-10-14 (acceptance met — § After run 2). Task 3 ✅. Finish (final review, push, PR) next.
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
- **D4 — perf format, exactly:** `<label>: load=Nms (disk N) misses=N failed=N features=Nms clip=Nms save=Nms`. Every other part of the `ML training:` and `AI sort:` lines is unchanged. **Amended by spec § 11 (Task 2b):** `… misses=N failed=N noClip=N features=…`.
- **D6–D8 (spec § 11, Task 2b):**
  - Main's CLIP path decode tries the strict `RawImage.read` first; only a rejected file gets the lenient sharp decode, so existing embeddings are byte-identical.
  - Only the `extractClipEmbedding` handler changes; the batch and buffer handlers do not.
  - Every fallback, and every double failure, is a `warn` in the session log; every CLIP-less training row is named via `logError`.
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
6. **A file neither CLIP decoder can read** (Task 2b). Expected:
   - the IPC reply's `error` is the strict error, unchanged;
   - the session log names the file;
   - the training row counts toward `noClip`, and the model is not cached.

   Pinned in Task 2b: `rethrows the strict error…` and `counts and names a training file left without a CLIP vector…`.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `media-viewer.js` | Modify | New `_releaseVideo`; the video branches of `computeFeatures` (with the timeout release) and `computePerceptualHash` |
| `ml-training.js` | Modify | `_collectFolderVectors`: timings in `finally`, `stats.failed`; `formatTrainingPerfLine`: `failed=N` |
| `tests/video-release.test.js` | Create | The fake `<video>`, and unit tests for `_releaseVideo` and both loaders |
| `tests/e2e/video-feature-extraction.test.js` | Create | The real `computeFeatures` on a playable video and on a corrupt one |
| `tests/e2e/fixtures/playable-64x64.mp4` | Create (binary, ~2.8 KB) | A real 1 s H.264 video, generated by the bundled ffmpeg |
| `tests/ml-training.test.js` | Modify | The two exact perf strings, and the new failed-call test; Task 2b: `noClip=N` strings and two CLIP-less tests |
| `clip-image.js` | Create (Task 2b) | `readClipImage`: the strict `RawImage.read`, then a lenient sharp decode |
| `tests/clip-image.test.js` | Create (Task 2b) | Real `RawImage` + real sharp on generated fixtures |
| `main.js` | Modify (Task 2b) | The `extractClipEmbedding` handler uses `readClipImage` |
| `eslint.config.mjs`, `package.json`, `package-lock.json` | Modify (Task 2b) | Lint group for `clip-image.js`; `sharp` as a direct dependency |
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
| B | **Checkpoint — the user's after run** (done 2026-10-13: `failed=0`, but nothing cached → spec § 11) | Tasks 1, 2 committed | the user |
| 2b | The CLIP blocker: lenient decode fallback, `noClip=N`, CLIP-less files named (added 2026-10-14) | Task 2 | Sonnet · `high` |
| B2 | **Checkpoint — the user's second after run** (same three sorts) | Task 2b committed | the user |
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

## Task 2b: The CLIP blocker — a lenient decode fallback, named in the logs (spec § 11, added 2026-10-14)

**Why:** after the first after run, `failed=0` but nothing was cached. 9 still images never get a CLIP vector, because main's strict `RawImage.read` rejects them, and a CLIP-less training row keeps the model out of the cache (spec § 11.1).

**Files:**
- Create: `clip-image.js` (main-process CJS module), `tests/clip-image.test.js`
- Modify:
  - `main.js`: the `extractClipEmbedding` handler (~L1131-1173);
  - `eslint.config.mjs`: group 1's `files` list (L68);
  - `package.json` / `package-lock.json`: `sharp` as a direct dependency;
  - `ml-training.js`: `formatTrainingPerfLine` ~L125; `_collectFolderVectors` ~L513 and ~L571;
  - `tests/ml-training.test.js`.

**Interfaces:**
- Produces: `readClipImage(imagePath, { RawImage, sharp, warn }) → Promise<RawImage>`; `LENIENT_MAX_SIDE = 1024`. Also `stats.noClip`, and the folder segment `… failed=N noClip=N features=…`.

- [ ] **Step 1: Write the `clip-image` tests**

Create `tests/clip-image.test.js`:

```js
// G3 addendum (spec docs/superpowers/specs/2026-10-13-g3-training-video-extraction-design.md § 11): main's CLIP
// decode falls back to a lenient sharp decode only when the strict RawImage.read rejects a file. Runs against the
// real RawImage and the real sharp, on fixtures generated here.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { readClipImage, LENIENT_MAX_SIDE } = require('../clip-image');

let RawImage;
let dir;
const files = {};

beforeAll(async () => {
    ({ RawImage } = await import(
        pathToFileURL(path.join(__dirname, '..', 'node_modules/@huggingface/transformers/dist/transformers.node.mjs'))
            .href
    ));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-image-'));
    // Noise, so the entropy-coded data is large and cutting it leaves a truncated scan.
    const jpeg = await sharp({
        create: { width: 2000, height: 1000, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } },
    })
        .jpeg()
        .toBuffer();
    files.good = path.join(dir, 'good.jpg');
    fs.writeFileSync(files.good, jpeg);
    files.truncated = path.join(dir, 'truncated.jpg');
    fs.writeFileSync(files.truncated, jpeg.subarray(0, Math.floor(jpeg.length * 0.6)));
    files.greyAlpha = path.join(dir, 'grey-alpha.png');
    await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 90, g: 90, b: 90, alpha: 0.5 } } })
        .toColourspace('b-w')
        .png()
        .toFile(files.greyAlpha);
    files.notImage = path.join(dir, 'not-an-image.jpg');
    fs.writeFileSync(files.notImage, Buffer.from('this is not an image'));
});

afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readClipImage (G3 addendum)', () => {
    it('returns exactly what the strict read returns, and never calls the fallback', async () => {
        const spy = vi.fn(sharp);
        const warn = vi.fn();
        const image = await readClipImage(files.good, { RawImage, sharp: spy, warn });
        const strict = await RawImage.read(files.good);
        expect([image.width, image.height, image.channels]).toEqual([strict.width, strict.height, strict.channels]);
        expect(Buffer.from(image.data).equals(Buffer.from(strict.data))).toBe(true);
        expect(spy).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('decodes a truncated JPEG that the strict read rejects, to 3 channels within LENIENT_MAX_SIDE', async () => {
        await expect(RawImage.read(files.truncated)).rejects.toThrow(); // the fixture discriminates
        const warn = vi.fn();
        const image = await readClipImage(files.truncated, { RawImage, sharp, warn });
        expect(image.channels).toBe(3);
        expect(Math.max(image.width, image.height)).toBe(LENIENT_MAX_SIDE);
        expect(image.data.length).toBe(image.width * image.height * 3);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/^CLIP: truncated\.jpg needed the lenient decoder \(.+\)$/);
    });

    it('decodes a grey+alpha PNG to 3 channels', async () => {
        const image = await readClipImage(files.greyAlpha, { RawImage, sharp, warn: vi.fn() });
        expect(image.channels).toBe(3);
        expect([image.width, image.height]).toEqual([64, 32]);
    });

    it('rethrows the strict error when neither decoder can read the file', async () => {
        const strictMessage = await RawImage.read(files.notImage).then(
            () => 'resolved',
            (err) => err.message
        );
        const warn = vi.fn();
        await expect(readClipImage(files.notImage, { RawImage, sharp, warn })).rejects.toThrow(strictMessage);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/^CLIP: cannot decode not-an-image\.jpg: /);
    });

    it('asks sharp for no failure threshold and no pixel limit (the 280-megapixel case)', async () => {
        // A mechanism pin: no small fixture exceeds sharp's 268-megapixel default. Mutation-check: drop
        // `limitInputPixels: false` from clip-image.js → this fails.
        const spy = vi.fn(sharp);
        await readClipImage(files.truncated, { RawImage, sharp: spy, warn: vi.fn() });
        expect(spy).toHaveBeenCalledWith(files.truncated, { failOn: 'none', limitInputPixels: false });
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/clip-image.test.js`

Expected: FAIL at collection, with `Cannot find module '../clip-image'`. Record it.

Also confirm the fixtures discriminate, before writing the module. In a scratch Node script outside the repo, check that the real `RawImage.read` rejects `truncated.jpg` and `grey-alpha.png` generated as above. Record both messages.
- If `grey-alpha.png` is NOT rejected, keep its test but label it in a comment: "passes by construction against the strict read; pins the 3-channel output".
- If `truncated.jpg` is NOT rejected, STOP and report: the main fixture does not reproduce the failure.

- [ ] **Step 3: Write `clip-image.js`**

```js
'use strict';
// Decodes an image file for the CLIP vision encoder, in the main process (G3 addendum, spec § 11).
// RawImage.read decodes through sharp with its defaults: failOn 'warning' and a 268-megapixel input limit. Those
// reject truncated or slightly malformed files that Chromium displays without complaint. A training-folder file
// left without a CLIP vector keeps the model out of the cache (ml-training.js `cacheable`), so every AI sort
// retrained. The strict read stays first, so every embedding it can produce is unchanged. Only a file it rejects
// gets the lenient decode.

const path = require('path');

// Far above CLIP's 224-px input, and small enough that sharp shrinks a 280-megapixel JPEG while loading it.
const LENIENT_MAX_SIDE = 1024;

/**
 * @param {string} imagePath
 * @param {{ RawImage: any, sharp: Function, warn?: (message: string) => void }} deps
 *   RawImage from @huggingface/transformers; the sharp module; a sink for the session log.
 * @returns {Promise<any>} a RawImage
 */
async function readClipImage(imagePath, { RawImage, sharp, warn = () => {} }) {
    try {
        return await RawImage.read(imagePath);
    } catch (strictError) {
        const name = path.basename(imagePath);
        let decoded;
        try {
            decoded = await sharp(imagePath, { failOn: 'none', limitInputPixels: false })
                .rotate()
                .resize(LENIENT_MAX_SIDE, LENIENT_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
                .removeAlpha()
                .toColourspace('srgb')
                .raw()
                .toBuffer({ resolveWithObject: true });
        } catch (lenientError) {
            warn(`CLIP: cannot decode ${name}: ${strictError.message} (lenient: ${lenientError.message})`);
            throw strictError;
        }
        warn(`CLIP: ${name} needed the lenient decoder (${strictError.message})`);
        const { data, info } = decoded;
        return new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels);
    }
}

module.exports = { readClipImage, LENIENT_MAX_SIDE };
```

Add `'clip-image.js'` to `eslint.config.mjs` group 1's `files` list:

```js
        files: ['main.js', 'logger.js', 'path-grants.js', 'ipc-guard.js', 'clip-image.js'],
```

Make `sharp` a direct dependency, at the range `@huggingface/transformers` already uses: `npm install --save sharp@^0.34.5`. Confirm that `package.json` gains `"sharp": "^0.34.5"`, and that `npm ls sharp` shows one copy, `0.34.5`, deduped.

- [ ] **Step 4: Run the `clip-image` tests**

Run: `npx vitest run tests/clip-image.test.js`. Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into `main.js`**

At the top, with the other local requires (after `const { createIpcGuard, … } = require('./ipc-guard');`), add:

```js
const { readClipImage } = require('./clip-image');
```

In the `extractClipEmbedding` handler, replace:

```js
            const { RawImage } = await import('@huggingface/transformers');

            // Read image file and create RawImage
            const image = await RawImage.read(imagePath);
```

with:

```js
            const { RawImage } = await import('@huggingface/transformers');

            // Read the image. A file sharp's strict defaults reject gets a lenient decode (clip-image.js, G3), so a
            // truncated or oversized training image still gets a CLIP vector and no longer blocks the model cache.
            const image = await readClipImage(imagePath, {
                RawImage,
                sharp: require('sharp'),
                warn: (message) => logger.warn('clip', message),
            });
```

Leave `extractClipEmbeddingBatch` and `extractClipEmbeddingFromBuffer` unchanged (D7). There is no unit test for this wiring, because `main.js` is not loadable under Vitest. The review checks it, and the user's after run checks it end to end.

- [ ] **Step 6: Write the failing `ml-training` tests**

In `tests/ml-training.test.js`:

1. In `formatTrainingPerfLine (G3)` → `rounds to whole milliseconds…`, add `noClip: 1,` after `failed: 2,` in the `likes` object. Change the expected string's segment to `likes: load=41ms (disk 1200) misses=5 failed=2 noClip=1 features=300ms clip=913ms save=80ms`.
2. In `perf line (G3)` → `writes one line for a rebuild, with every phase`, change both folder segments from `failed=0 features=` to `failed=0 noClip=0 features=`.
3. In `counts the time of a call that throws…`, change the two `toContain` strings:
   - `'likes: load=0ms (disk 0) misses=3 failed=1 noClip=0 features=300ms clip=0ms save=0ms'`;
   - `'dislikes: load=0ms (disk 0) misses=3 failed=0 noClip=0 features=300ms'`.
4. Add, after that test:

```js
        it('counts and names a training file left without a CLIP vector, which keeps the model out of the cache (G3 addendum)', async () => {
            // Before: the perf line had no count for it and nothing logged its name, so a model that never cached
            // looked unexplained (the first after run: failed=0, no modelCacheWrite, and no clue why).
            const { m } = scenario({
                extractClipEmbedding: vi.fn(async (p) => (p === '/dislikes/d2.jpg' ? null : new Float32Array(512).fill(0.25))),
                managerOverrides: { logPerf: vi.fn(), now: () => 0 },
            });
            await m.ensureTrainedModel({});
            const line = m.logPerf.mock.calls[0][0];
            expect(line).toContain('likes: load=0ms (disk 0) misses=3 failed=0 noClip=0 features=0ms');
            expect(line).toContain('dislikes: load=0ms (disk 0) misses=3 failed=0 noClip=1 features=0ms');
            expect(line).not.toContain('modelCacheWrite='); // a CLIP-less row still blocks the cache (D1)
            expect(m.logError).toHaveBeenCalledWith(
                'No CLIP vector for d2.jpg in /dislikes — the model will not be cached'
            );
        });

        it('does not count or log CLIP-less rows while CLIP is off', async () => {
            const { m } = scenario({
                enableClipFeatures: false,
                extractClipEmbedding: vi.fn(async () => null),
                managerOverrides: { logPerf: vi.fn(), now: () => 0 },
            });
            await m.ensureTrainedModel({});
            expect(m.logPerf.mock.calls[0][0]).toContain('misses=3 failed=0 noClip=0 features=0ms');
            expect(m.logError).not.toHaveBeenCalledWith(expect.stringMatching(/^No CLIP vector/));
        });
```

Run: `npx vitest run tests/ml-training.test.js`. Expected: FAIL, 4 tests:
- the three changed strings (`noClip=` absent);
- the first new test (`noClip=` absent, and no `No CLIP vector` call).

The CLIP-off test passes by construction, since it is a guard against over-counting. Label it in a comment, with its mutation: drop the `if (enableClipFeatures)` guard and it fails. Record the output.

- [ ] **Step 7: Implement in `ml-training.js`**

In `formatTrainingPerfLine`, replace:

```js
            `${label}: load=${ms(f.loadMs)} (disk ${f.diskCount}) misses=${f.misses} failed=${f.failed} ` +
```

with:

```js
            `${label}: load=${ms(f.loadMs)} (disk ${f.diskCount}) misses=${f.misses} failed=${f.failed} noClip=${f.noClip} ` +
```

In `_collectFolderVectors`, replace:

```js
        const stats = { loadMs: 0, diskCount: 0, misses: 0, failed: 0, featuresMs: 0, clipMs: 0, saveMs: 0 };
```

with:

```js
        const stats = { loadMs: 0, diskCount: 0, misses: 0, failed: 0, noClip: 0, featuresMs: 0, clipMs: 0, saveMs: 0 };
```

and replace:

```js
            if (!hasClip(hit.clip)) clipMissing++;
```

with:

```js
            if (!hasClip(hit.clip)) {
                clipMissing++;
                if (enableClipFeatures) {
                    // Names the file that keeps the model out of the cache (G3 addendum): before, only an
                    // unnamed toast and a console.warn did.
                    stats.noClip++;
                    this.logError(`No CLIP vector for ${file.name} in ${folderPath} — the model will not be cached`);
                }
            }
```

Re-read the JSDoc of `formatTrainingPerfLine` and the comment block above `_collectFolderVectors` (grep rule). Grep `ml-training.js`, `tests/` and `CLAUDE.md` for `failed=N features` and `misses=N failed=N`. Any prose spelling out the old format is updated; `CLAUDE.md` is Task 3's.

- [ ] **Step 8: Run the tests, the mutations, the suite**

- Run `npx vitest run tests/ml-training.test.js tests/clip-image.test.js`. Expected: PASS.
- Run the mutations, then restore each:
  1. In `clip-image.js`, replace the fallback with `throw strictError;` (first statement of the `catch`). The truncated, grey-alpha and options tests should fail.
  2. Drop `limitInputPixels: false`. The options test should fail.
  3. Drop the `if (enableClipFeatures)` guard, keeping its body. The CLIP-off test should fail.
- Run `npx vitest run`, `npm run lint`, and `npx prettier --check clip-image.js main.js ml-training.js tests/clip-image.test.js tests/ml-training.test.js eslint.config.mjs`.

- [ ] **Step 9: Commit (controller)**

```bash
git add clip-image.js tests/clip-image.test.js main.js eslint.config.mjs package.json package-lock.json ml-training.js tests/ml-training.test.js
git commit -m "fix(clip): lenient decode fallback for images sharp rejects; name CLIP-less training files (G3)"
```

Add the trailer and record the SHA. **This, with Tasks 1 and 2, is the second after-run build.**

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

**Outcome (2026-10-13):** the video fix worked (`failed=0`), but acceptance was not met: nothing was cached. A second blocker was found and approved as Task 2b (spec § 11). Lines and analysis are in § After run.

## Checkpoint B2: the user's second after run (after Task 2b)

These are the same five steps as Checkpoint B, on the Task 2b build. **Acceptance:** spec § 7, plus `noClip=0` in both folder segments of run 1.

- Run 1 is still `source=trained`. The 9 files get their CLIP vectors there (`misses=3`/`misses=6`, a non-zero `save=`), plus a `modelCacheWrite=` segment.
- Run 2 is `source=session`.
- Run 3 is `source=model-cache`.

The session log should show 9 `CLIP: … needed the lenient decoder` warnings in run 1, and none after that. Any `noClip=N > 0` is named by a `No CLIP vector for …` line and a `CLIP: cannot decode …` line, and is R1's case. Record the lines under **After run 2**.

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
Each `ensureTrainedModel` call writes one `ML training: …` line and each AI sort one `AI sort: …` line to `media-viewer-perf.log` (G3). A folder segment's `failed=N` and `noClip=N` count files that block the model cache (`rowsFailed > 0`, or a CLIP-less row while CLIP is on → not cacheable → every sort retrains); the session log names each one (`Skipping …`, `No CLIP vector for …`).
```

- [ ] **Step 2b: The architecture tree and Key Dependencies (Task 2b)**

In § Architecture, after the line `├── ipc-guard.js         # IPC registration wrapper …`, insert:

```
├── clip-image.js        # Main-process CLIP image decode (G3): strict RawImage.read first, then a bounded lenient sharp decode (failOn none, ≤2^29 input px, 30 s timeout, ≤1024 px out, 3-ch sRGB) for files the strict read rejects
```

In **Key Dependencies**, after `` `@huggingface/transformers` (CLIP via ONNX, main-process IPC); ``, insert `` `sharp` (direct since G3: `clip-image.js`'s lenient fallback; also transformers' own image decoder); ``.

- [ ] **Step 3: Two active gotchas**

In § Git Insights → **Active gotchas**, directly before the line that starts `- JXL rendering:`, insert:

```
- **Release a `<video>` with `_releaseVideo(video)` (`removeAttribute('src')` + `load()`), never `video.src = ''`.** An empty `src` attribute is itself a load failure that fires `error`. An `error` handler that empties `src` again loops forever (~37,000 events a second per element, measured). Emptying it before an `await` lets that `error` settle the promise first. Until G3 (2026-10-13) this made `computeFeatures` reject every video while face detection was on. Every training-folder video failed, and since a failed file blocks the model cache, every AI sort retrained. `computePerceptualHash` leaked the same loop. `loadMediaAsImageData` still empties `src` once it is done: one stray `error`, no loop (BACKLOG).
- **CLIP's decoder is stricter than Chromium.** Main's `RawImage.read` (sharp defaults: `failOn: 'warning'`, a 268-megapixel limit) rejects truncated JPEGs, odd SOS markers, some PNGs and huge images that the app displays fine. While CLIP is on, a training file without a CLIP vector keeps the model out of the cache, so before G3's `clip-image.js` fallback (2026-10-14) 9 such images made every AI sort retrain, silently: the renderer only `console.warn`s a CLIP failure. The fallback runs only after the strict read throws, so embeddings the strict path produces are unchanged. A new decode path for CLIP must keep that order.
```

- [ ] **Step 4: Check and commit (controller)**

Run `node scripts/check-docs-index.js`. Expected: no output, exit 0.

```bash
git add CLAUDE.md
git commit -m "docs: G3 video-release and CLIP-decoder gotchas, clip-image.js, fixtures and perf lines in CLAUDE.md"
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
- 🟤 **R9 — Bulk-rated rows without CLIP are not named.** `_collectBulkRatedVectors` (~L666) counts them into `clipMissing`, so they block the model cache, but neither the perf line nor the ML log names them. Main's `CLIP: cannot decode …` warn names image files only. Surfaced by Task 2b's review.
- 🟤 **R8 — Three other video teardown sites** (`media-viewer.js` ~L2143, ~L3350-3351, ~L6667) already release with `removeAttribute('src')` + `load()` by hand. Route them through `_releaseVideo` so the rule has one owner. Surfaced by Task 1's review.

## Residuals for Extract

- **R3:** annotate BACKLOG item (1)'s 🟤 entry ("every rebuild re-streams both training folders' `.feature_cache.json` in full") with `load=` 31.2 s + 27.7 s = 58.9 s of a 90.7 s rebuild, measured 2026-10-13. After this fix it is the dominant cost of every rebuild.
- From the superseded plan's Task 1 review, the deferred minors for the final review to triage:
  - `misses` also counts CLIP-only re-extractions;
  - a throwing `ensureTrainedModel` leaves no `training` phase in the `AI sort:` line.

  Its third minor (a failed call's time is dropped) is fixed by Task 2.

- **Found at Finish (not G3's):** locally, `npm run format:check` fails on 6 git-ignored `CLAUDE-SECURITY-*/` scan artifacts (`.sarif`/`.json`). Prettier does not skip them, because they are ignored by git but not by `.prettierignore`. Route to BACKLOG 🟡/🟤: add `CLAUDE-SECURITY-*/` to `.prettierignore`. The branch's own files are clean.

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
- **2026-10-14 — Checkpoint B result and the second blocker.**
  - The after run (§ After run) shows `failed=0`, but nothing was cached.
  - The probes found the second blocker: the `clipMissing` rule, with 9 still images that main's strict sharp decode rejects. A lenient decode reads all 9. The probes are in the session scratchpad (throwaway); the control file decodes, and so does the 280-megapixel file once shrink-on-load is on.
  - The user chose "Lenient fallback" (AskUserQuestion) over re-saving the 9 files or relaxing the cache rule.
  - The spec gained § 11 (D6–D8, D4 amended). The plan gained Task 2b and Checkpoint B2, and Task 3 gained the `clip-image.js`, `sharp` and CLIP-decoder notes.
- **2026-10-14 — Task 2b committed `2cd6186`.**
  - Step 2 gate: the strict read rejects both generated fixtures.
  - Tests: clip-image 5/5; ml-training 118/118; full suite 1389 passed, 1 skipped.
  - **Task review (Opus): Needs fixes, 2 Important.**
    - (1) The fallback's `limitInputPixels: false` made a main-process decode unbounded for crafted files. A background commit security review flagged the same class. Measured: a 74-byte PNG declaring 10 GP took 3.6 s and 557 MB. Bounded to `2 ** 29` plus a 30 s timeout (D6 amended).
    - (2) The `No CLIP vector` line would flood the log while CLIP is enabled but unavailable. Capped at 20 per folder plus a summary line (D8 amended).
  - The minors became behavioural pixel-limit tests, a grey-alpha precondition, and R9.
  - Fix round 1 `a19aef5`.
    - The cap test was RED before the fix.
    - The 14031×19933 header-only PNG decodes in ~170 ms and ~60 MB; the 24000×24000 one is rejected in 5 ms.
    - Mutation: with the bound set back to `false`, the over-limit test fails after 15.7 s of real decoding.
  - Re-review (Sonnet): all 5 findings addressed, no new breakage. Task 2b ✅.

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

Build `341026c`, 2026-10-13, the user's Checkpoint B (run 1, then run 2 in the same session, then run 3 after a restart):

```
[2026-10-13 23:47:23.378] [PERF] ML training: source=trained total=179095ms | scan=7618ms | likes: load=36634ms (disk 15859) misses=8 failed=0 features=6156ms clip=4393ms save=4018ms | dislikes: load=28754ms (disk 12979) misses=72 failed=0 features=14773ms clip=68947ms save=3562ms | bulk=42ms | train=3055ms
[2026-10-13 23:47:25.892] [PERF] AI sort: outcome=done total=211333ms | mlInit=146ms | clipLoad=3226ms | sourceCacheLoad=26347ms | training=179098ms (trained) | extract=850ms | sort=1100ms | files=16208
[2026-10-13 23:53:13.627] [PERF] ML training: source=trained total=82948ms | scan=6360ms | likes: load=38631ms (disk 15864) misses=3 failed=0 features=0ms clip=107ms save=0ms | dislikes: load=32196ms (disk 13045) misses=6 failed=0 features=0ms clip=134ms save=0ms | bulk=63ms | train=4377ms
[2026-10-13 23:53:15.931] [PERF] AI sort: outcome=done total=85943ms | clipLoad=686ms | training=82949ms (trained) | sort=1023ms | files=16208
[2026-10-13 23:56:20.164] [PERF] ML training: source=trained total=72069ms | scan=4760ms | likes: load=35416ms (disk 15864) misses=3 failed=0 features=0ms clip=90ms save=0ms | dislikes: load=27867ms (disk 13045) misses=6 failed=0 features=0ms clip=87ms save=0ms | bulk=2ms | train=2809ms
[2026-10-13 23:56:22.929] [PERF] AI sort: outcome=done total=101022ms | mlInit=34ms | clipLoad=855ms | sourceCacheLoad=25296ms | training=72070ms (trained) | extract=912ms | sort=1213ms | files=16208
```

**The video fix worked:**
- `failed=0` in both folders. In run 1, all 71 videos were extracted: dislikes `features=14.8 s`, `clip=68.9 s`. That is one-off, now cached: `disk 12979 → 13045`.

**Acceptance was NOT met:**
- No run has a `modelCacheWrite=` segment.
- Run 2 is `source=trained`, not `session`.
- Run 3 is `source=trained`, not `model-cache`.

**Second blocker (found 2026-10-14):**
- `cacheable` (`ml-training.js:941-942`) also requires `!(enableClipFeatures && clipMissing > 0)`.
- Every run's `misses=3`/`misses=6` with `features=0ms` are CLIP-only re-extractions: 3 like and 6 dislike files whose cache entry has `clipVector: null`, listed by a read-only probe of both `.feature_cache.json` files.
- All 9 are still images. Main's `RawImage.read` (sharp/libvips, strict) throws for each, while Chromium decodes them:
  - 4 × `Corrupt JPEG data: premature end of data segment`;
  - 2 × `Invalid SOS parameters for sequential JPEG`;
  - 1 × `Input image exceeds pixel limit` (14031×19933);
  - 1 × `libspng read error`;
  - 1 × `unsupported number of channels: 4`.

  A CLIP-ful file from the same folder decodes fine (the control).
- A lenient sharp decode (`failOn: 'none'`, `limitInputPixels: false`, shrink-on-load to fit inside 1024, forced 3-channel sRGB) decodes all 9.
- The failure was invisible: the renderer only `console.warn`s a CLIP failure, and `misses` counts CLIP-only retries (Task 1's deferred minor).
- This blocker predates G3. The before run's `dislikes: misses=72` = the 66 failing videos + these 6.

### After run 2

Build `32f92a2` (code `a19aef5`), 2026-10-14, the user's Checkpoint B2 (same three sorts):

```
[2026-10-14 01:34:15.953] [PERF] ML training: source=trained total=88793ms | scan=5549ms | likes: load=37274ms (disk 15864) misses=3 failed=0 noClip=0 features=0ms clip=3865ms save=4675ms | dislikes: load=29734ms (disk 13045) misses=6 failed=0 noClip=0 features=0ms clip=591ms save=3036ms | bulk=8ms | train=2459ms | modelCacheWrite=23ms
[2026-10-14 01:34:22.649] [PERF] AI sort: outcome=done total=127798ms | mlInit=81ms | clipLoad=2715ms | sourceCacheLoad=29493ms | training=88805ms (trained) | extract=5273ms | sort=957ms | files=16208
[2026-10-14 01:34:38.890] [PERF] ML training: source=session total=4912ms | scan=4801ms
[2026-10-14 01:34:39.887] [PERF] AI sort: outcome=done total=5913ms | clipLoad=2ms | training=4912ms (session) | sort=593ms | files=16208
[2026-10-14 01:35:40.366] [PERF] ML training: source=model-cache total=5247ms | scan=4574ms
[2026-10-14 01:35:42.614] [PERF] AI sort: outcome=done total=33289ms | mlInit=80ms | clipLoad=1153ms | sourceCacheLoad=24559ms | training=5248ms (model-cache) | extract=622ms | sort=1115ms | files=16208
```

**Acceptance (spec § 7 + § 11.4): met.**
- Run 1 has `failed=0 noClip=0` in both folders, `misses=3`/`misses=6` with `save=` > 0 (the 9 CLIP vectors were filled in), and `modelCacheWrite=23ms`.
- Run 2 is `source=session`: the AI sort took **5.9 s**.
- Run 3 is `source=model-cache`: the AI sort took **33.3 s**, of which `sourceCacheLoad` is 24.6 s (R4).

| | Before (`713af35`, 16:51) | After |
| --- | --- | --- |
| Sort after a change to the training set | 119.8 s (retrained) | 127.8 s, one-off: it healed 9 CLIP vectors and cached the model |
| Sort again, same session | retrained, ~86–120 s | **5.9 s** |
| Sort after a restart | retrained, ~101 s | **33.3 s** |

**Session log (run 1).**
- 9 `CLIP: … needed the lenient decoder` warnings, one per known file, each with the strict error § 11.1 recorded.
- 5 more warnings after training ended, during `extract`. These are source-folder (`Liked_2`) images that got a CLIP vector for the first time (D7's side benefit). Two of them carry a strict error not seen in the training set: `Warning treated as error due to failOn setting`.

**What remains.** In a rebuild, `load=` (37.3 + 29.7 = 67 s of 88.8 s) is still the dominant cost (R3). A new session's first sort spends 24.6 s in `sourceCacheLoad` (R4).

## Key Discoveries

- **Measure first paid for itself.** The BACKLOG entry's mechanism ("each moved file is extracted from scratch") was true, but it cost about 1% of the sort. The measured cause of the retrain was unrelated to the moves: every sort retrained because every training-folder video failed (memory: a BACKLOG entry's stated mechanism is a hypothesis).
- **An empty `src` attribute is a load failure.** `video.src = ''` fires `error`, and in an `error` handler that does it again, the loop never ends.
- **The first root cause was not the only one.** The § 2.2 analysis traced `rowsFailed` and stopped. `cacheable` has a second conjunct (`clipMissing`), which 9 images held false the whole time. Only the after run exposed it. The lesson: when a gate has several conjuncts, account for every one before claiming a fix will open it, because a measured run is the only proof.
