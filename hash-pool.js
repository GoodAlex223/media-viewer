// hash-pool.js
// A per-run pool of hash workers (G2 PR 2, spec § 5.2, E9, § 17 B1). Images go to module workers (hash-worker.js),
// at most `size` at a time; videos, and anything a worker could not hash, go to the main-thread route, one call
// at a time in its own lane. A crashed or timed-out worker is terminated and its file re-queued once. Abort, or the
// consumer stopping, ends the run at once and terminates every worker. A pixel-exact canary decides whether the
// workers may be trusted at all. Everything DOM-side is injected, so this module never touches a document.
import { HASH_CANVAS_SIZE, countDifferences } from './perceptual-hash.js';

export const POOL_SIZE = 3;
export const WORKER_TASK_TIMEOUT_MS = 30_000;
export const CANARY_TIMEOUT_MS = 5_000;
export const HASH_PROGRESS_EVERY = 5;
export const MAX_HASH_LOG_LINES = 20;

const ROUTES = new Set(['auto', 'worker', 'main']);
const CANARY_PIXEL_BYTES = HASH_CANVAS_SIZE * HASH_CANVAS_SIZE * 4;

// Today's video test, the one both routes use (main-thread-hash.js's hashFile imports it).
export function isVideoPath(path) {
    return /\.(mp4|webm|mov)$/i.test(path);
}

const errorText = (err) => String(err && err.message ? err.message : err);
const CANARY_TIMED_OUT = Symbol('canary timed out');
// A result after a failed worker attempt says so, whichever route then answered (PR #87 review #7).
const withWorkerErrors = (result, errors) =>
    errors && errors.length > 0 ? { ...result, workerErrors: errors } : result;

export const ABORTED = Symbol('aborted');

// `promise`'s outcome, or ABORTED as soon as `signal` aborts, whichever comes first. The promise itself runs on.
export function untilAborted(promise, signal) {
    if (!signal) {
        return promise;
    }
    if (signal.aborted) {
        return Promise.resolve(ABORTED);
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => resolve(ABORTED);
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (err) => {
                signal.removeEventListener('abort', onAbort);
                reject(err);
            }
        );
    });
}

/**
 * A fresh tally for hashThroughPool, which adds into it: the pool's size, the hashes from a worker and from the
 * main-thread route (fallback), the failures, whether a canary failed, and the milliseconds spent. One tally serves a
 * run's hash phase and its placement, so the run's perf line counts both.
 */
export function newHashStats() {
    return { poolSize: 0, worker: 0, fallback: 0, failed: 0, canaryFailed: false, ms: 0 };
}

/**
 * How a similarity sort hashes through a pool (PR #87 review #11): a run's hash phase and a placement's new files
 * alike. The parity check is the one other caller, and drives its pool itself (hash-parity.js), since it hashes each
 * image on both routes. A fresh pool from `createPool()`; its canary, reported once through `onCanaryFailure(detail)`,
 * raced with `signal` and skipped when every file is a video; each result stored with `store(path, hash)` only after
 * `assertLive()`, with no await between the two; the pool terminated in a finally. `onResult(r)` runs after each store (a run counts and saves there; it may
 * await); `onProgress(done)` every HASH_PROGRESS_EVERY results and at the end. `stats` (newHashStats()) is the caller's,
 * so a run's two callers add into one. Each worker fallback and failure goes to `log(message)` with its file and reason,
 * at most MAX_HASH_LOG_LINES per call, then one line counting the rest (#7).
 */
