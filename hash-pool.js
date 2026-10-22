// hash-pool.js
// A per-run pool of hash workers (G2 PR 2, spec § 5.2, E9, § 17 B1). Images go to module workers (hash-worker.js),
// at most `size` at a time; videos, and anything a worker could not hash, go to today's main-thread route, one call
// at a time in its own lane. A crashed or timed-out worker is terminated and its file re-queued once. Abort, or the
// consumer stopping, ends the run at once and terminates every worker. A pixel-exact canary decides whether the
// workers may be trusted at all. Everything DOM-side is injected, so this module never touches a document.

export const POOL_SIZE = 3;
export const WORKER_TASK_TIMEOUT_MS = 30_000;
export const CANARY_TIMEOUT_MS = 5_000;

const ROUTES = new Set(['auto', 'worker', 'main']);

// Today's video test (main-thread-hash.js's hashFile uses the same one).
export function isVideoPath(path) {
    return /\.(mp4|webm|mov)$/i.test(path);
}

const errorText = (err) => String(err && err.message ? err.message : err);

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
        // Set by a failed canary or a worker that could not be created: 'auto' then sends every file to today's route.
        this.mainOnly = false;
        this._slots = Array.from({ length: this.size }, () => ({ worker: null, busy: false, task: null }));
        this._runs = new Set();
        this._nextId = 0;
        this._canary = null;
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
     * route 'auto': workers with today's route as the fallback; 'worker' (parity): workers only; 'main': today's
     * route only. Stopping (signal abort, the consumer's return()) ends the iteration at once and terminates
     * every worker; nothing more is yielded.
     * @returns {AsyncGenerator<{ path: string, hash: string|null, route: 'worker'|'main'|'none', info?: object, error?: string }>}
     */
    async *hashFiles(paths, { signal = null, route = 'auto' } = {}) {
        if (!ROUTES.has(route)) {
            throw new Error(`Unknown hash route: ${route}`);
        }
        if (this._terminated || (signal && signal.aborted)) {
            return;
        }
        const run = {
            route,
            stopped: false,
            finished: false,
            queue: new TaskQueue(), // worker-bound files
            mainQueue: new TaskQueue(), // today's-route files
            workerInFlight: 0,
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
                run.queue.push({ path, retried: false });
            }
        }
        const onAbort = () => this._stopRun(run);
        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }
        this._runs.add(run);
        try {
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
            this._runs.delete(run);
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
            while (run.queue.length > 0) {
                run.mainQueue.push(run.queue.shift());
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
                bytes = await this.getJxlPngBytes(path);
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
        }
        if (run.stopped) {
            return;
        }
        if (outcome.kind === 'stopped') {
            // Another run's stop killed this slot: not this file's fault, so its retry is not spent.
            run.queue.unshift(item);
        } else if (outcome.kind === 'ok') {
            const { hash, info } = outcome.reply;
            run.results.push({ path: item.path, hash, route: 'worker', info });
        } else if ((outcome.kind === 'crash' || outcome.kind === 'timeout') && !item.retried) {
            item.retried = true;
            run.queue.unshift(item);
        } else if (run.route === 'auto') {
            run.mainQueue.push({ path: item.path });
        } else {
            run.results.push({ path: item.path, hash: null, route: 'none', error: outcome.error });
        }
        this._pump(run);
        this._notify(run);
    }

    // Today's route, one call at a time. A stopped run never awaits it; the handlers below catch and drop a late
    // settlement, so a late rejection is never unhandled.
    _runMainTask(run, item) {
        run.mainInFlight = true;
        const settle = (result) => {
            run.mainInFlight = false;
            if (run.stopped) {
                return;
            }
            run.results.push(result);
            this._pump(run);
            this._notify(run);
        };
        Promise.resolve()
            .then(() => this.hashOnMainThread(item.path))
            .then(
                (hash) => settle({ path: item.path, hash, route: 'main' }),
                (err) => settle({ path: item.path, hash: null, route: 'none', error: errorText(err) })
            );
    }

    // --- canary (B1) -------------------------------------------------------------------------------------------

    /**
     * Hashes the canary images through both routes and compares hashes AND pixels: a raster-path change can leave
     * the hashes equal (spec § 17 B1). Runs once per pool; a failure sets mainOnly.
     * @returns {Promise<{ ok: boolean, detail: string }>}
     */
    checkCanary() {
        if (!this._canary) {
            this._canary = this._runCanary();
        }
        return this._canary;
    }

    async _runCanary() {
        let ok = true;
        const parts = [];
        let images;
        try {
            images = await this.makeCanaryImages();
        } catch (err) {
            this.mainOnly = true;
            return { ok: false, detail: 'canary images: ' + errorText(err) };
        }
        for (const { name, blob } of images) {
            const part = await this._canaryImage(blob);
            ok = ok && part.ok;
            parts.push(`${name}: ${part.detail}`);
        }
        if (!ok) {
            this.mainOnly = true;
        }
        return { ok, detail: parts.join('; ') };
    }

    async _canaryImage(blob) {
        let main;
        const url = URL.createObjectURL(blob);
        try {
            main = await this.hashMainUrlPixels(url);
        } catch (err) {
            return { ok: false, detail: 'main error: ' + errorText(err) };
        } finally {
            URL.revokeObjectURL(url);
        }
        const slot = this._terminated ? null : this._freeSlot();
        if (!slot) {
            return { ok: false, detail: 'worker error: no free worker' };
        }
        slot.busy = true;
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
        } finally {
            slot.busy = false;
        }
        if (!reply.ok) {
            return { ok: false, detail: 'worker error: ' + String(reply.error) };
        }
        const a = new Uint8Array(reply.pixels || new ArrayBuffer(0));
        const b = main.pixels;
        let bytesDiffer = Math.abs(a.length - b.length);
        for (let i = 0, n = Math.min(a.length, b.length); i < n; i++) {
            if (a[i] !== b[i]) {
                bytesDiffer++;
            }
        }
        const h1 = String(reply.hash);
        const h2 = String(main.hash);
        let bits = Math.abs(h1.length - h2.length);
        for (let i = 0, n = Math.min(h1.length, h2.length); i < n; i++) {
            if (h1[i] !== h2[i]) {
                bits++;
            }
        }
        const sizeOk = a.length === b.length && a.length === 256 * 256 * 4;
        return {
            ok: sizeOk && bytesDiffer === 0 && bits === 0,
            detail: `${bytesDiffer} bytes differ, ${bits} bits`,
        };
    }

    // --- lifetime ----------------------------------------------------------------------------------------------

    // Ends the pool's life: stops every run and terminates every worker. Idempotent; a later hashFiles yields nothing.
    terminate() {
        if (this._terminated) {
            return;
        }
        this._terminated = true;
        for (const run of [...this._runs]) {
            this._stopRun(run);
        }
        for (const slot of this._slots) {
            this._failSlot(slot, 'stopped', 'Stopped');
        }
    }
}
