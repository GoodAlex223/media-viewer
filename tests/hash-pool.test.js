// G2 PR 2 T4: hash-pool.js — the per-run pool of hash workers, driven by fake workers. Today's main-thread route,
// the JXL bytes and the canary images are injected, so nothing here touches a DOM or a real Worker.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as MediaUrl from '../media-url.js';
import { HashPool, isVideoPath, POOL_SIZE, WORKER_TASK_TIMEOUT_MS, CANARY_TIMEOUT_MS } from '../hash-pool.js';

const PIXEL_BYTES = 256 * 256 * 4;
const H = (c) => c.repeat(256);

// Records posts, replies on demand (or through a responder), can crash or hang, and counts terminate().
class FakeHashWorker {
    constructor(index, responder) {
        this.index = index;
        this.responder = responder;
        this.posts = [];
        this.answered = new Set();
        this.terminated = 0;
        this.hung = false;
        this.listeners = { message: [], error: [], messageerror: [] };
    }
    addEventListener(type, fn) {
        (this.listeners[type] ||= []).push(fn);
    }
    removeEventListener(type, fn) {
        this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    }
    postMessage(message, transfer) {
        this.posts.push({ message, transfer });
        if (transfer && transfer.length) {
            // What a real post does to a transferred buffer: it detaches it.
            structuredClone(message, { transfer });
        }
        if (this.responder) {
            Promise.resolve().then(() => {
                if (!this.hung && !this.terminated) {
                    this.responder(this, message);
                }
            });
        }
    }
    reply(id, result) {
        this.answered.add(id);
        const data = { type: 'result', id, ...result };
        for (const fn of this.listeners.message) {
            fn({ data });
        }
    }
    crash() {
        for (const fn of this.listeners.error) {
            fn({ message: 'boom', preventDefault() {} });
        }
    }
    hang() {
        this.hung = true;
    }
    terminate() {
        this.terminated++;
    }
    get unanswered() {
        return this.posts.filter((p) => !this.answered.has(p.message.id)).length;
    }
}

let workers;
const okReply = (w, m) => w.reply(m.id, { ok: true, hash: H('1'), info: { type: 'jpeg', format: 'I420', icc: false } });

function factory(responder = okReply) {
    return vi.fn(() => {
        const w = new FakeHashWorker(workers.length, typeof responder === 'function' ? responder : null);
        workers.push(w);
        return w;
    });
}

function makePool(overrides = {}) {
    return new HashPool({
        size: 3,
        createWorker: factory(),
        hashOnMainThread: vi.fn(async () => H('0')),
        hashMainUrlPixels: vi.fn(async () => ({ hash: H('1'), pixels: new Uint8ClampedArray(PIXEL_BYTES) })),
        makeCanaryImages: vi.fn(async () => [
            { name: 'canary-jpeg', blob: new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: 'image/jpeg' }) },
            { name: 'canary-png', blob: new Blob([new Uint8Array([0x89, 0x50, 2])], { type: 'image/png' }) },
        ]),
        getJxlPngBytes: vi.fn(async () => new Uint8Array(64)),
        isJxl: (p) => /\.jxl$/i.test(p),
        toMediaUrl: MediaUrl.toMediaUrl,
        ...overrides,
    });
}