export async function hashThroughPool(
    paths,
    {
        createPool,
        store,
        assertLive,
        signal = null,
        onResult = null,
        onProgress = null,
        onCanaryFailure = () => {},
        log = () => {},
        stats = null,
    }
) {
    if (paths.length === 0) {
        return;
    }
    const s = stats ?? newHashStats();
    const start = performance.now();
    const pool = createPool();
    s.poolSize = pool.size;
    let logged = 0;
    const logLine = (message) => {
        if (logged++ < MAX_HASH_LOG_LINES) {
            log(message);
        }
    };
    let done = 0;
    try {
        if (paths.some((p) => !isVideoPath(p))) {
            // The 'auto' run awaits the same, memoized check before its first post: awaited here to report it, and
            // raced with the signal, so a Cancel during the canary ends the call at once (round 2 #3).
            const canary = await untilAborted(pool.checkCanary(), signal);
            assertLive();
            if (canary !== ABORTED && !canary.ok) {
                s.canaryFailed = true;
                onCanaryFailure(canary.detail);
            }
        }
        for await (const r of pool.hashFiles(paths, { signal })) {
            assertLive();
            done++;
            if (r.hash === null) {
                s.failed++;
                console.error(`Failed to compute hash for ${r.path}:`, r.error);
            } else {
                store(r.path, r.hash);
                if (r.route === 'worker') {
                    s.worker++;
                } else {
                    s.fallback++;
                }
            }
            if (r.workerErrors) {
                const outcome = r.hash === null ? `failed: ${r.error}` : `hashed on the ${r.route} route`;
                logLine(`Hash worker: ${r.path}: ${r.workerErrors.join('; ')} -> ${outcome}`);
            } else if (r.hash === null) {
                logLine(`Hash failed: ${r.path}: ${r.error}`);
            }
            // The result's own bookkeeping first, so the progress line counts it; then any save it started, awaited
            // even when the progress call throws, so its rejection is never left unhandled.
            const pending = onResult?.(r);
            try {
                if (done % HASH_PROGRESS_EVERY === 0 || done === paths.length) {
                    onProgress?.(done);
                }
            } finally {
                await pending;
            }
        }
        // An abort ends the pool's iteration without a throw: the caller says so here.
        assertLive();
    } finally {
        pool.terminate();
        if (logged > MAX_HASH_LOG_LINES) {
            log(`Hash pool: ${logged - MAX_HASH_LOG_LINES} more fallback or failure lines not logged`);
        }
        s.ms += performance.now() - start;
    }
}

// A FIFO with a front lane for re-queued files; shift() is O(1), so a 15k-file run never re-copies the array.
class TaskQueue {
    constructor() {
        this.items = [];
        this.head = 0;
        this.front = [];
    }
    get length() {
        return this.front.length + this.items.length - this.head;
    }
    push(item) {
        this.items.push(item);
    }
    unshift(item) {
        this.front.push(item);
    }
    shift() {
        if (this.front.length > 0) {
            return this.front.pop();
        }
        const item = this.items[this.head];
        this.items[this.head++] = undefined;
        return item;
    }
}

export class HashPool {
    constructor({
        size = POOL_SIZE,
        createWorker,
        hashOnMainThread,
        hashMainUrlPixels,
        makeCanaryImages,
        getJxlPngBytes,
        isJxl,
        toMediaUrl,
        taskTimeoutMs = WORKER_TASK_TIMEOUT_MS,
        canaryTimeoutMs = CANARY_TIMEOUT_MS,
    }) {
        this.size = Math.max(1, Math.floor(size) || 1);
        this.createWorker = createWorker;
        this.hashOnMainThread = hashOnMainThread;
        this.hashMainUrlPixels = hashMainUrlPixels;
        this.makeCanaryImages = makeCanaryImages;
        this.getJxlPngBytes = getJxlPngBytes;
        this.isJxl = isJxl;
        this.toMediaUrl = toMediaUrl;
        this.taskTimeoutMs = taskTimeoutMs;
        this.canaryTimeoutMs = canaryTimeoutMs;
        // Set by a failed canary or a worker that could not be created: 'auto' then sends every file to the main-thread
        // route.
        this.mainOnly = false;
        this._slots = Array.from({ length: this.size }, () => ({ worker: null, busy: false, task: null }));
        this._run = null; // the one live run (PR #87 review #12: every caller makes a pool per run)
        this._nextId = 0;
        this._canary = null;
        this._settleCanary = null;
        this._terminated = false;
    }

    // --- slots -------------------------------------------------------------------------------------------------

    // The slot's worker, created on first use and kept for the pool's life. null = createWorker() threw (mainOnly).
    _ensureWorker(slot) {
        if (slot.worker) {
            return { worker: slot.worker };
        }
        let worker;
        try {
            worker = this.createWorker();
        } catch (err) {
            this.mainOnly = true;
            return { worker: null, error: 'Worker could not be created: ' + errorText(err) };
        }
        const onMessage = (e) => {
            const data = e && e.data;
            if (slot.worker !== worker || !slot.task || !data || data.type !== 'result' || data.id !== slot.task.id) {
                return;
            }
            const task = slot.task;
            slot.task = null;
            clearTimeout(task.timer);
            task.resolve(data);
        };
        // Any error event is this slot's crash: a malformed message can throw uncaught in the worker, with no id.
        // preventDefault keeps it out of the page's onerror; its message reaches the log on the file's result, as one
        // of its workerErrors.
        const onError = (e) => {
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            if (slot.worker === worker) {
                this._failSlot(slot, 'crash', 'Worker crashed' + (e && e.message ? ': ' + e.message : ''));
            }
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onError);
        slot.worker = worker;
        return { worker };
    }

