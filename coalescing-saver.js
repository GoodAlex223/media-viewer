// One write per folder at a time, newest payload wins (G3 member 2). Two overlapping IPC writes can reach main's
// per-target chain in the wrong order, because the IPC guard's check runs before that chain: older ratings then win
// on disk. Folders do not share a queue: their writes cannot invert, and a hung drive must not hold another's back.
// Spec: docs/superpowers/specs/2026-11-02-g3-rating-data-safety-design.md § 3.2

export class CoalescingSaver {
    /** @param {(folder: string, payload: any) => Promise<any>} write */
    constructor(write) {
        this._write = write;
        this._folders = new Map(); // folder → { running: Promise, queued: { payload, settle: [] } | null }
    }

    /**
     * Writes `payload` for `folder`, now or after the running write, unless a newer request replaces it first.
     * Settles once this payload or a newer one of that folder has been written. Never rejects.
     */
    request(folder, payload) {
        return new Promise((resolve) => {
            const state = this._folders.get(folder);
            if (!state) {
                const fresh = { running: null, queued: null };
                this._folders.set(folder, fresh);
                this._start(folder, fresh, payload, [resolve]);
            } else if (state.queued) {
                state.queued.payload = payload;
                state.queued.settle.push(resolve);
            } else {
                state.queued = { payload, settle: [resolve] };
            }
        });
    }

    /** Settles once nothing is queued or running: for one folder, or for all of them. Never rejects. */
    async whenIdle(folder = null) {
        for (;;) {
            const running =
                folder === null
                    ? [...this._folders.values()].map((state) => state.running)
                    : [this._folders.get(folder)?.running].filter(Boolean);
            if (running.length === 0) {
                return;
            }
            await Promise.all(running);
        }
    }

    // The write starts synchronously, so a request made straight after this one queues behind it. The next write
    // starts before `running` settles, which is what lets whenIdle see it.
    _start(folder, state, payload, settle) {
        state.running = (async () => {
            try {
                await this._write(folder, payload);
            } catch (err) {
                console.warn('CoalescingSaver: write failed:', err);
            }
            settle.forEach((resolve) => resolve());
            const next = state.queued;
            if (next) {
                state.queued = null;
                this._start(folder, state, next.payload, next.settle);
            } else {
                this._folders.delete(folder);
            }
        })();
    }
}
