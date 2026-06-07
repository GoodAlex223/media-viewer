# JXL + Animated-JXL Viewer Support Implementation Plan

**Status: Complete** — shipped on `feature/jxl-viewer-support` (commits `cb38175`…`84bf62b`, 2026-06-04 → 2026-06-07). All 10 tasks done via subagent-driven development with per-task + final whole-branch review. 289/289 unit tests; new E2E smoke (`jxl-rendering.test.js`) passes; static + animated JXL manually confirmed. One final-review finding (`ensureJxlWorker` hang on init failure) fixed in `84bf62b`. Deviations from plan: Task 8 used decoded-PNG-object-URL-into-`new Image()` instead of a `getExtractionImageData` helper (simpler, avoids `fetch(file://)`); animation uses per-frame just-in-time `createImageBitmap` (not pre-decode-all, which would cost ~1GB for a 270-frame loop); a `read-jxl-wasm` IPC was added for explicit-bytes worker init (spike §9). Progressive/streaming animated-decode latency deferred to BACKLOG.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the viewer open `.jxl` files (including animated JXL converted from GIFs) produced by the sibling `media_compression` project, with full feature-extraction parity.

**Architecture:** Detect `.jxl` as an image-class format; decode it in a dedicated renderer **module** Web Worker wrapping `jxl-oxide-wasm` (per-frame access + durations); render frame 0 as a `Blob`/object-URL `<img>` (static) or a Canvas auto-loop (animated, GIF-style); feed decoded pixels through the existing hand-crafted feature path and a new CLIP-from-buffer IPC.

**Tech Stack:** Electron, vanilla JS renderer (no bundler), Web Workers, `jxl-oxide-wasm` (pure-Rust WASM decoder, MIT/Apache-2.0), Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-04-jxl-viewer-support-design.md`

**Day split:** Part 1 (Tue) = Tasks 1–4 (spike + detection wiring). Part 2 (Wed) = Tasks 5–10 (decode/render/animation/extraction/tests).

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `media-formats.js` | Shared CJS helper: `isMediaFile(ext)`, `getMimeType(ext)`. Required by `main.js` + tests. | Create |
| `main.js` | Require `media-formats.js`; add `read-file-buffer` IPC; add `extractClipEmbeddingFromBuffer` IPC. | Modify |
| `preload.js` | Expose `readFileBuffer`, `extractClipEmbeddingFromBuffer`. | Modify |
| `jxl-decode-worker.js` | Module worker wrapping `jxl-oxide-wasm`; decode → frames `{pngBytes, duration}`. | Create |
| `media-viewer.js` | `isJxl()`, `decodeJxl()` + frame cache, JXL render branch, animation driver, extraction wiring, cache cleanup. | Modify |
| `vendor/jxl-oxide-wasm/` | Copied `.wasm` + JS glue the module worker loads under `file://`. | Create (copy) |
| `tests/media-formats.test.js` | Unit: `isMediaFile`/`getMimeType` incl. `.jxl`. | Create |
| `tests/media-viewer-utils.test.js` | Unit: `isJxl()` truth table, animation-driver logic, `decodeJxl` message handling. | Modify |
| `tests/e2e/jxl-rendering.test.js` | E2E smoke: static fixture `.jxl` renders. | Create |
| `tests/e2e/fixtures/` | Tiny static `.jxl` fixture. | Create |

---

## Task 1: Spike — verify `jxl-oxide-wasm` in an Electron module worker (Part 1)

**This is an investigation task with a written go/no-go outcome — not TDD.** Everything downstream depends on it. Do not skip.

**Files:**
- Create (throwaway): `vendor/jxl-oxide-wasm/` (copied package assets), a scratch `scratch-jxl-spike.html` + worker.

- [x] **Step 1: Install the decoder**

Run: `npm install jxl-oxide-wasm`
Expected: added to `package.json` dependencies, no peer-dep errors.

- [x] **Step 2: Locate and copy the wasm + glue**

Run: `node -e "const p=require.resolve('jxl-oxide-wasm');console.log(p)"` and inspect the package dir (`node_modules/jxl-oxide-wasm/`). Copy the `.js` glue + `.wasm` into `vendor/jxl-oxide-wasm/` (no bundler in this project — assets must sit at a `file://`-loadable path next to the app).

Expected: `vendor/jxl-oxide-wasm/` contains the ESM glue (`*.js`) and `*_bg.wasm`.

- [x] **Step 3: Minimal spike worker + page**

Create `scratch-jxl-spike.html` that spawns a module worker:

```js
// scratch-jxl-spike-worker.js  (module worker)
import init, { JxlImage } from './vendor/jxl-oxide-wasm/jxl_oxide_wasm.js';
self.onmessage = async (e) => {
    await init('./vendor/jxl-oxide-wasm/jxl_oxide_wasm_bg.wasm');
    const img = new JxlImage();
    img.feedBytes(new Uint8Array(e.data.buffer));
    img.tryInit();
    const frames = [];
    const n = img.animated ? img.numLoadedKeyframes : 1;
    for (let i = 0; i < n; i++) {
        const r = img.render(img.animated ? i : undefined);
        frames.push({ pngBytes: r.encodeToPng(), duration: r.duration });
    }
    self.postMessage({ width: img.width, height: img.height, animated: img.animated, numLoops: img.numLoops, frameCount: frames.length });
};
```

