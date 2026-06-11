# Progressive Animated-JXL Decode (Frame-0-First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Animated JXL files display frame 0 within milliseconds of decode start instead of after the full ~77 MB all-frames encode; the animation loop starts once all frames are buffered.

**Architecture:** The decode worker streams `meta` → `frame`×N → `done` messages instead of one monolithic `decoded` message. The renderer's `decodeJxl()` resolves at frame-0 time with a mutable cache entry whose `frames` array grows in place; `entry.whenComplete` gates the animation loop. Mid-stream errors reject `whenComplete` only — frame 0 stays displayed as a static image. Message routing moves from `ensureJxlWorker`'s inline listener into a new `_handleJxlWorkerMessage(m)` method so unit tests exercise the real routing instead of a hand-mirrored stub.

**Tech Stack:** Electron renderer (no bundler), module Web Worker + `jxl-oxide-wasm`, Vitest (`extractMethod`/`extractAsyncMethod` pattern), Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-06-12-jxl-progressive-decode-design.md` (approved)
**Branch:** `feature/jxl-progressive-decode`

**Note on mid-branch consistency:** Tasks 1–3 change renderer and worker protocol sides in separate commits; the app is only consistent again after Task 3. Unit tests stay green at every commit (they stub the worker). Do not manually smoke-test the app between Tasks 1 and 3.

---

### Task 1: Renderer message routing — `_handleJxlWorkerMessage` + `_rejectJxlPending`

**Files:**
- Modify: `media-viewer.js` (new methods after `ensureJxlWorker`, ~L940; rewire listener + crash drain inside `ensureJxlWorker`, L883–940)
- Test: `tests/media-viewer-utils.test.js` (new `describe('_handleJxlWorkerMessage', …)` block, after the existing `describe('decodeJxl', …)` which ends ~L1478)

- [ ] **Step 1: Write the failing tests**

Add to `tests/media-viewer-utils.test.js` (after the `decodeJxl` describe block):

```js
describe('_handleJxlWorkerMessage', () => {
    const handle = extractMethod('_handleJxlWorkerMessage');
    const rejectPending = extractMethod('_rejectJxlPending');

    function makePending() {
        return {
            entry: null,
            resolveFirst: vi.fn(),
            rejectFirst: vi.fn(),
            resolveComplete: null,
            rejectComplete: null,
        };
    }
    function makeCtx(pending) {
        return {
            _jxlPending: new Map([[1, pending]]),
            _rejectJxlPending: rejectPending,
        };
    }

    it('meta builds the streaming entry with whenComplete, frameCount, and empty frames', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 4, height: 2, animated: true, numLoops: 0, frameCount: 3 });
        expect(pending.entry).toMatchObject({
            width: 4,
            height: 2,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
        });
        expect(pending.entry.frames).toEqual([]);
        expect(pending.entry.whenComplete).toBeInstanceOf(Promise);
        expect(typeof pending.resolveComplete).toBe('function');
        expect(typeof pending.rejectComplete).toBe('function');
        expect(pending.resolveFirst).not.toHaveBeenCalled();
    });

    it('first frame resolves decodeJxl once; later frames only accumulate', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 2 });
        handle.call(ctx, { type: 'frame', id: 1, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
        expect(pending.resolveFirst).toHaveBeenCalledTimes(1);
        expect(pending.resolveFirst).toHaveBeenCalledWith(pending.entry);
        handle.call(ctx, { type: 'frame', id: 1, index: 1, pngBytes: new Uint8Array([1]), duration: 50 });
        expect(pending.resolveFirst).toHaveBeenCalledTimes(1); // not re-resolved
        expect(pending.entry.frames).toHaveLength(2);
        expect(pending.entry.frames[1]).toEqual({ pngBytes: new Uint8Array([1]), duration: 50 });
    });

    it('done marks complete, resolves whenComplete with the entry, deletes pending', async () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 1 });
        handle.call(ctx, { type: 'frame', id: 1, index: 0, pngBytes: new Uint8Array([0]), duration: 0 });
        handle.call(ctx, { type: 'done', id: 1 });
        expect(pending.entry.complete).toBe(true);
        expect(ctx._jxlPending.size).toBe(0);
        await expect(pending.entry.whenComplete).resolves.toBe(pending.entry);
    });

    it('error before any frame rejects the decodeJxl promise and deletes pending', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 3 });
        handle.call(ctx, { type: 'error', id: 1, message: 'boom' });
        expect(pending.rejectFirst).toHaveBeenCalledTimes(1);
        expect(pending.rejectFirst.mock.calls[0][0].message).toBe('boom');
        expect(ctx._jxlPending.size).toBe(0);
    });

    it('mid-stream error rejects whenComplete but not the already-resolved first promise', async () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 3 });
        handle.call(ctx, { type: 'frame', id: 1, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
        handle.call(ctx, { type: 'error', id: 1, message: 'truncated' });
        expect(pending.rejectFirst).not.toHaveBeenCalled();
        await expect(pending.entry.whenComplete).rejects.toThrow('truncated');
        expect(pending.entry.complete).toBe(false);
        expect(pending.entry.frames).toHaveLength(1); // frame 0 kept
        expect(ctx._jxlPending.size).toBe(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t _handleJxlWorkerMessage`
Expected: 5 FAIL — `extractMethod` throws `Method _handleJxlWorkerMessage not found` (the method does not exist yet).

- [ ] **Step 3: Implement `_handleJxlWorkerMessage` + `_rejectJxlPending` in media-viewer.js**

Insert immediately after the closing brace of `ensureJxlWorker()` (~L940), before `async decodeJxl(filePath)`:

```js
    // Routes one streaming message from the JXL decode worker (spec 2026-06-12).
    // Protocol: meta -> frame xN -> done, or error at any point. The pending record
    // (keyed by request id) carries both promise layers: resolveFirst/rejectFirst settle
    // decodeJxl() at frame-0 time; resolveComplete/rejectComplete settle entry.whenComplete.
    _handleJxlWorkerMessage(m) {
        if (m.type === 'ready') {
            if (this._jxlResolveReady) this._jxlResolveReady();
            this._jxlResolveReady = null; // init settled — drop the resolver refs
            this._jxlRejectReady = null;
            return;
        }
        const pending = this._jxlPending.get(m.id);
        if (!pending) return;
        if (m.type === 'meta') {
            const entry = {
                frames: [], // grows in place as 'frame' messages arrive
                width: m.width,
                height: m.height,
                animated: m.animated,
                numLoops: m.numLoops,
                frameCount: m.frameCount, // total; gate animation on this, NOT frames.length
                complete: false,
                whenComplete: null,
            };
            entry.whenComplete = new Promise((res, rej) => {
                pending.resolveComplete = res;
                pending.rejectComplete = rej;
            });
            // Frame-0-only consumers never await whenComplete; swallow its rejection here
            // so a mid-stream error doesn't surface as an unhandled rejection. Real
            // consumers (startJxlAnimation) attach their own handlers.
            entry.whenComplete.catch(() => {});
            pending.entry = entry;
            return;
        }
        if (m.type === 'frame') {
            if (!pending.entry) return; // protocol violation: frame before meta — ignore
            pending.entry.frames.push({ pngBytes: m.pngBytes, duration: m.duration });
            if (pending.entry.frames.length === 1) pending.resolveFirst(pending.entry);
            return;
        }
        if (m.type === 'done') {
            this._jxlPending.delete(m.id);
            if (pending.entry) {
                pending.entry.complete = true;
                if (pending.resolveComplete) pending.resolveComplete(pending.entry);
            }
            return;
        }
        if (m.type === 'error') {
            this._jxlPending.delete(m.id);
            this._rejectJxlPending(pending, new Error(m.message));
        }
    }

    // Settles a pending JXL decode with an error at whichever layer is still open:
    // after frame 0 only whenComplete is outstanding (static frame-0 fallback);
    // before frame 0 both layers reject (decodeJxl callers handle it).
    _rejectJxlPending(pending, err) {
        if (pending.entry && pending.entry.frames.length > 0) {
            if (pending.rejectComplete) pending.rejectComplete(err);
        } else {
            pending.rejectFirst(err);
            if (pending.rejectComplete) pending.rejectComplete(err);
        }
    }
```

- [ ] **Step 4: Rewire `ensureJxlWorker` to delegate to the new handler**

In `ensureJxlWorker()`, replace the inline `message` listener body (currently L893–906):

```js
        worker.addEventListener('message', (e) => {
            const m = e.data;
            if (m.type === 'ready') {
                if (this._jxlResolveReady) this._jxlResolveReady();
                this._jxlResolveReady = null; // init settled — drop the resolver refs
                this._jxlRejectReady = null;
                return;
            }
            const pending = this._jxlPending.get(m.id);
            if (!pending) return;
            this._jxlPending.delete(m.id);
            if (m.type === 'error') pending.reject(new Error(m.message));
            else pending.resolve(m);
        });
```

with:

```js
        worker.addEventListener('message', (e) => this._handleJxlWorkerMessage(e.data));
```

And in the `error` (crash) listener, replace the drain line (currently L909):

```js
            for (const { reject } of this._jxlPending.values()) reject(new Error(msg));
```

with:

```js
            for (const pending of this._jxlPending.values()) this._rejectJxlPending(pending, new Error(msg));
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t _handleJxlWorkerMessage`
Expected: 5 PASS.

- [ ] **Step 6: Run the full unit suite (existing decodeJxl tests must still pass — they stub their own listener and don't touch the rewired production one yet)**

Run: `npx vitest run`
Expected: 302 passed (297 + 5).

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(jxl): extract streaming-aware worker message routing into _handleJxlWorkerMessage"
```

---

### Task 2: `decodeJxl` streaming pending records + protocol-updated tests

**Files:**
- Modify: `media-viewer.js` (`decodeJxl`, ~L942–975)
- Test: `tests/media-viewer-utils.test.js` (`describe('decodeJxl', …)`, L1298–1478 — update 3 mock workers, add 2 streaming tests, add a shared ctx helper)

- [ ] **Step 1: Add a shared streaming-ctx helper and rewrite the mock workers**

Inside `describe('decodeJxl', …)`, add a helper right after `const decodeJxl = extractAsyncMethod('decodeJxl');` and use it in every non-cache-hit test (replacing the per-test inline `ensureJxlWorker` stubs that hand-mirrored the OLD production listener — they now bind the REAL routing extracted in Task 1):

```js
    // Binds the real production routing (Task 1) onto the test ctx, so these tests
    // exercise actual message handling instead of a hand-mirrored stub.
    function makeJxlCtx(worker, cache = new Map()) {
        return {
            jxlFrameCache: cache,
            _jxlReqId: 0,
            _jxlPending: new Map(),
            jxlWorker: worker,
            _handleJxlWorkerMessage: extractMethod('_handleJxlWorkerMessage'),
            _rejectJxlPending: extractMethod('_rejectJxlPending'),
            ensureJxlWorker() {
                if (!this._attached) {
                    worker.addEventListener('message', (e) => this._handleJxlWorkerMessage(e.data));
                    this._attached = true;
                }
                return Promise.resolve();
            },
        };
    }

    // Mock worker that streams the new protocol: meta -> frame(s) -> done.
    function makeEchoWorker({ frameCount = 1, animated = false } = {}) {
        const listeners = {};
        const fire = (data) => (listeners.message || []).forEach((f) => f({ data }));
        return {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            _fire: fire,
            postMessage: vi.fn((m) => {
                queueMicrotask(() => {
                    fire({ type: 'meta', id: m.id, width: 4, height: 4, animated, numLoops: 0, frameCount });
                    for (let i = 0; i < frameCount; i++) {
                        fire({ type: 'frame', id: m.id, index: i, pngBytes: new Uint8Array([i + 1]), duration: 0 });
                    }
                    fire({ type: 'done', id: m.id });
                });
            }),
        };
    }
```

Then update the three existing worker-using tests:

**Happy path** (`'reads bytes, posts to the worker, resolves + caches decoded frames'`) becomes:

```js
    it('reads bytes, posts to the worker, resolves + caches decoded frames', async () => {
        const worker = makeEchoWorker();
        const ctx = makeJxlCtx(worker);
        const result = await decodeJxl.call(ctx, 'a.png.jxl');
        expect(globalThis.window.electronAPI.readFileBuffer).toHaveBeenCalledWith('a.png.jxl');
        expect(result.animated).toBe(false);
        expect(result.frameCount).toBe(1);
        expect(result.frames).toHaveLength(1);
        expect(ctx.jxlFrameCache.get('a.png.jxl')).toBe(result); // cached after decode
    });
```

**LRU test** (`'evicts the oldest entry beyond the LRU cap of 8…'`): keep the 8-seed pre-population and all assertions exactly as they are; replace only the inline worker + ctx construction with:

```js
        const worker = makeEchoWorker();
        const jxlFrameCache = new Map();
        for (let i = 0; i < 8; i++) {
            jxlFrameCache.set(`seed-${i}.jxl`, { frames: [], width: 1, height: 1, animated: false, numLoops: 0 });
        }
        const ctx = makeJxlCtx(worker, jxlFrameCache);
```

**Error test** (`'rejects when the worker replies with an error'`) becomes:

```js
    it('rejects when the worker replies with an error', async () => {
        const listeners = {};
        const worker = {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            postMessage: vi.fn((m) => {
                queueMicrotask(() =>
                    (listeners.message || []).forEach((f) =>
                        f({ data: { type: 'error', id: m.id, message: 'bad jxl' } })
                    )
                );
            }),
        };
        const ctx = makeJxlCtx(worker);
        await expect(decodeJxl.call(ctx, 'bad.png.jxl')).rejects.toThrow('bad jxl');
    });
```

The cache-hit test needs no changes (no worker interaction).

- [ ] **Step 2: Add the two new streaming tests**

```js
    it('resolves at frame 0 while later frames stream in; whenComplete delivers all frames', async () => {
        let release;
        const released = new Promise((r) => (release = r));
        const listeners = {};
        const fire = (data) => (listeners.message || []).forEach((f) => f({ data }));
        const worker = {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            postMessage: vi.fn((m) => {
                queueMicrotask(() => {
                    fire({ type: 'meta', id: m.id, width: 4, height: 4, animated: true, numLoops: 0, frameCount: 3 });
                    fire({ type: 'frame', id: m.id, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
                    released.then(() => {
                        fire({ type: 'frame', id: m.id, index: 1, pngBytes: new Uint8Array([1]), duration: 100 });
                        fire({ type: 'frame', id: m.id, index: 2, pngBytes: new Uint8Array([2]), duration: 100 });
                        fire({ type: 'done', id: m.id });
                    });
                });
            }),
        };
        const ctx = makeJxlCtx(worker);
        const entry = await decodeJxl.call(ctx, 'anim.gif.jxl');
        // Early resolve: only frame 0 buffered, total known from meta, not complete yet.
        expect(entry.frames).toHaveLength(1);
        expect(entry.frameCount).toBe(3);
        expect(entry.complete).toBe(false);
        expect(ctx.jxlFrameCache.get('anim.gif.jxl')).toBe(entry); // cached at frame-0 time
        release();
        await expect(entry.whenComplete).resolves.toBe(entry);
        expect(entry.frames).toHaveLength(3);
        expect(entry.complete).toBe(true);
    });

    it('mid-stream error rejects whenComplete; the frame-0 entry stays cached and usable', async () => {
        let release;
        const released = new Promise((r) => (release = r));
        const listeners = {};
        const fire = (data) => (listeners.message || []).forEach((f) => f({ data }));
        const worker = {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            postMessage: vi.fn((m) => {
                queueMicrotask(() => {
                    fire({ type: 'meta', id: m.id, width: 4, height: 4, animated: true, numLoops: 0, frameCount: 3 });
                    fire({ type: 'frame', id: m.id, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
                    released.then(() => fire({ type: 'error', id: m.id, message: 'truncated stream' }));
                });
            }),
        };
        const ctx = makeJxlCtx(worker);
        const entry = await decodeJxl.call(ctx, 'anim.gif.jxl');
        expect(entry.frames).toHaveLength(1);
        release();
        await expect(entry.whenComplete).rejects.toThrow('truncated stream');
        expect(entry.complete).toBe(false);
        expect(entry.frames).toHaveLength(1); // frame 0 kept — static fallback material
        expect(ctx.jxlFrameCache.get('anim.gif.jxl')).toBe(entry); // entry NOT purged
    });
```

- [ ] **Step 3: Run the decodeJxl tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t decodeJxl`
Expected: FAIL — `decodeJxl` still constructs its own entry from a single `decoded` message and sets `{resolve, reject}` pending records, so the real handler never finds `resolveFirst` (TypeError) / streaming assertions fail. Cache-hit test still passes.

- [ ] **Step 4: Update `decodeJxl` implementation**

Replace the body from `const id = ++this._jxlReqId;` through `return entry;` (~L953–974) with:

```js
        const id = ++this._jxlReqId;
        // Resolves at frame-0 time: _handleJxlWorkerMessage settles resolveFirst as soon as
        // meta + the first 'frame' message arrive. The entry's frames array keeps growing
        // in place afterwards; entry.whenComplete settles when the stream finishes.
        const entry = await new Promise((resolve, reject) => {
            this._jxlPending.set(id, {
                entry: null,
                resolveFirst: resolve,
                rejectFirst: reject,
                resolveComplete: null,
                rejectComplete: null,
            });
            this.jxlWorker.postMessage({ type: 'decode', id, buffer }, [buffer]);
        });
        this.jxlFrameCache.set(filePath, entry);
        // Bound the cache as a true-LRU. Animated JXL entries can be very large
        // (a 270-frame file holds ~77 MB of PNG bytes), so cap to a small number
        // of most-recently-used entries to avoid unbounded growth across navigation.
        const JXL_CACHE_MAX = 8;
        while (this.jxlFrameCache.size > JXL_CACHE_MAX) {
            const oldestKey = this.jxlFrameCache.keys().next().value; // Map preserves insertion order
            this.jxlFrameCache.delete(oldestKey);
        }
        return entry;
```

(The old `const decoded = await …; const entry = { frames: decoded.frames, … };` construction disappears — the handler builds the entry.)

- [ ] **Step 5: Run the decodeJxl tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t decodeJxl`
Expected: 6 PASS (4 updated/kept + 2 new).

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: 304 passed (302 + 2).

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(jxl): decodeJxl resolves at frame 0 with mutable streaming cache entry"
```

---

### Task 3: Worker streaming rewrite

**Files:**
- Modify: `jxl-decode-worker.js` (entire decode branch)

No unit test — the module worker imports wasm glue and is not loadable under Vitest; the E2E static smoke (Task 5) exercises it end-to-end under Electron.

- [ ] **Step 1: Rewrite `jxl-decode-worker.js`**

Full new file content:

```js
// Module Web Worker: decodes JXL bytes to per-frame PNG blobs + durations,
// STREAMING frames as they are encoded (frame-0-first; spec 2026-06-12).
// Protocol in:  { type: 'init', wasmBytes }   (sent once before first decode)
//               { type: 'decode', id, buffer }
// Protocol out: { type: 'ready' }
//               { type: 'meta',  id, width, height, animated, numLoops, frameCount }
//               { type: 'frame', id, index, pngBytes, duration }   (one per frame, transferable)
//               { type: 'done',  id }
//               { type: 'error', id, message }   (may arrive mid-stream, after some frames)
import init, { JxlImage } from './vendor/jxl-oxide-wasm/jxl_oxide_wasm.js';

let ready = null;

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
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
        self.postMessage({
            type: 'meta',
            id,
            width: img.width,
            height: img.height,
            animated,
            numLoops: img.numLoops,
            frameCount: count,
        });
        for (let i = 0; i < count; i++) {
            const r = img.render(animated ? i : undefined);
            const duration = animated ? r.duration : 0; // READ metadata BEFORE encodeToPng()
            const pngBytes = r.encodeToPng(); // terminal — must be last; do not free() after
            self.postMessage({ type: 'frame', id, index: i, pngBytes, duration }, [pngBytes.buffer]);
        }
        img.free();
        self.postMessage({ type: 'done', id });
    } catch (err) {
        self.postMessage({ type: 'error', id, message: String(err && err.message ? err.message : err) });
    }
};
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean (file stays in ESLint block 3a-jxl; no new globals).

- [ ] **Step 3: Run the full unit suite (regression check — worker is not unit-covered, suite must stay green)**

Run: `npx vitest run`
Expected: 304 passed.

- [ ] **Step 4: Commit**

```bash
git add jxl-decode-worker.js
git commit -m "feat(jxl): worker streams meta/frame/done instead of monolithic decoded message"
```

---

### Task 4: `startJxlAnimation` frame-0-first + `showMedia` frameCount gate

**Files:**
- Modify: `media-viewer.js` (`startJxlAnimation`, ~L1001–1051; `showMedia` animated gate, ~L2866)
- Test: `tests/media-viewer-utils.test.js` (new `describe('startJxlAnimation frame-0-first', …)`)

- [ ] **Step 1: Write the failing tests**

Add after the `_handleJxlWorkerMessage` describe block:

```js
describe('startJxlAnimation frame-0-first', () => {
    const startJxlAnimation = extractAsyncMethod('startJxlAnimation');
    let origWindow, origDocument, origCreateImageBitmap;
    let drawCtx, canvas;

    beforeEach(() => {
        drawCtx = { clearRect: vi.fn(), drawImage: vi.fn() };
        canvas = { className: '', width: 0, height: 0, style: {}, getContext: () => drawCtx };
        origDocument = globalThis.document;
        globalThis.document = { createElement: () => canvas };
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
        origCreateImageBitmap = globalThis.createImageBitmap;
        globalThis.createImageBitmap = vi.fn(async () => ({ close: vi.fn() }));
    });
    afterEach(() => {
        globalThis.document = origDocument;
        globalThis.window = origWindow;
        globalThis.createImageBitmap = origCreateImageBitmap;
    });

    function makeCtx() {
        return {
            _jxlAnimToken: null,
            _jxlAnimTimer: null,
            currentMedia: null,
            computeJxlFrameSchedule: (frames) => frames.map(() => 20),
        };
    }
    const frame = (n) => ({ pngBytes: new Uint8Array([n]), duration: 100 });

    it('draws frame 0 immediately and does not start the loop while frames are still buffering', async () => {
        const ctx = makeCtx();
        const decoded = {
            frames: [frame(0)], // only frame 0 buffered so far
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
            whenComplete: new Promise(() => {}), // never settles
        };
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(drawCtx.drawImage).toHaveBeenCalledTimes(1));
        expect(ctx.currentMedia).toBe(canvas);
        expect(ctx._jxlAnimTimer).toBeFalsy(); // loop not scheduled — still buffering
    });

    it('starts the drawNext loop once whenComplete resolves', async () => {
        const ctx = makeCtx();
        let releaseBuffer;
        const decoded = {
            frames: [frame(0)],
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
            whenComplete: new Promise((r) => (releaseBuffer = r)),
        };
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(drawCtx.drawImage).toHaveBeenCalledTimes(1)); // frame 0
        decoded.frames.push(frame(1), frame(2));
        decoded.complete = true;
        releaseBuffer(decoded);
        // Loop's first drawNext re-draws frame 0 (visual no-op) — a second drawImage
        // call proves the loop started. Use >= 2: the 20ms frame timer may already have
        // fired again by the first waitFor poll (exact-count would flake).
        await vi.waitFor(() => expect(drawCtx.drawImage.mock.calls.length).toBeGreaterThanOrEqual(2));
        ctx._jxlAnimToken = null; // teardown: stop further scheduling
    });

    it('whenComplete rejection logs and leaves frame 0 as a static image', async () => {
        const ctx = makeCtx();
        const decoded = {
            frames: [frame(0)],
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
            whenComplete: Promise.reject(new Error('truncated stream')),
        };
        decoded.whenComplete.catch(() => {}); // mirror production's no-op guard
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(globalThis.window.electronAPI.logError).toHaveBeenCalled());
        expect(drawCtx.drawImage).toHaveBeenCalledTimes(1); // frame 0 only, loop never ran
        expect(ctx._jxlAnimTimer).toBeFalsy();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "startJxlAnimation frame-0-first"`
Expected: FAIL — current implementation computes `delays` from a 1-frame array and starts `drawNext` immediately (test 1: `_jxlAnimTimer` truthy after first draw; test 3: no `logError`).

- [ ] **Step 3: Rewrite `startJxlAnimation`**

Replace the whole method (~L1001–1051) with:

```js
    // Animated JXL playback: decode ONE frame at a time to an ImageBitmap, draw, close it.
    // Never holds more than ~1 decoded frame in memory (270x720p as bitmaps would be ~1GB).
    // Frame-0-first (spec 2026-06-12): draws frame 0 as soon as it exists, then waits for
    // decoded.whenComplete before starting the loop. Returns after canvas setup — the
    // buffering wait runs fire-and-forget so callers can append + finish display immediately.
    async startJxlAnimation(decoded) {
        const canvas = document.createElement('canvas');
        canvas.className = 'media-display';
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        this.currentMedia = canvas; // caller appends this.currentMedia after we return
        const ctx = canvas.getContext('2d');
        const token = {}; // identity token for teardown
        this._jxlAnimToken = token;
        const runWhenBuffered = async () => {
            // Show frame 0 immediately — the rest of the animation may still be streaming
            // in from the decode worker.
            try {
                const bmp0 = await createImageBitmap(new Blob([decoded.frames[0].pngBytes], { type: 'image/png' }));
                if (this._jxlAnimToken !== token) {
                    if (bmp0.close) bmp0.close();
                    return;
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bmp0, 0, 0);
                if (bmp0.close) bmp0.close();
            } catch (_e) {
                // Frame 0 undrawable — the loop below may still recover via its skip logic.
            }
            // Wait until every frame is buffered. Mid-stream decode errors reject
            // whenComplete: leave frame 0 displayed as a static image (approved fallback).
            if (decoded.whenComplete) {
                try {
                    await decoded.whenComplete;
                } catch (err) {
                    window.electronAPI.logError(
                        'JXL streaming decode failed mid-animation (showing frame 0 static): ' +
                            (err && err.message ? err.message : err)
                    );
                    return;
                }
                if (this._jxlAnimToken !== token) return; // superseded during buffering
            }
            const delays = this.computeJxlFrameSchedule(decoded.frames);
            let i = 0;
            let loop = 0;
            let consecutiveFailures = 0;
            // Advance to the next frame, wrapping + counting loops. Returns false once a finite
            // numLoops has completed (caller stops), true to keep playing.
            const advance = () => {
                i++;
                if (i >= decoded.frames.length) {
                    i = 0;
                    loop++;
                    if (decoded.numLoops !== 0 && loop >= decoded.numLoops) return false; // finite loops done
                }
                return true;
            };
            const drawNext = async () => {
                if (this._jxlAnimToken !== token) return; // superseded by navigation/cleanup
                const delay = delays[i];
                let bmp;
                try {
                    bmp = await createImageBitmap(new Blob([decoded.frames[i].pngBytes], { type: 'image/png' }));
                    consecutiveFailures = 0;
                } catch (_e) {
                    // Skip a single corrupt frame and keep playing; bail only if an entire pass fails.
                    consecutiveFailures++;
                    if (consecutiveFailures >= decoded.frames.length) return; // whole animation undecodable
                    if (!advance()) return;
                    this._jxlAnimTimer = setTimeout(drawNext, delay);
                    return;
                }
                if (this._jxlAnimToken !== token) {
                    if (bmp.close) bmp.close();
                    return;
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bmp, 0, 0);
                if (bmp.close) bmp.close();
                if (!advance()) return;
                this._jxlAnimTimer = setTimeout(drawNext, delay);
            };
            drawNext();
        };
        runWhenBuffered();
    }
```

(The `advance`/`drawNext` loop is byte-for-byte today's code — only its enclosure moved inside `runWhenBuffered`, after the frame-0 draw and the `whenComplete` await.)

- [ ] **Step 4: Update the `showMedia` animated gate**

At ~L2866, change:

```js
                    if (decoded.animated && decoded.frames.length > 1) {
```

to:

```js
                    if (decoded.animated && decoded.frameCount > 1) {
```

(At resolve time only frame 0 is buffered — `frames.length` is 1 even for a 270-frame animation. `frameCount` comes from the worker's `meta` message.)

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "startJxlAnimation frame-0-first"`
Expected: 3 PASS.

- [ ] **Step 6: Run the full unit suite + lint**

Run: `npx vitest run && npm run lint`
Expected: 307 passed (304 + 3); lint clean.

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(jxl): startJxlAnimation shows frame 0 immediately, loops once buffered"
```

---

### Task 5: End-to-end verification

**Files:** none modified (verification only)

- [ ] **Step 1: JXL E2E smoke (full new protocol under Electron — worker's only automated coverage)**

Run: `npx playwright test tests/e2e/jxl-rendering.test.js`
Expected: 1 passed ("renders a static .jxl file as a visible media element without errors").

- [ ] **Step 2: Full E2E suite**

Run: `npm run test:e2e`
Expected: 42/43 passed — the single known pre-existing failure is `app-launch.test.js` (`#viewModeBtn` assertion, BACKLOG 2026-06-07, owned by Group CW-2). Any OTHER failure is a regression from this branch: stop and debug with superpowers:systematic-debugging before proceeding.

- [ ] **Step 3: Manual animated smoke (user-side)**

Ask the user to run `npm start`, open the folder containing the 270-frame `.gif.jxl` from the original BACKLOG intake, and confirm: (a) frame 0 appears near-instantly (no multi-second spinner), (b) animation starts after a short buffering pause, (c) navigation away/back mid-buffer doesn't wedge playback (identity-token teardown). Record the result in the plan's progress log.

---

### Task 6: Documentation updates

**Files:**
- Modify: `CLAUDE.md` (jxl-decode-worker.js line in the structure tree; `jxlFrameCache` line in Cache Management; `decodeJxl` test-count notes in Testing section)

- [ ] **Step 1: Update the `jxl-decode-worker.js` structure-tree line**

Replace the OUT-protocol fragment in the `jxl-decode-worker.js` line of the Architecture tree:

`OUT: {type:'ready'} / {type:'decoded',id,frames:[{pngBytes,duration}],width,height,animated,numLoops} / {type:'error',id,message}`

with:

`OUT: {type:'ready'} / {type:'meta',id,width,height,animated,numLoops,frameCount} / {type:'frame',id,index,pngBytes,duration} (streamed per frame, transferable) / {type:'done',id} / {type:'error',id,message} (may arrive mid-stream)`

- [ ] **Step 2: Update the JXL frame cache entry in Cache Management**

In the "JXL frame cache (`jxlFrameCache` Map)" bullet, after the LRU description, append:

`; entries are MUTABLE streaming objects (spec 2026-06-12): {frames (grows in place), width, height, animated, numLoops, frameCount, complete, whenComplete} — decodeJxl resolves at frame-0 time, entry.whenComplete settles when the stream finishes (rejects on mid-stream error; frame-0 static fallback in startJxlAnimation); gate animation on frameCount, NOT frames.length; routing lives in _handleJxlWorkerMessage + _rejectJxlPending (extractMethod-testable)`

Also update the constructor comment reference at media-viewer.js:388 if the entry-shape comment there still lists the old shape (`// filePath -> { frames, width, height, animated, numLoops }` → add `frameCount, complete, whenComplete`).

- [ ] **Step 3: Update unit-test counts**

In the Testing section's running tally, append: `; streaming decode (spec 2026-06-12): describe('_handleJxlWorkerMessage') ×5 + decodeJxl streaming ×2 + describe('startJxlAnimation frame-0-first') ×3, existing decodeJxl mocks rewritten to meta/frame/done protocol → 307 unit tests`.

- [ ] **Step 4: Run the unit suite one final time, then commit**

Run: `npx vitest run`
Expected: 307 passed.

```bash
git add CLAUDE.md media-viewer.js
git commit -m "docs: update JXL streaming protocol + cache entry shape in CLAUDE.md"
```

---

## Verification Summary

| Check | Command | Expected |
|---|---|---|
| Unit suite | `npx vitest run` | 307 passed (297 + 10 new) |
| Lint | `npm run lint` | clean |
| JXL E2E smoke | `npx playwright test tests/e2e/jxl-rendering.test.js` | 1 passed |
| Full E2E | `npm run test:e2e` | 42/43 (known `#viewModeBtn` fail only) |
| Manual | user smoke with 270-frame `.gif.jxl` | frame 0 near-instant; loop starts after buffer |

## Out of Scope (per spec §7)

- Per-request decode timeout (CW-1 "JXL error-path hardening trio")
- Play-during-decode
- Compare-mode animation