    // Terminates the slot's worker (the next task respawns it) and rejects its task with `kind`.
    _failSlot(slot, kind, message) {
        const task = slot.task;
        slot.task = null;
        if (slot.worker) {
            const worker = slot.worker;
            slot.worker = null;
            worker.terminate();
        }
        if (task) {
            clearTimeout(task.timer);
            task.reject(Object.assign(new Error(message), { kind }));
        }
    }

    // Posts one task to the slot's worker. Never a transfer list: the bytes may be jxlFrameCache's, which the
    // renderer keeps (a transfer would detach the display cache's buffer).
    _post(slot, message, timeoutMs) {
        return new Promise((resolve, reject) => {
            const id = ++this._nextId;
            const timer = setTimeout(() => this._failSlot(slot, 'timeout', 'Worker timed out'), timeoutMs);
            slot.task = { id, resolve, reject, timer };
            try {
                slot.worker.postMessage({ ...message, id });
            } catch (err) {
                slot.task = null;
                clearTimeout(timer);
                reject(Object.assign(new Error(errorText(err)), { kind: 'fail' }));
            }
        });
    }

    _freeSlot() {
        return this._slots.find((s) => !s.busy) || null;
    }

    // --- runs --------------------------------------------------------------------------------------------------

    /**
     * Hashes `paths`, yielding each result as it completes (completion order, buffered while the consumer is busy).
     * One run at a time: a call while another run is live throws. route 'auto': workers with the main-thread route as
     * the fallback, behind the canary, which the run awaits before its first worker post (a caller's own earlier
     * checkCanary() is the same, memoized check); 'worker' (parity): workers only; 'main': the main-thread route only.
     * Stopping (signal abort, the consumer's return()) ends the iteration at once and terminates every worker; nothing
     * more is yielded. A result that follows a failed worker attempt carries `workerErrors`, one `kind: message` per
     * attempt.
     * @returns {AsyncGenerator<{ path: string, hash: string|null, route: 'worker'|'main'|'none', info?: object,
     *     error?: string, workerErrors?: string[] }>}
     */
    async *hashFiles(paths, { signal = null, route = 'auto' } = {}) {
        if (!ROUTES.has(route)) {
            throw new Error(`Unknown hash route: ${route}`);
        }
        if (this._run) {
            throw new Error('HashPool runs one hashFiles at a time');
        }
        if (this._terminated || (signal && signal.aborted)) {
            return;
        }
        const run = {
            route,
            stopped: false,
            finished: false,
            queue: new TaskQueue(), // worker-bound files
            jxlQueue: new TaskQueue(), // worker-bound JXLs: one in flight at a time (_pump)
            mainQueue: new TaskQueue(), // main-thread-route files
            workerInFlight: 0,
            jxlInFlight: false,
            mainInFlight: false,
            results: [],
            wake: null,
        };
        for (const path of paths) {
            if (route === 'main' || (route === 'auto' && isVideoPath(path))) {
                run.mainQueue.push({ path });
            } else if (isVideoPath(path)) {
                run.results.push({ path, hash: null, route: 'none', error: 'video' });
            } else {
                (this.isJxl(path) ? run.jxlQueue : run.queue).push({ path, retried: false });
            }
        }
        const onAbort = () => this._stopRun(run);
        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }
        this._run = run;
        try {
            if (route === 'auto' && run.queue.length + run.jxlQueue.length > 0) {
                // The canary is the run's own first step (PR #87 review #12), so no caller can send a file to a worker
                // it has not checked; a run of videos only needs none. A stop meanwhile is seen once the canary settles
                // (it is bounded): a caller that must answer a Cancel at once races its own wait for it, as
                // hashThroughPool does.
                await this.checkCanary();
            }
            this._pump(run);
            for (;;) {
                if (run.stopped) {
                    return;
                }
                if (run.results.length > 0) {
                    yield run.results.shift();
                    continue;
                }
                if (
                    run.queue.length === 0 &&
                    run.jxlQueue.length === 0 &&
                    run.mainQueue.length === 0 &&
                    run.workerInFlight === 0 &&
                    !run.mainInFlight
                ) {
                    run.finished = true;
                    return;
                }
                await new Promise((resolve) => {
                    run.wake = resolve;
                });
            }
        } finally {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            this._run = null;
            if (!run.finished) {
                this._stopRun(run);
            }
        }
    }

    _notify(run) {
        if (run.wake) {
            const wake = run.wake;
            run.wake = null;
            wake();
        }
    }

    // Stop means stop: no more dispatch, every worker terminated, the waiting consumer woken to end.
    _stopRun(run) {
        if (run.stopped) {
            return;
        }
        run.stopped = true;
        for (const slot of this._slots) {
            this._failSlot(slot, 'stopped', 'Stopped');
        }
        this._notify(run);
    }

    // Starts as much work as the slots and the main lane allow. Called at start and after every completion, so
    // dispatch continues while the consumer awaits something else.
    _pump(run) {
        if (run.stopped) {
            return;
        }
        if (run.route === 'auto' && this.mainOnly) {
            for (const queue of [run.jxlQueue, run.queue]) {
                while (queue.length > 0) {
                    run.mainQueue.push(queue.shift());
                }
            }
        }
        // One JXL on the workers at a time (PR #87 review #1). Its bytes come from the app's one JXL decoder, which
        // decodes one file at a time: a second JXL would only hold a slot while it waits.
        if (!run.jxlInFlight && run.jxlQueue.length > 0) {
            const slot = this._freeSlot();
            if (slot) {
                run.jxlInFlight = true;
                this._runWorkerTask(run, run.jxlQueue.shift(), slot);
            }
        }
        while (run.queue.length > 0) {
            const slot = this._freeSlot();
            if (!slot) {
                break;
            }
            this._runWorkerTask(run, run.queue.shift(), slot);
        }
        if (!run.mainInFlight && run.mainQueue.length > 0) {
            this._runMainTask(run, run.mainQueue.shift());
        }
    }

    // One worker attempt -> { kind: 'ok', reply } | { kind: 'fail'|'crash'|'timeout'|'stopped', error }.
    async _attemptOnWorker(run, path, slot) {
        let message;
        if (this.isJxl(path)) {
            let bytes;
            try {
                // The stop check lets a decode still queued behind another one skip its turn once the run stops.
                bytes = await this.getJxlPngBytes(path, () => run.stopped);
            } catch (err) {
                return { kind: 'fail', error: 'JXL decode failed: ' + errorText(err) };
            }
            if (run.stopped) {
                return { kind: 'stopped' };
            }
            message = { type: 'hash', bytes };
        } else {
            message = { type: 'hash', url: this.toMediaUrl(path) };
        }
        const { worker, error } = this._ensureWorker(slot);
        if (!worker) {
            return { kind: 'fail', error };
        }
        try {
            const reply = await this._post(slot, message, this.taskTimeoutMs);
            return reply.ok ? { kind: 'ok', reply } : { kind: 'fail', error: String(reply.error) };
        } catch (err) {
            return { kind: err.kind || 'crash', error: errorText(err) };
        }
    }

    async _runWorkerTask(run, item, slot) {
        const jxl = this.isJxl(item.path);
        slot.busy = true;
        run.workerInFlight++;
        let outcome;
        try {
            outcome = await this._attemptOnWorker(run, item.path, slot);
        } catch (err) {
            outcome = { kind: 'fail', error: errorText(err) };
        } finally {
            slot.busy = false;
            run.workerInFlight--;
            if (jxl) {
                run.jxlInFlight = false;
            }
        }
        // A 'stopped' outcome only comes from this run's own stop or the pool's terminate().
        if (run.stopped) {
            return;
        }
        if (outcome.kind === 'ok') {
            const { hash, info } = outcome.reply;
            run.results.push(withWorkerErrors({ path: item.path, hash, route: 'worker', info }, item.errors));
        } else {
            item.errors = [...(item.errors ?? []), `${outcome.kind}: ${outcome.error}`];
            if ((outcome.kind === 'crash' || outcome.kind === 'timeout') && !item.retried) {
                item.retried = true;
                (jxl ? run.jxlQueue : run.queue).unshift(item);
            } else if (run.route === 'auto') {
                run.mainQueue.push({ path: item.path, errors: item.errors });
            } else {
                run.results.push(
                    withWorkerErrors({ path: item.path, hash: null, route: 'none', error: outcome.error }, item.errors)
                );
            }
        }
        this._pump(run);
        this._notify(run);
    }

    // The main-thread route, one call at a time. A stopped run never awaits it; the handlers below catch and drop a
    // late settlement, so a late rejection is never unhandled. The stop check reaches a JXL decode still queued.
    _runMainTask(run, item) {
        run.mainInFlight = true;
        const settle = (result) => {
            run.mainInFlight = false;
            if (run.stopped) {
                return;
            }
            run.results.push(withWorkerErrors(result, item.errors));
            this._pump(run);
            this._notify(run);
        };
        Promise.resolve()
            .then(() => this.hashOnMainThread(item.path, () => run.stopped))
            .then(
                (hash) => settle({ path: item.path, hash, route: 'main' }),
                (err) => settle({ path: item.path, hash: null, route: 'none', error: errorText(err) })
            );
    }

    // --- canary (B1) -------------------------------------------------------------------------------------------

    /**
     * Hashes the canary images through both routes and compares hashes AND pixels: a raster-path change can leave
     * the hashes equal (spec § 17 B1). Runs once per pool; a failure sets mainOnly. Each step has canaryTimeoutMs, and
     * a timeout is a failure. An 'auto' run awaits it before its first worker post; a caller may await it first, to
     * report the result.
     * @returns {Promise<{ ok: boolean, detail: string }>}
     */
    checkCanary() {
        if (!this._canary) {
            // terminate() settles it too (R-F4b): the run awaiting it terminates the pool in its finally.
            this._canary = new Promise((resolve) => {
                this._settleCanary = (result) => {
                    this._settleCanary = null;
                    resolve(result);
                };
                this._runCanary().then((result) => this._settleCanary?.(result));
            });
        }
        return this._canary;
    }

    // Never rejects: any throw, per image or overall, is a failed canary (the spec's "any failure falls back").
    async _runCanary() {
        try {
            return await this._compareCanaryImages();
        } catch (err) {
            this.mainOnly = true;
            return { ok: false, detail: 'canary error: ' + errorText(err) };
        }
    }

    async _compareCanaryImages() {
        let ok = true;
        const parts = [];
        let images;
        try {
            images = await this._withCanaryTimeout(this.makeCanaryImages());
        } catch (err) {
            this.mainOnly = true;
            return { ok: false, detail: 'canary images: ' + (err === CANARY_TIMED_OUT ? 'timed out' : errorText(err)) };
        }
        // One slot for the whole canary, so a run's dispatch cannot take it between images.
        const slot = this._takeSlot();
        let failed = true; // until every image has compared equal
        try {
            for (const { name, blob } of images) {
                let part;
                try {
                    part = await this._canaryImage(blob, slot);
                } catch (err) {
                    part = { ok: false, detail: 'error: ' + errorText(err) };
                }
                ok = ok && part.ok;
                parts.push(`${name}: ${part.detail}`);
                if (part.hung) {
                    break; // a main route that never answered would not answer the next image either
                }
            }
            failed = !ok;
        } finally {
            // mainOnly before the slot is released (R-F4c): a run's dispatch must not take it to a worker.
            if (failed) {
                this.mainOnly = true;
            }
            if (slot) {
                slot.busy = false;
                if (this._run) {
                    this._pump(this._run); // a 'worker' or 'main' run started meanwhile may want the slot
                }
            }
        }
        return { ok, detail: parts.join('; ') };
    }

    // `promise`, or a CANARY_TIMED_OUT rejection after canaryTimeoutMs (R-F4a): an <img> whose load and error never
    // fire would otherwise hold the run that awaits the canary. The timer is cleared either way.
    _withCanaryTimeout(promise) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(CANARY_TIMED_OUT), this.canaryTimeoutMs);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    // A free slot, marked busy, or null: the pool is terminated, or a 'worker' or 'main' run holds every slot (an
    // 'auto' run checks the canary before its first post, so it never does).
    _takeSlot() {
        if (this._terminated) {
            return null;
        }
        const slot = this._freeSlot();
        if (slot) {
            slot.busy = true;
        }
        return slot;
    }

    async _canaryImage(blob, slot) {
        let main;
        let url = null;
        try {
            url = URL.createObjectURL(blob);
            main = await this._withCanaryTimeout(this.hashMainUrlPixels(url));
        } catch (err) {
            if (err === CANARY_TIMED_OUT) {
                return { ok: false, hung: true, detail: 'main route timed out' };
            }
            return { ok: false, detail: 'main error: ' + errorText(err) };
        } finally {
            if (url !== null) {
                URL.revokeObjectURL(url);
            }
        }
        if (!main || !main.pixels || typeof main.pixels.length !== 'number') {
            return { ok: false, detail: 'main error: no pixels' };
        }
        if (!slot || this._terminated) {
            return { ok: false, detail: 'worker error: ' + (this._terminated ? 'pool terminated' : 'no free slot') };
        }
        let reply;
        try {
            const { worker, error } = this._ensureWorker(slot);
            if (!worker) {
                return { ok: false, detail: 'worker error: ' + error };
            }
            const bytes = await blob.arrayBuffer();
            reply = await this._post(slot, { type: 'hash', bytes, wantPixels: true }, this.canaryTimeoutMs);
        } catch (err) {
            return { ok: false, detail: 'worker error: ' + errorText(err) };
        }
        if (!reply.ok) {
            return { ok: false, detail: 'worker error: ' + String(reply.error) };
        }
        const a = new Uint8Array(reply.pixels || new ArrayBuffer(0));
        const b = main.pixels;
        const bytesDiffer = countDifferences(a, b);
        const bits = countDifferences(String(reply.hash), String(main.hash));
        const sizeOk = a.length === b.length && a.length === CANARY_PIXEL_BYTES;
        return {
            ok: sizeOk && bytesDiffer === 0 && bits === 0,
            detail: `${bytesDiffer} bytes differ, ${bits} bits`,
        };
    }

    // --- the parity check's pixel measure (B15) ----------------------------------------------------------------

    /**
     * One image on both routes, with their read-backs compared byte by byte, as the canary compares its own (spec
     * § 17 B15): D4 accepts a difference only where no byte is more than 1 level off. For a file the main route
     * draws from its URL (a JPEG or a WebP); never a JXL or a video. Rejects on either route's error, its timeout or
     * a read-back of the wrong size.
     * @returns {Promise<{ workerHash: string, mainHash: string, maxPixelDiff: number, bytesDiffer: number }>}
     */
    async comparePixels(path) {
        if (this._terminated) {
            throw new Error('Pool terminated');
        }
        const url = this.toMediaUrl(path);
        // Called before the timer is armed, as the canary does: a throw here leaves no timer to reject unhandled.
        const mainPending = this.hashMainUrlPixels(url);
        let timer;
        const mainTimeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Main route timed out')), this.taskTimeoutMs);
        });
        const main = await Promise.race([mainPending, mainTimeout]).finally(() => clearTimeout(timer));
        const slot = this._takeSlot();
        if (!slot) {
            throw new Error(this._terminated ? 'Pool terminated' : 'No free slot');
        }
        let reply;
        try {
            const { worker, error } = this._ensureWorker(slot);
            if (!worker) {
                throw new Error(error);
            }
            reply = await this._post(slot, { type: 'hash', url, wantPixels: true }, this.taskTimeoutMs);
        } finally {
            slot.busy = false;
            if (this._run) {
                this._pump(this._run); // as the canary does: a run started meanwhile may want the slot
            }
        }
        if (!reply.ok) {
            throw new Error(String(reply.error));
        }
        const a = new Uint8Array(reply.pixels || new ArrayBuffer(0));
        const b = main && main.pixels ? main.pixels : [];
        if (a.length !== CANARY_PIXEL_BYTES || b.length !== CANARY_PIXEL_BYTES) {
            throw new Error(`Read-back sizes ${a.length} and ${b.length}`);
        }
        let maxPixelDiff = 0;
        for (let i = 0; i < a.length; i++) {
            maxPixelDiff = Math.max(maxPixelDiff, Math.abs(a[i] - b[i]));
        }
        return {
            workerHash: String(reply.hash),
            mainHash: String(main.hash),
            maxPixelDiff,
            bytesDiffer: countDifferences(a, b),
        };
    }

    // --- lifetime ----------------------------------------------------------------------------------------------

    // Ends the pool's life: stops the run and terminates every worker. Idempotent; a later hashFiles yields nothing.
    terminate() {
        if (this._terminated) {
            return;
        }
        this._terminated = true;
        if (this._settleCanary) {
            // A canary still pending fails (R-F4b): the run awaiting it would otherwise wait for the session.
            this.mainOnly = true;
            this._settleCanary({ ok: false, detail: 'pool terminated' });
        }
        if (this._run) {
            this._stopRun(this._run);
        }
        for (const slot of this._slots) {
            this._failSlot(slot, 'stopped', 'Stopped');
        }
    }
}