```js
// in scratch-jxl-spike.html
const w = new Worker('scratch-jxl-spike-worker.js', { type: 'module' });
```

- [x] **Step 4: Run the spike against a real static and animated JXL**

Load the scratch page in the running app's renderer (or a temporary `BrowserWindow`). Feed it (a) a `*.png.jxl` and (b) an animated `*.gif.jxl` produced by `media_compression`.

Record in the plan's outcome notes (Step 6):
1. Does `new Worker(url, { type: 'module' })` + `import` + `init(wasmUrl)` work under Electron `file://`? (Risk #1)
2. Does the animated file return `frameCount > 1` with non-zero `duration` per frame? (Q2 requirement)
3. Does `RenderResult` expose a **raw-RGBA** accessor (e.g. `encodeToRgba8`/buffer) in addition to `encodeToPng()`? (Risk #2 — inspect the package `.d.ts`)
4. Measured `.wasm` byte size. (Risk #3)

- [x] **Step 5: Decision gate**

- If module worker + `init()` works → proceed with the plan as written.
- If module workers misbehave under `file://` → fall back: classic worker + `importScripts` of a UMD glue, or manual `WebAssembly.instantiate` of the `_bg.wasm`. Update Task 5's worker code accordingly before continuing.
- If no raw-RGBA accessor exists → keep the PNG-blob path everywhere (already the plan default); note it.

- [x] **Step 6: Write the outcome + clean up scratch files**

Append a short "Spike outcome" note to the spec file (`## 9. Spike outcome (2026-06-04)`) recording answers to Step 4. Delete `scratch-jxl-spike*.{html,js}`. Keep `vendor/jxl-oxide-wasm/`.

Run: `git add vendor/jxl-oxide-wasm package.json package-lock.json docs/superpowers/specs/2026-06-04-jxl-viewer-support-design.md && git commit -m "chore(jxl): add jxl-oxide-wasm + spike outcome notes"`

---

## Task 2: Extract `media-formats.js` shared module + add `.jxl` (Part 1, TDD)

`isMediaFile`/`getMimeType` live inline in `main.js` (lines 122–139) and aren't testable (requiring `main.js` boots Electron). Extract them to a shared CJS module — mirrors the `feature-extractor.js` / `ml-model.js` shared-lib pattern (ESLint block 3b).

**Files:**
- Create: `media-formats.js`
- Create: `tests/media-formats.test.js`
- Modify: `main.js:122-139` (replace inline helpers with a `require`)
- Modify: `eslint.config.mjs` (add `media-formats.js` to the shared-libs block 3b file list)

- [x] **Step 1: Write the failing test**

Create `tests/media-formats.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isMediaFile, getMimeType } = require('../media-formats');

describe('isMediaFile', () => {
    it('accepts existing media extensions', () => {
        for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov']) {
            expect(isMediaFile(ext)).toBe(true);
        }
    });
    it('accepts .jxl', () => {
        expect(isMediaFile('.jxl')).toBe(true);
    });
    it('rejects non-media extensions', () => {
        expect(isMediaFile('.txt')).toBe(false);
        expect(isMediaFile('.json')).toBe(false);
    });
});

describe('getMimeType', () => {
    it('maps .jxl to image/jxl', () => {
        expect(getMimeType('.jxl')).toBe('image/jxl');
    });
    it('maps known types and falls back to octet-stream', () => {
        expect(getMimeType('.png')).toBe('image/png');
        expect(getMimeType('.mp4')).toBe('video/mp4');
        expect(getMimeType('.xyz')).toBe('application/octet-stream');
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-formats.test.js`
Expected: FAIL — `Cannot find module '../media-formats'`.

- [x] **Step 3: Create the module**

Create `media-formats.js`:

```js
// Shared media-format helpers. CJS module required by main.js and unit tests.
// Mirrors the feature-extractor.js / ml-model.js shared-lib pattern.

function isMediaFile(extension) {
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.jxl'];
    return mediaExtensions.includes(extension);
}

function getMimeType(extension) {
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.jxl': 'image/jxl',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

module.exports = { isMediaFile, getMimeType };
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-formats.test.js`
Expected: PASS (8 assertions).

- [x] **Step 5: Replace the inline helpers in `main.js`**

At the top of `main.js` (with the other `require`s) add:

```js
const { isMediaFile, getMimeType } = require('./media-formats');
```

Delete the inline `function isMediaFile(...) {...}` and `function getMimeType(...) {...}` (lines ~122–139). Leave all call sites unchanged (same names).

- [x] **Step 6: Add to ESLint shared-libs block**

In `eslint.config.mjs`, find the block-3b file list (the one naming `feature-extractor.js`, `ml-model.js`) and add `'media-formats.js'` to its `files` array. Update the `// 3b. Shared libs ...` comment to include `media-formats.js`.

- [x] **Step 7: Verify lint + full unit suite**

Run: `npm run lint && npx vitest run`
Expected: lint clean; all prior tests + 8 new pass (275 → 283).

- [x] **Step 8: Commit**

```bash
git add media-formats.js tests/media-formats.test.js main.js eslint.config.mjs
git commit -m "feat(jxl): extract media-formats shared module + register .jxl as image/jxl"
```

---

## Task 3: Renderer `isJxl()` helper (Part 1, TDD)

**Files:**
- Modify: `media-viewer.js` (add `isJxl` method on `MediaViewer`, near `pathToFileURL` ~L852)
- Modify: `tests/media-viewer-utils.test.js` (new describe block)

- [x] **Step 1: Write the failing test**

Add to `tests/media-viewer-utils.test.js` (uses the existing `extractMethod` helper):

```js
describe('isJxl', () => {
    const isJxl = extractMethod('isJxl');
    it('matches .jxl including double extensions', () => {
        expect(isJxl.call({}, 'a.jxl')).toBe(true);
        expect(isJxl.call({}, 'photo.jpg.jxl')).toBe(true);
        expect(isJxl.call({}, 'loop.gif.jxl')).toBe(true);
        expect(isJxl.call({}, 'C:\\x\\b.png.JXL')).toBe(true); // case-insensitive
    });
    it('does not match non-jxl paths', () => {
        expect(isJxl.call({}, 'a.jpg')).toBe(false);
        expect(isJxl.call({}, 'a.jxl.png')).toBe(false);
        expect(isJxl.call({}, 'jxl')).toBe(false);
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t isJxl`
Expected: FAIL — `isJxl` not found in source.

- [x] **Step 3: Implement the method**

In `media-viewer.js`, add near `pathToFileURL`:

```js
    isJxl(filePath) {
        return /\.jxl$/i.test(filePath);
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t isJxl`
Expected: PASS (7 assertions).

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(jxl): add isJxl path helper"
```

---

## Task 4: `read-file-buffer` IPC (Part 1)

Binary read for JXL bytes. `read-file` (main.js:392) reads `utf8` text — unusable for binary. **`preload.js` change → security review** per project policy; mirror the existing handler's try/catch-returns-null posture and pass the path straight to `fs.readFile` exactly as `read-file` does.

**Files:**
- Modify: `main.js` (add handler after `read-file`, ~L400)
- Modify: `preload.js` (expose `readFileBuffer`)

- [x] **Step 1: Add the main-process handler**

In `main.js`, immediately after the `read-file` handler (ends ~L400):

```js
    ipcMain.handle('read-file-buffer', async (_event, filePath) => {
        try {
            const data = await fs.readFile(filePath); // Buffer (no encoding)
            // Return the underlying bytes; structured clone ships it as a Uint8Array/ArrayBuffer.
            return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        } catch (_error) {
            return null;
        }
    });
```

- [x] **Step 2: Add the vendored-wasm reader (for the decode worker's explicit-bytes init, spec §9)**

In `main.js`, after the `read-file-buffer` handler (`__dirname` is the app root where `vendor/` lives):

```js
    const path = require('path'); // if not already required at top of main.js
    ipcMain.handle('read-jxl-wasm', async () => {
        try {
            const wasmPath = path.join(__dirname, 'vendor', 'jxl-oxide-wasm', 'jxl_oxide_wasm_bg.wasm');
            const data = await fs.readFile(wasmPath);
            return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        } catch (_error) {
            return null;
        }
    });
```

(If `path` is already required at the top of `main.js`, do not re-require it — reuse the existing binding.)

- [x] **Step 3: Expose both in preload**

In `preload.js`, next to `readFile` (line 12):

```js
    readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
    readJxlWasm: () => ipcRenderer.invoke('read-jxl-wasm'),
```

- [x] **Step 4: Manual smoke (no unit test — IPC needs the Electron runtime)**

Run: `npm start`, then in DevTools console:
`await window.electronAPI.readFileBuffer('<path to any file>')` → an `ArrayBuffer` of the right `byteLength`; a bad path returns `null`.
`await window.electronAPI.readJxlWasm()` → an `ArrayBuffer` of ~1.62 MB (the vendored wasm).

- [x] **Step 5: Lint + commit**

```bash
git add main.js preload.js
git commit -m "feat(jxl): add read-file-buffer + read-jxl-wasm IPC (security-reviewed)"
```

**End of Part 1.** At this point JXL files **list** in folders and arrive as `image/jxl`, but still render blank — Part 2 makes them display.

---

## Task 5: Decode worker + `decodeJxl()` helper + frame cache (Part 2)

**Files:**
- Create: `jxl-decode-worker.js`
- Modify: `media-viewer.js` (`decodeJxl()`, `this.jxlFrameCache = new Map()` in constructor, worker lifecycle)
- Modify: `tests/media-viewer-utils.test.js` (test `decodeJxl` message handling with a mocked worker)

> **Spike-confirmed constraints (Task 1, see spec §9) — the worker MUST honor these:**
> 1. `jxl-oxide-wasm` is **ESM-only** → this is a **module worker** (`{ type: 'module' }`).
> 2. **No raw-RGBA accessor** → PNG via `encodeToPng()` is the only pixel path.
> 3. **`encodeToPng()` is terminal**: read `r.duration` (and any metadata) BEFORE calling
>    `encodeToPng()`; call `encodeToPng()` exactly once, last; do NOT `r.free()` after.
> 4. **wasm init**: pass the vendored `.wasm` **bytes explicitly** via
>    `init({ module_or_path: wasmBytes })` to avoid `fetch(file://)` fragility under Electron.
>    The main thread reads the bytes once (via `readFileBuffer` on the vendored path) and sends
>    them to the worker in an `{ type: 'init', wasmBytes }` message before the first decode.
> If the module worker proves troublesome under Electron `file://`, fall back to main-process
> decode via IPC (spec §9 contingency) — same `init({ module_or_path: bytes })` call.

- [x] **Step 1: Create the worker**

Create `jxl-decode-worker.js`:

```js
// Module Web Worker: decodes JXL bytes to per-frame PNG blobs + durations.
// Protocol in:  { type: 'init', wasmBytes }   (sent once before first decode)
//               { type: 'decode', id, buffer }
// Protocol out: { type: 'ready' }
//               { type: 'decoded', id, frames: [{pngBytes, duration}], width, height, animated, numLoops }
//               { type: 'error', id, message }
import init, { JxlImage } from './vendor/jxl-oxide-wasm/jxl_oxide_wasm.js';

let ready = null;

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
        // Explicit-bytes init (spike-confirmed robust path under Electron file://).
        ready = init({ module_or_path: new Uint8Array(msg.wasmBytes) });
        await ready;
        self.postMessage({ type: 'ready' });
        return;
    }
    if (msg.type !== 'decode') return;
    const { id, buffer } = msg;
    try {
        if (!ready) throw new Error('decoder not initialized');
        await ready;
        const img = new JxlImage();
        img.feedBytes(new Uint8Array(buffer));
        if (!img.tryInit()) throw new Error('JXL header incomplete');
        const animated = img.animated;
        const count = animated ? img.numLoadedKeyframes : 1;
        const frames = [];
        const transfer = [];
        for (let i = 0; i < count; i++) {
            const r = img.render(animated ? i : undefined);
            const duration = animated ? r.duration : 0; // READ metadata BEFORE encodeToPng()
            const pngBytes = r.encodeToPng(); // terminal — must be last; do not free() after
            frames.push({ pngBytes, duration });
            transfer.push(pngBytes.buffer);
        }
        const width = img.width;
        const height = img.height;
        const numLoops = img.numLoops;
        img.free();
        self.postMessage({ type: 'decoded', id, frames, width, height, animated, numLoops }, transfer);
    } catch (err) {
        self.postMessage({ type: 'error', id, message: String(err && err.message ? err.message : err) });
    }
};
```

- [x] **Step 2: Write the failing test for `decodeJxl` orchestration**

`decodeJxl` is testable by mocking the worker + `readFileBuffer`. Add to `tests/media-viewer-utils.test.js` (uses `extractAsyncMethod`):

```js
describe('decodeJxl', () => {
    const decodeJxl = extractAsyncMethod('decodeJxl');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { readFileBuffer: vi.fn(async () => new ArrayBuffer(8)) } };
    });
    afterEach(() => { globalThis.window = origWindow; });

    function makeCtx() {
        const handlers = {};
        const worker = {
            postMessage: vi.fn((m) => {
                // echo a decoded reply on next tick keyed by the same id
                queueMicrotask(() => handlers.message({ data: { type: 'decoded', id: m.id, frames: [{ pngBytes: new Uint8Array([1]), duration: 0 }], width: 4, height: 4, animated: false, numLoops: 0 } }));
            }),
            addEventListener: (ev, fn) => { handlers[ev] = fn; },
        };
        return { jxlWorker: worker, jxlFrameCache: new Map(), _jxlReqId: 0, isJxl: (p) => /\.jxl$/i.test(p) };
    }

    it('reads bytes, posts to worker, resolves decoded frames', async () => {
        const ctx = makeCtx();
        const result = await decodeJxl.call(ctx, 'a.png.jxl');
        expect(window.electronAPI.readFileBuffer).toHaveBeenCalledWith('a.png.jxl');
        expect(result.animated).toBe(false);
        expect(result.frames).toHaveLength(1);
    });

    it('caches by path (second call does not re-read)', async () => {
        const ctx = makeCtx();
        await decodeJxl.call(ctx, 'a.png.jxl');
        await decodeJxl.call(ctx, 'a.png.jxl');
        expect(window.electronAPI.readFileBuffer).toHaveBeenCalledTimes(1);
    });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t decodeJxl`
Expected: FAIL — `decodeJxl` not found.

- [x] **Step 4: Implement worker lifecycle + `decodeJxl`**

In the `MediaViewer` constructor, beside the other worker/cache fields:

```js
        this.jxlWorker = null;
        this.jxlFrameCache = new Map(); // filePath -> { frames, width, height, animated, numLoops }
        this._jxlReqId = 0;
        this._jxlPending = new Map(); // id -> { resolve, reject }
```

Add methods on `MediaViewer`:

```js
    ensureJxlWorker() {
        if (this.jxlWorker) return this._jxlReady;
        this.jxlWorker = new Worker('jxl-decode-worker.js', { type: 'module' });
        this.jxlWorker.addEventListener('message', (e) => {
            const m = e.data;
            if (m.type === 'ready') { this._jxlResolveReady(); return; }
            const pending = this._jxlPending.get(m.id);
            if (!pending) return;
            this._jxlPending.delete(m.id);
            if (m.type === 'error') pending.reject(new Error(m.message));
            else pending.resolve(m);
        });
        // Explicit-bytes wasm init (spec §9): main process reads the vendored .wasm.
        this._jxlReady = new Promise((res) => { this._jxlResolveReady = res; });
        window.electronAPI.readJxlWasm().then((wasmBytes) => {
            this.jxlWorker.postMessage({ type: 'init', wasmBytes }, [wasmBytes]);
        });
        return this._jxlReady;
    }

    async decodeJxl(filePath) {
        this._jxlPending = this._jxlPending || new Map();
        if (this.jxlFrameCache.has(filePath)) return this.jxlFrameCache.get(filePath);
        await this.ensureJxlWorker(); // resolves once worker posts {type:'ready'}
        const buffer = await window.electronAPI.readFileBuffer(filePath);
        if (!buffer) throw new Error('Could not read JXL file: ' + filePath);
        const worker = this.ensureJxlWorker();
        const id = ++this._jxlReqId;
        const decoded = await new Promise((resolve, reject) => {
            this._jxlPending.set(id, { resolve, reject });
            worker.postMessage({ type: 'decode', id, buffer }, [buffer]);
        });
        const entry = { frames: decoded.frames, width: decoded.width, height: decoded.height, animated: decoded.animated, numLoops: decoded.numLoops };
        this.jxlFrameCache.set(filePath, entry);
        return entry;
    }
```

> Test note: the test's mock worker uses `addEventListener('message', …)` and echoes a reply synchronously-ish via `queueMicrotask`, matching `ensureJxlWorker`'s listener. The test injects `jxlWorker` directly so `ensureJxlWorker` is bypassed; `_jxlPending` is created lazily — add `this._jxlPending = this._jxlPending || new Map();` at the top of `decodeJxl` so the mocked-ctx test (which doesn't set it) works.

Apply that one-line guard at the top of `decodeJxl`.

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t decodeJxl`
Expected: PASS (3 assertions).

- [x] **Step 6: Commit**

```bash
git add jxl-decode-worker.js media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(jxl): decode worker + decodeJxl helper with per-path frame cache"
```

---

## Task 6: Static render branch (Part 2)

Render frame 0 of a JXL as an `<img>` via an object URL, in both single and compare mode.

**Files:**
- Modify: `media-viewer.js` — `showSingleMedia` (~2646), `showCompareMedia` left/right (~2867, 2885); add `jxlFrameToObjectURL` helper + object-URL cleanup.

- [x] **Step 1: Add a frame→object-URL helper**

```js
    jxlFrameToObjectURL(frame) {
        const blob = new Blob([frame.pngBytes], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        this._jxlObjectURLs = this._jxlObjectURLs || new Set();
        this._jxlObjectURLs.add(url);
        return url;
    }

    revokeJxlObjectURLs() {
        if (!this._jxlObjectURLs) return;
        for (const url of this._jxlObjectURLs) URL.revokeObjectURL(url);
        this._jxlObjectURLs.clear();
    }
```

Call `this.revokeJxlObjectURLs()` inside `cleanupCurrentMedia()` (and the compare cleanup) so URLs don't leak.

- [x] **Step 2: Branch `showSingleMedia` for JXL**

Replace the image branch at ~2646 so JXL decodes first:

```js
        if (file.type.startsWith('image/')) {
            this.currentMedia = document.createElement('img');
            if (this.isJxl(file.path)) {
                try {
                    const decoded = await this.decodeJxl(file.path);
                    if (decoded.animated && decoded.frames.length > 1) {
                        this.startJxlAnimation(this.currentMedia, decoded); // Task 7
                    } else {
                        this.currentMedia.src = this.jxlFrameToObjectURL(decoded.frames[0]);
                    }
                } catch (err) {
                    window.electronAPI.logError('JXL decode failed: ' + err.message);
                    this.showNotification('Could not decode JXL file', 'error');
                    this.isLoading = false;
                    return; // graceful skip — leave current view, like a missing file
                }
            } else {
                this.currentMedia.src = fileUrl;
            }
            this.videoControls.style.display = 'none';
            this.setupImageHandlers(file);
        } else if (file.type.startsWith('video/')) {
```

> `startJxlAnimation` draws onto a `<canvas>`; for animated JXL replace the `img` element with a canvas — see Task 7 Step 3 which adjusts this branch to create a canvas instead of an img when `decoded.animated`.

- [x] **Step 3: Branch `showCompareMedia` left + right identically**

At the left image branch (~2867) and right (~2885), apply the same `isJxl` → `decodeJxl` → object-URL (static) logic. Animated-in-compare may show frame 0 only for v1 simplicity — gate `startJxlAnimation` on single mode; in compare, always use frame 0 via `jxlFrameToObjectURL(decoded.frames[0])`. (Note this scope choice in the DONE.md entry.)

- [x] **Step 4: Manual smoke**

Run: `npm start`, open a folder containing a static `*.png.jxl`. Expected: it renders in single mode and in compare mode; navigating away and back works; no console errors; rating/move still works.

- [x] **Step 5: Commit**

```bash
git add media-viewer.js
git commit -m "feat(jxl): render decoded JXL frame 0 in single + compare mode"
```

---

## Task 7: Animated-JXL playback driver (Part 2, TDD for the driver logic)

GIF-style auto-loop on a `<canvas>`. The frame-advance logic is a pure helper tested without real timers/WASM.

**Files:**
- Modify: `media-viewer.js` — `computeJxlFrameSchedule()` (pure), `startJxlAnimation()` (driver), teardown in `cleanupCurrentMedia()`.
- Modify: `tests/media-viewer-utils.test.js`.

- [x] **Step 1: Write the failing test for the schedule helper**

```js
describe('computeJxlFrameSchedule', () => {
    const fn = extractMethod('computeJxlFrameSchedule');
    it('returns per-frame delays in ms, flooring zeros to a min', () => {
        const frames = [{ duration: 0.1 }, { duration: 0.2 }, { duration: 0 }];
        expect(fn.call({}, frames)).toEqual([100, 200, 20]); // seconds→ms, 0→20ms floor
    });
    it('handles a single frame', () => {
        expect(fn.call({}, [{ duration: 0 }])).toEqual([20]);
    });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t computeJxlFrameSchedule`
Expected: FAIL — not defined.

- [x] **Step 3: Implement schedule helper + driver**

```js
    computeJxlFrameSchedule(frames) {
        const MIN_MS = 20;
        return frames.map((f) => Math.max(MIN_MS, Math.round((f.duration || 0) * 1000)));
    }

    async startJxlAnimation(_imgEl, decoded) {
        // Replace the img placeholder with a canvas (caller created an <img>; swap it).
        const canvas = document.createElement('canvas');
        canvas.className = 'media-display';
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        this.currentMedia = canvas; // caller appends this.currentMedia after this returns
        const ctx = canvas.getContext('2d');
        const bitmaps = await Promise.all(
            decoded.frames.map((f) => createImageBitmap(new Blob([f.pngBytes], { type: 'image/png' })))
        );
        const delays = this.computeJxlFrameSchedule(decoded.frames);
        const token = {}; // identity token for teardown
        this._jxlAnimToken = token;
        let i = 0;
        let loop = 0;
        const tick = () => {
            if (this._jxlAnimToken !== token) { bitmaps.forEach((b) => b.close && b.close()); return; }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmaps[i], 0, 0);
            const delay = delays[i];
            i++;
            if (i >= bitmaps.length) {
                i = 0;
                loop++;
                if (decoded.numLoops !== 0 && loop >= decoded.numLoops) { return; } // finite loops done
            }
            this._jxlAnimTimer = setTimeout(tick, delay);
        };
        tick();
    }

    stopJxlAnimation() {
        this._jxlAnimToken = null;
        if (this._jxlAnimTimer) { clearTimeout(this._jxlAnimTimer); this._jxlAnimTimer = null; }
    }
```

Call `this.stopJxlAnimation()` at the top of `cleanupCurrentMedia()`.

> Because `startJxlAnimation` reassigns `this.currentMedia` to a canvas, adjust Task 6 Step 2: when `decoded.animated`, do **not** pre-create the `<img>`; call `await this.startJxlAnimation(null, decoded)` and let it set `this.currentMedia`. The static path keeps the `<img>`. Ensure the `this.mediaContainer.appendChild(this.currentMedia)` at ~2666 runs after this (it already does).

- [x] **Step 4: Run to verify it passes + full suite**

Run: `npx vitest run tests/media-viewer-utils.test.js -t computeJxlFrameSchedule && npx vitest run`
Expected: schedule tests PASS; whole suite green.

- [x] **Step 5: Manual smoke (animation)**

Run: `npm start`, open a folder with an animated `*.gif.jxl`. Expected: it loops smoothly; navigating away stops it (no runaway timers — check DevTools); returning replays.

- [x] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(jxl): animated JXL auto-loop playback on canvas"
```

---

## Task 8: Feature-extraction wiring for JXL (Part 2)

Hand-crafted features build `ImageData` from `new Image()` (3 sites: ~5188, ~6928, ~7979). `new Image()` can't load `.jxl`, so JXL files must get their `ImageData` from the decoded frame 0.

**Files:**
- Modify: `media-viewer.js` — add `getExtractionImageData(filePath, fileUrl)` and route the three `new Image()` image-extraction sites through it.

- [x] **Step 1: Add a unified extraction-bitmap helper**

```js
    // Returns a 256x256 ImageData for feature extraction, decoding JXL frame 0 when needed.
    async getExtractionImageData(filePath, fileUrl) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let bitmap;
        if (this.isJxl(filePath)) {
            const decoded = await this.decodeJxl(filePath);
            bitmap = await createImageBitmap(new Blob([decoded.frames[0].pngBytes], { type: 'image/png' }));
        } else {
            bitmap = await createImageBitmap(await (await fetch(fileUrl)).blob());
        }
        ctx.drawImage(bitmap, 0, 0, 256, 256);
        if (bitmap.close) bitmap.close();
        return ctx.getImageData(0, 0, 256, 256);
    }
```

> If `fetch(fileUrl)` of `file://` is blocked in the renderer, keep the existing `new Image()` path for non-JXL and only use the decode path for JXL — wrap the non-JXL branch in the current `new Image()`+`onload` logic instead of `fetch`. Verify during Step 3.

- [x] **Step 2: Route the JXL image-extraction sites**

At each of the three image-extraction sites (~5188, ~6928, ~7979), before the `new Image()` block, add:

```js
                if (this.isJxl(file.path)) {
                    const imageData = await this.getExtractionImageData(file.path, fileUrl);
                    await this.enqueueFeatureExtraction(file.path, imageData, priority);
                    return; // or continue, matching the surrounding loop/return structure
                }
```

Match each site's existing control flow (some are inside loops, some inside `prioritizeDisplayedFilesExtraction`). Keep the non-JXL `new Image()` path exactly as-is.

- [x] **Step 3: Manual smoke (hand-crafted features)**

Run: `npm start`, open a folder of JXL files with CLIP **disabled** (Settings F1). Expected: similarity sort (VPTree) works on JXL files (proves 64-dim features extracted); no decode errors in console.

- [x] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "feat(jxl): feed decoded JXL frame 0 into hand-crafted feature extraction"
```

---

## Task 9: CLIP-from-buffer IPC for JXL (Part 2)

CLIP (`extractClipEmbedding(filePath)`) does `RawImage.read(path)` in main — can't read `.jxl`. Add a sibling handler taking decoded PNG bytes; the renderer sends frame-0 PNG for JXL files.

**Files:**
- Modify: `main.js` (new `extractClipEmbeddingFromBuffer` handler beside `extractClipEmbedding`)
- Modify: `preload.js` (expose it)
- Modify: `media-viewer.js` (CLIP request path: when `isJxl`, send decoded PNG buffer instead of path)

- [x] **Step 1: Add the main handler**

Beside the existing `extractClipEmbedding` handler in `main.js`, mirroring its local-capture null-guard pattern:

```js
    ipcMain.handle('extractClipEmbeddingFromBuffer', async (_event, pngBuffer) => {
        await loadClipModel(_event);
        const processor = clipProcessor;
        const model = clipVisionModel;
        if (!processor || !model) return { success: false, error: 'CLIP unavailable' };
        try {
            const { RawImage } = await import('@huggingface/transformers');
            const blob = new Blob([Buffer.from(pngBuffer)], { type: 'image/png' });
            const image = await RawImage.fromBlob(blob);
            const inputs = await processor(image);
            const { image_embeds } = await model(inputs);
            const vec = image_embeds.normalize().tolist()[0];
            return { success: true, embedding: vec };
        } catch (err) {
            return { success: false, error: String(err && err.message ? err.message : err) };
        }
    });
```

> Match the exact post-processing (`image_embeds`, normalize, `tolist`) to whatever the existing `extractClipEmbedding` handler does — copy its body and only swap the image-acquisition lines (`RawImage.read(path)` → `RawImage.fromBlob(blob)`). Verify field names against the real handler before writing.

- [x] **Step 2: Expose in preload**

```js
    extractClipEmbeddingFromBuffer: (pngBuffer) => ipcRenderer.invoke('extractClipEmbeddingFromBuffer', pngBuffer),
```

- [x] **Step 3: Route JXL CLIP requests in the renderer**

Find the renderer call to `window.electronAPI.extractClipEmbedding(file.path)` (in the CLIP extraction path). Wrap:

```js
            let clipResult;
            if (this.isJxl(filePath)) {
                const decoded = await this.decodeJxl(filePath);
                clipResult = await window.electronAPI.extractClipEmbeddingFromBuffer(decoded.frames[0].pngBytes.buffer);
            } else {
                clipResult = await window.electronAPI.extractClipEmbedding(filePath);
            }
```

(Adapt variable names to the actual call site.)

- [x] **Step 4: Manual smoke (CLIP on JXL)**

Run: `npm start`, CLIP **enabled**, open a JXL folder, wait for extraction, then CLIP-sort. Expected: JXL files get CLIP embeddings (semantic sort orders them); no `RawImage.read` 404s in the log.

- [x] **Step 5: Commit**

```bash
git add main.js preload.js media-viewer.js
git commit -m "feat(jxl): CLIP embeddings for JXL via extractClipEmbeddingFromBuffer IPC"
```

---

## Task 10: Cache cleanup, E2E smoke, final verification (Part 2)

**Files:**
- Modify: `media-viewer.js` (`removeFileFromList` — purge `jxlFrameCache`)
- Create: `tests/e2e/jxl-rendering.test.js`, `tests/e2e/fixtures/static.jxl`

- [x] **Step 1: Purge JXL cache on file removal**

In `removeFileFromList(...)`, beside the existing `this.clipCache.delete(...)` etc.:

```js
        this.jxlFrameCache.delete(removedFile.path);
```

(Use whatever the method already calls the removed path/name.)

- [x] **Step 2: Create a static JXL fixture**

Generate a tiny static `.jxl` from an existing fixture PNG using the `media_compression` toolchain (`cjxl tests/e2e/fixtures/red-1x1.png tests/e2e/fixtures/static.jxl`), or copy a known-small `*.png.jxl`. Keep it 1x1/tiny.

- [x] **Step 3: Write the E2E smoke test**

Create `tests/e2e/jxl-rendering.test.js` following the project E2E patterns (`launchApp`, `seedLocalStorage`, `mockFolderDialog`, `createTempFixtureDir`, `closeApp`, `afterEach` null guards):

```js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, mockFolderDialog } = require('./helpers/electron-app');
const { createTempFixtureDir } = require('./helpers/...'); // match existing import style

test.describe('JXL rendering', () => {
    let electronApp, page, tmp;
    test.afterEach(async () => {
        if (page) await page.evaluate(() => {}).catch(() => {});
        if (electronApp) await closeApp(electronApp);
        if (tmp) await tmp.cleanup();
    });

    test('renders a static .jxl in single mode without error', async () => {
        tmp = await createTempFixtureDir(['static.jxl']); // ensure helper copies .jxl too
        ({ electronApp, page } = await launchApp());
        await mockFolderDialog(electronApp, tmp.path);
        // open folder via the app's normal flow, then assert the media element exists
        await page.waitForSelector('.media-display', { timeout: 10000 });
        const tag = await page.evaluate(() => document.querySelector('.media-display')?.tagName);
        expect(['IMG', 'CANVAS']).toContain(tag);
        const errors = await page.evaluate(() => window.__lastError || null);
        expect(errors).toBeNull();
    });
});
```

> Confirm `createTempFixtureDir` copies non-PNG fixtures; if it filters by extension, extend it to include `.jxl`. Match the exact folder-open interaction used by other E2E tests.

- [x] **Step 4: Run E2E**

Run: `npm run test:e2e -- jxl-rendering`
Expected: PASS. Then full E2E: `npm run test:e2e` — no regressions.

- [x] **Step 5: Full verification**

Run: `npm run lint && npx vitest run && npm run test:e2e`
Expected: lint clean; all unit tests green (≈286+); all E2E green.

- [x] **Step 6: Commit**

```bash
git add media-viewer.js tests/e2e/jxl-rendering.test.js tests/e2e/fixtures/static.jxl
git commit -m "test(jxl): E2E static-render smoke + jxlFrameCache purge on removal"
```

---

## Self-review notes (author)

- **Spec coverage:** audit → Task 2/§2; WASM eval → Task 1; detection → Tasks 2–3; binary IPC → Task 4; decode worker → Task 5; static render → Task 6; animation → Task 7; hand-crafted features → Task 8; CLIP → Task 9; loading state/graceful fallback → Task 6 Step 2 try/catch; tests → Tasks 2,3,5,7,10. All §4 components mapped.
- **Type consistency:** worker protocol `{type,id,frames:[{pngBytes,duration}],width,height,animated,numLoops}` is identical in Task 5 worker, `decodeJxl`, Task 6/7/8/9 consumers. `jxlFrameCache` entry shape `{frames,width,height,animated,numLoops}` consistent. Method names (`isJxl`, `decodeJxl`, `jxlFrameToObjectURL`, `startJxlAnimation`/`stopJxlAnimation`, `computeJxlFrameSchedule`, `getExtractionImageData`) are stable across tasks.
- **Known verify-before-write points (flagged inline):** exact CLIP handler body (Task 9 Step 1), `fetch(file://)` viability (Task 8 Step 1), `createTempFixtureDir` extension filter (Task 10 Step 3), module-worker viability (Task 1 gate). These are real-codebase confirmations, not placeholders — each has a concrete fallback.
```