async function collect(gen) {
    const out = [];
    for await (const r of gen) {
        out.push(r);
    }
    return out;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const allPosts = () => workers.reduce((n, w) => n + w.posts.length, 0);

beforeEach(() => {
    workers = [];
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('hash-pool constants', () => {
    it('match the spec', () => {
        expect(POOL_SIZE).toBe(3);
        expect(WORKER_TASK_TIMEOUT_MS).toBe(30_000);
        expect(CANARY_TIMEOUT_MS).toBe(5_000);
    });

    it("isVideoPath is today's test", () => {
        expect(isVideoPath('a.mp4')).toBe(true);
        expect(isVideoPath('a.WEBM')).toBe(true);
        expect(isVideoPath('a.mov')).toBe(true);
        expect(isVideoPath('a.mkv')).toBe(false);
        expect(isVideoPath('a.jpg')).toBe(false);
    });
});

describe('HashPool dispatch', () => {
    it('hashes every image through the workers, at most size at a time', async () => {
        const pool = makePool({ createWorker: factory(null) });
        expect(pool.size).toBe(3);
        const paths = Array.from({ length: 10 }, (_, i) => `C:\\d\\${i}.jpg`);
        const done = collect(pool.hashFiles(paths));
        let finished = false;
        done.then(() => (finished = true));
        let maxSeen = 0;
        for (let guard = 0; guard < 100 && !finished; guard++) {
            await tick();
            const open = workers.reduce((n, w) => n + w.unanswered, 0);
            expect(open).toBeLessThanOrEqual(3);
            maxSeen = Math.max(maxSeen, open);
            // Answer one task (the oldest still open).
            for (const w of workers) {
                const p = w.posts.find((x) => !w.answered.has(x.message.id));
                if (p) {
                    okReply(w, p.message);
                    break;
                }
            }
        }
        const results = await done;
        expect(maxSeen).toBe(3);
        expect(workers.length).toBe(3);
        expect(results).toHaveLength(10);
        expect(new Set(results.map((r) => r.path))).toEqual(new Set(paths));
        for (const r of results) {
            expect(r.route).toBe('worker');
            expect(r.hash).toBe(H('1'));
            expect(r.info).toEqual({ type: 'jpeg', format: 'I420', icc: false });
        }
    }, 2000);

    it('yields results in completion order', async () => {
        const pool = makePool({ createWorker: factory(null) });
        const gen = pool.hashFiles(['a.jpg', 'b.jpg', 'c.jpg']);
        const first = gen.next();
        await tick();
        // Answer c, then a, then b.
        const byPath = (name) => {
            for (const w of workers) {
                const p = w.posts.find((x) => x.message.url === MediaUrl.toMediaUrl(name));
                if (p) {
                    return [w, p.message];
                }
            }
            throw new Error('not posted: ' + name);
        };
        okReply(...byPath('c.jpg'));
        expect((await first).value.path).toBe('c.jpg');
        okReply(...byPath('a.jpg'));
        okReply(...byPath('b.jpg'));
        expect((await gen.next()).value.path).toBe('a.jpg');
        expect((await gen.next()).value.path).toBe('b.jpg');
        expect(await gen.next()).toEqual({ done: true, value: undefined });
    }, 2000);

    it("a video goes to today's route and never to a worker", async () => {
        const pool = makePool();
        const results = await collect(pool.hashFiles(['a.mp4', 'b.MOV', 'c.webm']));
        expect(pool.createWorker).not.toHaveBeenCalled();
        expect(pool.hashOnMainThread).toHaveBeenCalledTimes(3);
        expect(results.map((r) => r.route)).toEqual(['main', 'main', 'main']);
        expect(results.every((r) => r.hash === H('0'))).toBe(true);
    }, 2000);

    it("today's route runs one call at a time", async () => {
        let active = 0;
        let maxActive = 0;
        const hashOnMainThread = vi.fn(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await tick();
            active--;
            return H('0');
        });
        const pool = makePool({ hashOnMainThread });
        const results = await collect(pool.hashFiles(['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4']));
        expect(results).toHaveLength(4);
        expect(maxActive).toBe(1);
    }, 2000);

    it("a worker failure falls back to today's route; a failure there yields none", async () => {
        const responder = (w, m) => w.reply(m.id, { ok: false, error: 'decode failed' });
        const hashOnMainThread = vi.fn(async (p) => {
            if (p === 'b.jpg') {
                throw new Error('Image load error: x');
            }
            return H('0');
        });
        const pool = makePool({ createWorker: factory(responder), hashOnMainThread });
        const results = await collect(pool.hashFiles(['a.jpg', 'b.jpg']));
        const byPath = Object.fromEntries(results.map((r) => [r.path, r]));
        expect(byPath['a.jpg']).toEqual({ path: 'a.jpg', hash: H('0'), route: 'main' });
        expect(byPath['b.jpg']).toEqual({
            path: 'b.jpg',
            hash: null,
            route: 'none',
            error: 'Image load error: x',
        });
        // An ok:false reply is the file's answer, not a crash: it is never retried on a worker.
        expect(allPosts()).toBe(2);
    }, 2000);

    it("a crashed worker is replaced and its file re-queued once; a second crash sends it to today's route", async () => {
        // Worker 0 crashes on its first task; its replacement answers.
        const responder = (w, m) => (w.index === 0 ? w.crash() : okReply(w, m));
        const pool = makePool({ size: 1, createWorker: factory(responder) });
        const results = await collect(pool.hashFiles(['a.jpg']));
        expect(workers).toHaveLength(2);
        expect(workers[0].terminated).toBe(1);
        expect(workers[1].posts[0].message.url).toBe(MediaUrl.toMediaUrl('a.jpg'));
        expect(results).toEqual([expect.objectContaining({ path: 'a.jpg', route: 'worker', hash: H('1') })]);
        expect(pool.hashOnMainThread).not.toHaveBeenCalled();

        // Every worker crashes: one retry, then today's route; the next file still gets its own retry.
        workers = [];
        const crashing = makePool({ size: 1, createWorker: factory((w) => w.crash()) });
        const res2 = await collect(crashing.hashFiles(['x.jpg', 'y.jpg']));
        expect(res2.map((r) => [r.path, r.route])).toEqual([
            ['x.jpg', 'main'],
            ['y.jpg', 'main'],
        ]);
        expect(allPosts()).toBe(4);
        expect(workers.every((w) => w.terminated === 1)).toBe(true);
        expect(crashing.hashOnMainThread).toHaveBeenCalledTimes(2);
    }, 2000);

    it('a worker that does not answer in time is terminated, replaced, and its file re-queued once', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const responder = (w, m) => (w.index === 0 ? w.hang() : okReply(w, m));
        const pool = makePool({ size: 1, createWorker: factory(responder), taskTimeoutMs: 1000 });
        const done = collect(pool.hashFiles(['a.jpg']));
        await vi.advanceTimersByTimeAsync(999);
        expect(workers).toHaveLength(1);
        expect(workers[0].terminated).toBe(0);
        await vi.advanceTimersByTimeAsync(1);
        const results = await done;
        expect(workers).toHaveLength(2);
        expect(workers[0].terminated).toBe(1);
        expect(results).toEqual([expect.objectContaining({ path: 'a.jpg', route: 'worker' })]);
        expect(vi.getTimerCount()).toBe(0);

        // Two timeouts on one file: today's route.
        workers = [];
        const hanging = makePool({ size: 1, createWorker: factory((w) => w.hang()), taskTimeoutMs: 1000 });
        const done2 = collect(hanging.hashFiles(['b.jpg']));
        await vi.advanceTimersByTimeAsync(2000);
        expect(await done2).toEqual([{ path: 'b.jpg', hash: H('0'), route: 'main' }]);
        expect(workers).toHaveLength(2);
        expect(workers.every((w) => w.terminated === 1)).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    }, 2000);

    it('abort ends the iteration at once and terminates every worker', async () => {
        // Review Focus #2: every worker is mid-decode and never replies.
        const pool = makePool({ createWorker: factory((w) => w.hang()) });
        const controller = new AbortController();
        const gen = pool.hashFiles(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'], { signal: controller.signal });
        const next = gen.next();
        await tick();
        expect(allPosts()).toBe(3);
        controller.abort();
        expect(await next).toEqual({ done: true, value: undefined });
        expect(workers).toHaveLength(3);
        expect(workers.every((w) => w.terminated === 1)).toBe(true);
        await tick();
        expect(allPosts()).toBe(3);
        expect(pool.hashOnMainThread).not.toHaveBeenCalled();
    }, 1000);

    it('an already-aborted signal yields nothing and posts nothing', async () => {
        const pool = makePool();
        const controller = new AbortController();
        controller.abort();
        expect(await collect(pool.hashFiles(['a.jpg'], { signal: controller.signal }))).toEqual([]);
        expect(pool.createWorker).not.toHaveBeenCalled();
    }, 1000);

    it("abort drops an in-flight today's-route call without awaiting it", async () => {
        let rejectMain;
        const hashOnMainThread = vi.fn(() => new Promise((_, reject) => (rejectMain = reject)));
        const pool = makePool({ hashOnMainThread });
        const controller = new AbortController();
        const gen = pool.hashFiles(['a.mp4', 'b.mp4'], { signal: controller.signal });
        const next = gen.next();
        await tick();
        controller.abort();
        expect(await next).toEqual({ done: true, value: undefined });
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        rejectMain(new Error('late'));
        await tick();
        process.off('unhandledRejection', unhandled);
        expect(unhandled).not.toHaveBeenCalled();
        expect(hashOnMainThread).toHaveBeenCalledTimes(1);
    }, 1000);

    it('the consumer stopping early terminates every worker and dispatches nothing more', async () => {
        // Replies by hand: one task answers, the consumer breaks, the other two answer after it stopped.
        const pool = makePool({ createWorker: factory(null) });
        const paths = Array.from({ length: 9 }, (_, i) => `${i}.jpg`);
        const answerFirstOpen = () => {
            for (const w of workers) {
                const p = w.posts.find((x) => !w.answered.has(x.message.id));
                if (p) {
                    okReply(w, p.message);
                    return;
                }
            }
        };
        setTimeout(answerFirstOpen, 0);
        let seen = 0;
        for await (const _r of pool.hashFiles(paths)) {
            seen++;
            break;
        }
        expect(seen).toBe(1);
        const posted = allPosts();
        expect(posted).toBe(4); // 3 at start, 1 refill after the first answer
        expect(workers).toHaveLength(3);
        expect(workers.every((w) => w.terminated === 1)).toBe(true);
        for (const w of workers) {
            for (const p of w.posts) {
                if (!w.answered.has(p.message.id)) {
                    okReply(w, p.message);
                }
            }
        }
        await tick();
        expect(allPosts()).toBe(posted);
        expect(pool.hashOnMainThread).not.toHaveBeenCalled();
    }, 1000);

    it("route 'worker' never falls back, even when mainOnly; route 'main' never uses a worker", async () => {
        const responder = (w, m) =>
            m.url === MediaUrl.toMediaUrl('bad.jpg') ? w.reply(m.id, { ok: false, error: 'nope' }) : okReply(w, m);
        const pool = makePool({ createWorker: factory(responder) });
        pool.mainOnly = true;
        const results = await collect(pool.hashFiles(['a.jpg', 'bad.jpg', 'v.mp4'], { route: 'worker' }));
        const byPath = Object.fromEntries(results.map((r) => [r.path, r]));
        expect(byPath['a.jpg'].route).toBe('worker');
        expect(byPath['bad.jpg']).toEqual({ path: 'bad.jpg', hash: null, route: 'none', error: 'nope' });
        expect(byPath['v.mp4']).toEqual({ path: 'v.mp4', hash: null, route: 'none', error: 'video' });
        expect(pool.hashOnMainThread).not.toHaveBeenCalled();

        // A second crash in parity mode yields none, never today's route.
        workers = [];
        const crashing = makePool({ size: 1, createWorker: factory((w) => w.crash()) });
        const res2 = await collect(crashing.hashFiles(['c.jpg'], { route: 'worker' }));
        expect(res2).toEqual([expect.objectContaining({ path: 'c.jpg', hash: null, route: 'none' })]);
        expect(crashing.hashOnMainThread).not.toHaveBeenCalled();

        workers = [];
        const mainPool = makePool();
        const res3 = await collect(mainPool.hashFiles(['a.jpg', 'b.jxl', 'c.mp4'], { route: 'main' }));
        expect(res3.map((r) => r.route)).toEqual(['main', 'main', 'main']);
        expect(mainPool.createWorker).not.toHaveBeenCalled();
        expect(mainPool.getJxlPngBytes).not.toHaveBeenCalled();
    }, 2000);

    it('JXL bytes are posted as a copy, never transferred', async () => {
        // Review Focus #3: the bytes are jxlFrameCache's; a transfer would detach the display cache's buffer.
        const source = new Uint8Array(64).fill(9);
        const getJxlPngBytes = vi.fn(async () => source);
        const pool = makePool({ getJxlPngBytes });
        const results = await collect(pool.hashFiles(['C:\\d\\a.jxl']));
        expect(getJxlPngBytes).toHaveBeenCalledWith('C:\\d\\a.jxl');
        const [post] = workers[0].posts;
        expect(post.message.type).toBe('hash');
        expect(post.message.url).toBeUndefined();
        expect(post.message.bytes).toBe(source);
        expect(post.transfer === undefined || post.transfer.length === 0).toBe(true);
        expect(source.byteLength).toBe(64);
        expect(results).toEqual([expect.objectContaining({ route: 'worker' })]);
    }, 1000);

    it("a failed JXL decode goes to today's route", async () => {
        const pool = makePool({ getJxlPngBytes: vi.fn(async () => Promise.reject(new Error('bad jxl'))) });
        const results = await collect(pool.hashFiles(['a.jxl']));
        expect(results).toEqual([{ path: 'a.jxl', hash: H('0'), route: 'main' }]);
        expect(allPosts()).toBe(0);
    }, 1000);

    it('an image is fetched by its media URL', async () => {
        const path = 'C:\\d\\100% #1 фото.jpg';
        const pool = makePool();
        await collect(pool.hashFiles([path]));
        expect(workers[0].posts[0].message).toEqual({
            type: 'hash',
            id: expect.any(Number),
            url: MediaUrl.toMediaUrl(path),
        });
        expect(workers[0].posts[0].transfer).toBeUndefined();
    }, 1000);

    it("a worker that cannot be created sends every file to today's route", async () => {
        const createWorker = vi.fn(() => {
            throw new Error('no workers');
        });
        const pool = makePool({ createWorker });
        const results = await collect(pool.hashFiles(['a.jpg', 'b.png', 'c.jpg', 'd.jpg']));
        expect(pool.mainOnly).toBe(true);
        expect(results.map((r) => r.route)).toEqual(['main', 'main', 'main', 'main']);
        expect(pool.hashOnMainThread).toHaveBeenCalledTimes(4);
    }, 1000);

    // F1: a freed slot must pump every live run, not only the one that freed it.
    it('a run started while another holds every slot still finishes', async () => {
        const pool = makePool({ size: 1, createWorker: factory(null) });
        const one = collect(pool.hashFiles(['a.jpg']));
        await tick();
        const two = collect(pool.hashFiles(['b.jpg']));
        await tick();
        expect(allPosts()).toBe(1);
        okReply(workers[0], workers[0].posts[0].message);
        expect(await one).toEqual([expect.objectContaining({ path: 'a.jpg', route: 'worker' })]);
        await tick();
        expect(allPosts()).toBe(2);
        okReply(workers[0], workers[0].posts[1].message);
        expect(await two).toEqual([expect.objectContaining({ path: 'b.jpg', route: 'worker' })]);
    }, 1000);

    it("a run started right after another's abort still finishes", async () => {
        // Worker 0 hangs; the respawned worker answers.
        const pool = makePool({ size: 1, createWorker: factory((w, m) => (w.index === 0 ? w.hang() : okReply(w, m))) });
        const controller = new AbortController();
        const one = pool.hashFiles(['a.jpg'], { signal: controller.signal });
        const oneNext = one.next();
        await tick();
        expect(allPosts()).toBe(1);
        controller.abort();
        const two = collect(pool.hashFiles(['b.jpg']));
        expect(await oneNext).toEqual({ done: true, value: undefined });
        expect(await two).toEqual([expect.objectContaining({ path: 'b.jpg', route: 'worker' })]);
        expect(workers[0].terminated).toBe(1);
    }, 1000);

    it('a run started while the canary holds the only slot still finishes', async () => {
        // Replies by hand, so the canary's first task holds the only slot while the run starts.
        const pool = makePool({ size: 1, createWorker: factory(null) });
        const canary = pool.checkCanary();
        for (let i = 0; i < 10 && allPosts() === 0; i++) {
            await tick();
        }
        expect(allPosts()).toBe(1);
        const run = collect(pool.hashFiles(['a.jpg']));
        let settled = false;
        Promise.all([canary, run]).then(() => (settled = true));
        // Answer whatever is open (canary tasks with pixels, the run's task plainly) until both end.
        for (let guard = 0; guard < 50 && !settled; guard++) {
            for (const w of workers) {
                for (const p of w.posts) {
                    if (!w.answered.has(p.message.id) && !w.terminated) {
                        const pixels = p.message.wantPixels ? { pixels: new ArrayBuffer(PIXEL_BYTES) } : {};
                        w.reply(p.message.id, { ok: true, hash: H('1'), info: {}, ...pixels });
                    }
                }
            }
            await tick();
        }
        expect((await canary).ok).toBe(true);
        expect(await run).toEqual([expect.objectContaining({ path: 'a.jpg', route: 'worker' })]);
    }, 1000);

    it('a canary started while a run holds the only slot waits for it, then passes', async () => {
        const pool = makePool({ size: 1, createWorker: factory(null) });
        const run = collect(pool.hashFiles(['a.jpg']));
        await tick();
        const canary = pool.checkCanary();
        for (let i = 0; i < 5; i++) {
            await tick();
        }
        expect(allPosts()).toBe(1); // the canary is waiting, not failing
        let settled = false;
        Promise.all([canary, run]).then(() => (settled = true));
        for (let guard = 0; guard < 50 && !settled; guard++) {
            for (const w of workers) {
                for (const p of w.posts) {
                    if (!w.answered.has(p.message.id) && !w.terminated) {
                        const pixels = p.message.wantPixels ? { pixels: new ArrayBuffer(PIXEL_BYTES) } : {};
                        w.reply(p.message.id, { ok: true, hash: H('1'), info: {}, ...pixels });
                    }
                }
            }
            await tick();
        }
        expect(await canary).toEqual({
            ok: true,
            detail: 'canary-jpeg: 0 bytes differ, 0 bits; canary-png: 0 bytes differ, 0 bits',
        });
        expect(await run).toEqual([expect.objectContaining({ path: 'a.jpg', route: 'worker' })]);
    }, 1000);

    it("one run's abort does not strand another run's file", async () => {
        const pool = makePool({ size: 2, createWorker: factory(null) });
        const controller = new AbortController();
        const a = pool.hashFiles(['a.jpg'], { signal: controller.signal });
        const aNext = a.next();
        await tick();
        const b = collect(pool.hashFiles(['b.jpg']));
        await tick();
        expect(allPosts()).toBe(2);
        controller.abort();
        expect(await aNext).toEqual({ done: true, value: undefined });
        await tick();
        // b.jpg was re-posted to a fresh worker; answer it.
        const w = workers.find((x) => !x.terminated && x.unanswered > 0);
        okReply(w, w.posts.find((p) => !w.answered.has(p.message.id)).message);
        expect(await b).toEqual([expect.objectContaining({ path: 'b.jpg', route: 'worker' })]);
    }, 1000);

    it('terminate() is idempotent and kills every worker', async () => {
        const pool = makePool({ createWorker: factory((w) => w.hang()) });
        const gen = pool.hashFiles(['a.jpg', 'b.jpg']);
        const next = gen.next();
        await tick();
        pool.terminate();
        pool.terminate();
        expect(await next).toEqual({ done: true, value: undefined });
        expect(workers.every((w) => w.terminated === 1)).toBe(true);
    }, 1000);
});

describe('HashPool canary', () => {
    const pixelResponder = (mutate) => (w, m) => {
        const pixels = new ArrayBuffer(PIXEL_BYTES);
        mutate?.(new Uint8Array(pixels), m);
        w.reply(m.id, { ok: true, hash: H('1'), info: { type: 'jpeg', format: 'I420', icc: true }, pixels });
    };

    it('the canary passes when hashes and pixels match', async () => {
        const created = [];
        const revoked = [];
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
            created.push('blob:' + created.length);
            return created.at(-1);
        });
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => revoked.push(u));
        const pool = makePool({ createWorker: factory(pixelResponder()) });
        const result = await pool.checkCanary();
        expect(result).toEqual({
            ok: true,
            detail: 'canary-jpeg: 0 bytes differ, 0 bits; canary-png: 0 bytes differ, 0 bits',
        });
        expect(pool.mainOnly).toBe(false);
        expect(pool.hashMainUrlPixels.mock.calls.map((c) => c[0])).toEqual(created);
        expect(revoked).toEqual(created);
        const posts = workers.flatMap((w) => w.posts);
        expect(posts).toHaveLength(2);
        for (const p of posts) {
            expect(p.message).toEqual({
                type: 'hash',
                id: expect.any(Number),
                bytes: expect.any(ArrayBuffer),
                wantPixels: true,
            });
        }
        expect(new Uint8Array(posts[0].message.bytes)).toEqual(new Uint8Array([0xff, 0xd8, 1]));
    }, 1000);

    it('the canary fails on a one-byte pixel difference even with equal hashes', async () => {
        const responder = pixelResponder((px, m) => {
            if (new Uint8Array(m.bytes)[0] === 0xff) {
                px[12345] = 1;
            }
        });
        const pool = makePool({ createWorker: factory(responder) });
        const result = await pool.checkCanary();
        expect(result).toEqual({
            ok: false,
            detail: 'canary-jpeg: 1 bytes differ, 0 bits; canary-png: 0 bytes differ, 0 bits',
        });
        expect(pool.mainOnly).toBe(true);
    }, 1000);

    it('the canary counts differing hash bits', async () => {
        const hashMainUrlPixels = vi.fn(async () => ({
            hash: '0011' + H('1').slice(4),
            pixels: new Uint8ClampedArray(PIXEL_BYTES),
        }));
        const pool = makePool({ createWorker: factory(pixelResponder()), hashMainUrlPixels });
        const result = await pool.checkCanary();
        expect(result.ok).toBe(false);
        expect(result.detail).toBe('canary-jpeg: 0 bytes differ, 2 bits; canary-png: 0 bytes differ, 2 bits');
    }, 1000);

    it('fails when a worker errors or times out', async () => {
        const crashing = makePool({ createWorker: factory((w) => w.crash()) });
        const r1 = await crashing.checkCanary();
        expect(r1.ok).toBe(false);
        expect(r1.detail).toMatch(/^canary-jpeg: worker error: .+; canary-png: worker error: .+$/);
        expect(crashing.mainOnly).toBe(true);

        workers = [];
        const failing = makePool({ createWorker: factory((w, m) => w.reply(m.id, { ok: false, error: 'nope' })) });
        expect((await failing.checkCanary()).detail).toBe(
            'canary-jpeg: worker error: nope; canary-png: worker error: nope'
        );

        workers = [];
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const hanging = makePool({ createWorker: factory((w) => w.hang()), canaryTimeoutMs: 5000 });
        const pending = hanging.checkCanary();
        await vi.advanceTimersByTimeAsync(10_000);
        const r3 = await pending;
        expect(r3.ok).toBe(false);
        expect(r3.detail).toMatch(/^canary-jpeg: worker error: .*timed out.*; canary-png: worker error: .*timed out/);
        expect(hanging.mainOnly).toBe(true);
        expect(workers.every((w) => w.terminated === 1)).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    }, 2000);

    it('a canary whose main route returns no pixels fails safe', async () => {
        // F2: checkCanary() never rejects; any throw inside it is a failed canary.
        const hashMainUrlPixels = vi.fn(async () => ({ hash: H('1') }));
        const pool = makePool({ createWorker: factory(pixelResponder()), hashMainUrlPixels });
        const result = await pool.checkCanary();
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/^canary-jpeg: .+; canary-png: .+$/);
        expect(pool.mainOnly).toBe(true);

        // A throw outside the per-image compare (here, the blob URL itself) fails safe too.
        workers = [];
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
            throw new Error('no blob URLs');
        });
        const pool2 = makePool({ createWorker: factory(pixelResponder()) });
        const r2 = await pool2.checkCanary();
        expect(r2.ok).toBe(false);
        expect(r2.detail).toContain('no blob URLs');
        expect(pool2.mainOnly).toBe(true);
    }, 1000);

    it("revokes the blob URL when today's route rejects", async () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL');
        const hashMainUrlPixels = vi.fn(async () => {
            throw new Error('Image load error: x');
        });
        const pool = makePool({ createWorker: factory(pixelResponder()), hashMainUrlPixels });
        const result = await pool.checkCanary();
        expect(result.ok).toBe(false);
        expect(revoke).toHaveBeenCalledTimes(2);
        expect(pool.mainOnly).toBe(true);
    }, 1000);

    it('runs once per pool', async () => {
        const pool = makePool({ createWorker: factory(pixelResponder()) });
        const a = pool.checkCanary();
        const b = pool.checkCanary();
        expect(a).toBe(b);
        await a;
        await pool.checkCanary();
        expect(pool.makeCanaryImages).toHaveBeenCalledTimes(1);
        expect(pool.hashMainUrlPixels).toHaveBeenCalledTimes(2);
    }, 1000);

    it("after a failed canary, 'auto' sends every image to today's route", async () => {
        const pool = makePool({ createWorker: factory(pixelResponder((px) => (px[0] = 1))) });
        expect((await pool.checkCanary()).ok).toBe(false);
        const canaryPosts = allPosts();
        const results = await collect(pool.hashFiles(['a.jpg', 'b.png', 'c.jxl']));
        expect(results.map((r) => r.route)).toEqual(['main', 'main', 'main']);
        expect(allPosts()).toBe(canaryPosts);
        expect(pool.getJxlPngBytes).not.toHaveBeenCalled();
    }, 1000);
});
