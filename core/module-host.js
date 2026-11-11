// The module host (v2 P1a; spec §§ 6.3, 6.5 step 3, 7.1–7.3, 7.9, 7.13). It fetches main's resolved module list,
// imports each enabled module in dependency order and calls its activate(host) with a frozen host of its own. A module
// that throws, has no activate, or takes longer than 5 s (import and activate together) fails alone: its host is
// disposed, its dependents are blocked, and the app goes on. Types: core/host-api.js.
//
// Folder visits: beginVisit/endVisit bracket each folder load. A store call is checked at the call (plan C9): one made
// while its visit is live, including inside onVisitEnd, issues its IPC at once into that visit's folder; one made after
// is refused with no IPC. A failed read is never "absent" (Review Focus 1).

export const ACTIVATION_TIMEOUT_MS = 5000;

const SETTING_KEY = /^[A-Za-z0-9_.-]{1,64}$/;
const NOTIFY_LEVELS = new Set(['info', 'success', 'warning', 'error']);
const READ_STATUSES = new Set(['ok', 'absent', 'unreadable']);

const messageOf = (err) => (err && typeof err.message === 'string' ? err.message : String(err));
const folderName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() ?? String(p);
const fileEntry = (f) =>
    Object.freeze({
        name: f.name,
        path: f.path,
        size: f.size ?? null,
        mtimeMs: f.mtimeMs ?? null,
        type: f.type ?? null,
    });

export class ModuleHost {
    /**
     * @param {object} deps
     * @param {{ listModules, folderFileRead, folderFileWrite, folderFileDelete, logError, logPerf }} deps.api the bridge
     * @param {(message: string, type?: string, options?: object) => any} deps.notify showNotification
     * @param {() => Array<object>} deps.getFiles the open folder's files
     * @param {(entryPath: string) => Promise<object>} [deps.importModule]
     * @param {number} [deps.timeoutMs]
     * @param {Storage} [deps.storage]
     */
    constructor({
        api,
        notify,
        getFiles,
        importModule = (entryPath) => import(new URL(entryPath, document.baseURI).href),
        timeoutMs = ACTIVATION_TIMEOUT_MS,
        storage = globalThis.localStorage,
    }) {
        this.api = api;
        this.notify = notify;
        this.getFiles = getFiles;
        this.importModule = importModule;
        this.timeoutMs = timeoutMs;
        this.storage = storage;
        this.testApis = {}; // id → the testApi an active module returned; MediaViewer exposes it as this.modules
        this._list = null;
        this._outcomes = new Map(); // id → { state, reason }
        this._records = []; // per-module records, in activation order
        this._active = []; // { record, deactivate } for each active module, in activation order
        this._visits = new WeakSet(); // every visit this host made
        this._liveVisit = null;
        this._visitSeq = 0;
        this._started = null;
        this.ready = new Promise((resolve) => (this._resolveReady = resolve));
    }

    /** Fetches the list and activates the modules. Idempotent; never rejects; settles `ready`. */
    start() {
        if (!this._started) {
            this._started = this._run()
                .catch((err) => this._log('modules', `Starting the modules stopped: ${messageOf(err)}`))
                .finally(() => this._resolveReady());
        }
        return this._started;
    }

    async _run() {
        let list;
        try {
            list = await this.api.listModules();
        } catch (err) {
            this._log('modules', `The module list could not be read (${messageOf(err)}); starting with no modules`);
            return;
        }
        if (!list || !Array.isArray(list.modules) || !Array.isArray(list.order)) {
            this._log('modules', 'The module list was missing or malformed; starting with no modules');
            return;
        }
        this._list = list;
        const rows = new Map(list.modules.filter((m) => m && m.status !== 'invalid').map((m) => [m.id, m]));
        for (const id of list.order) {
            const row = rows.get(id);
            if (!row || row.status !== 'enabled') {
                continue;
            }
            const failedDep = (row.requires || []).find((dep) => this.outcome(dep)?.state !== 'active');
            if (failedDep !== undefined) {
                const why = this.outcome(failedDep)?.state === 'failed' ? 'failed to start' : 'is disabled';
                this._outcomes.set(id, { state: 'blocked', reason: `disabled because ${failedDep} ${why}` });
                continue;
            }
            await this._activate(row);
        }
    }

    async _activate(row) {
        const record = this._newRecord(row);
        const attempt = (async () => {
            const mod = await this.importModule(row.entryPath);
            if (!mod || typeof mod.activate !== 'function') {
                throw new Error('its entry exports no activate function');
            }
            return mod.activate(record.host);
        })();
        attempt.catch(() => {}); // settled after a timeout: nobody waits for it, and its rejection is not unhandled
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(
                () => reject(new Error(`did not finish activating within ${this.timeoutMs / 1000} s`)),
                this.timeoutMs
            );
        });
        try {
            const result = await Promise.race([attempt, timeout]);
            const exported = result && typeof result === 'object' ? result : {};
            this._outcomes.set(row.id, { state: 'active', reason: null });
            this._active.push({
                record,
                deactivate: typeof exported.deactivate === 'function' ? exported.deactivate : null,
            });
            if (exported.testApi !== undefined) {
                this.testApis[row.id] = exported.testApi;
            }
        } catch (err) {
            record.disposed = true;
            const reason = messageOf(err);
            this._outcomes.set(row.id, { state: 'failed', reason });
            this._log(`module:${row.id}`, `Module ${row.id} failed to start: ${reason}`);
        } finally {
            clearTimeout(timer);
        }
    }

    /** main's list as fetched at start, or null when it could not be read. */
    list() {
        return this._list;
    }

    /** What became of a module this launch: active, failed or blocked; null for one never started. */
    outcome(id) {
        return this._outcomes.get(id) ?? null;
    }

    /** Starts a visit of `folderPath` (ending any live one first) and tells each module's onLoaded. */
    beginVisit(folderPath) {
        this.endVisit();
        const visit = Object.freeze({
            id: ++this._visitSeq,
            folder: folderPath,
            isLive: () => this._liveVisit === visit,
        });
        this._visits.add(visit);
        this._liveVisit = visit;
        const handlers = this._handlers('loaded');
        if (handlers.length === 0) {
            return; // no snapshot of a 24k-file folder for nobody
        }
        const files = this._snapshot();
        for (const [record, fn] of handlers) {
            this._callHandler(record, 'onLoaded', () => fn(visit, files));
        }
    }

    /** Ends the live visit: each onVisitEnd runs while it is still live, then it is dead. Synchronous; idempotent. */
    endVisit() {
        const visit = this._liveVisit;
        if (!visit) {
            return;
        }
        for (const [record, fn] of this._handlers('visitEnd')) {
            this._callHandler(record, 'onVisitEnd', () => fn(visit));
        }
        this._liveVisit = null;
    }

    /** Deactivates every active module, newest first. Never rejects; a module's failure is logged. */
    async deactivateAll() {
        const active = this._active.splice(0).reverse();
        for (const { record, deactivate } of active) {
            record.disposed = true;
            if (deactivate) {
                try {
                    await deactivate();
                } catch (err) {
                    this._log(`module:${record.id}`, `Module ${record.id} failed to deactivate: ${messageOf(err)}`);
                }
            }
        }
    }

    _handlers(kind) {
        return this._records.filter((r) => !r.disposed).flatMap((r) => [...r.handlers[kind]].map((fn) => [r, fn]));
    }

    _callHandler(record, where, call) {
        try {
            const result = call();
            if (result && typeof result.then === 'function') {
                result.then(undefined, (err) => this._log(`module:${record.id}`, `${where} failed: ${messageOf(err)}`));
            }
        } catch (err) {
            this._log(`module:${record.id}`, `${where} failed: ${messageOf(err)}`);
        }
    }

    _snapshot() {
        let files;
        try {
            files = this.getFiles() || [];
        } catch (_err) {
            files = [];
        }
        return Object.freeze(Array.from(files, fileEntry));
    }

    _log(source, message) {
        try {
            this.api.logError({ level: 'error', message, source });
        } catch (_err) {
            // logging must not turn into a module failure
        }
    }

    // One module's record and its frozen host. `disposed` turns every handler and store call off for good.
    _newRecord(row) {
        const id = row.id;
        const record = { id, disposed: false, handlers: { loaded: new Set(), visitEnd: new Set() }, host: null };
        this._records.push(record);
        const declared = new Set((row.folderFiles || []).map((f) => f.name));
        const settingKey = (key) => {
            if (typeof key !== 'string' || !SETTING_KEY.test(key)) {
                throw new Error(`${id}: setting key ${JSON.stringify(key)} must be 1–64 of A–Z a–z 0–9 _ . -`);
            }
            return `module.${id}.${key}`;
        };
        const on = (kind) => (fn) => {
            if (record.disposed || typeof fn !== 'function') {
                return () => {};
            }
            record.handlers[kind].add(fn);
            return () => record.handlers[kind].delete(fn);
        };
        // The refusal for a store call, or null when its IPC may go: checked at the call (C9).
        const refusal = (visit) => {
            if (!this._visits.has(visit)) {
                throw new Error(`${id}: that visit is not one this host started`);
            }
            if (record.disposed) {
                return 'module is not active';
            }
            return visit === this._liveVisit ? null : 'visit ended';
        };
        const issue = (call) => {
            try {
                return Promise.resolve(call());
            } catch (err) {
                return Promise.reject(err);
            }
        };
        const folderFile = (name) => {
            if (!declared.has(name)) {
                throw new Error(`${id}: folder file ${name} is not declared in module.json`);
            }
            return Object.freeze({
                read: (visit) => {
                    const refused = refusal(visit);
                    if (refused) {
                        return Promise.resolve({ status: 'unreadable', reason: refused });
                    }
                    return issue(() => this.api.folderFileRead(id, visit.folder, name)).then(
                        (r) => (r && READ_STATUSES.has(r.status) ? r : { status: 'unreadable', reason: 'no reply' }),
                        (err) => ({ status: 'unreadable', reason: messageOf(err) })
                    );
                },
                write: (visit, value) => {
                    const refused = refusal(visit);
                    if (refused) {
                        return Promise.resolve({ success: false, error: refused });
                    }
                    return issue(() => this.api.folderFileWrite(id, visit.folder, name, value)).then(
                        (r) => r ?? { success: false, error: 'no reply' },
                        (err) => ({ success: false, error: messageOf(err) })
                    );
                },
                delete: (visit) => {
                    const refused = refusal(visit);
                    if (refused) {
                        return Promise.resolve({ success: false, error: refused });
                    }
                    return issue(() => this.api.folderFileDelete(id, visit.folder, name)).then(
                        (r) => r ?? { success: false, error: 'no reply' },
                        (err) => ({ success: false, error: messageOf(err) })
                    );
                },
            });
        };

        record.host = Object.freeze({
            module: Object.freeze({ id, version: row.version }),
            log: Object.freeze({
                error: (msg, detail) => this._log(`module:${id}`, detail ? `${msg}: ${detail}` : String(msg)),
                perf: (line) => {
                    try {
                        this.api.logPerf(`[${id}] ${line}`);
                    } catch (_err) {
                        // diagnostics only
                    }
                },
            }),
            settings: Object.freeze({
                get: (key, fallback) => {
                    const k = settingKey(key);
                    try {
                        const raw = this.storage.getItem(k);
                        return raw === null ? fallback : JSON.parse(raw);
                    } catch (_err) {
                        return fallback;
                    }
                },
                set: (key, value) => {
                    const k = settingKey(key);
                    try {
                        this.storage.setItem(k, JSON.stringify(value));
                    } catch (err) {
                        this._log(`module:${id}`, `setting ${key} could not be saved: ${messageOf(err)}`);
                    }
                },
            }),
            ui: Object.freeze({
                notify: (message, level = 'info', { sticky = false, action } = {}) => {
                    const options = { sticky: sticky === true };
                    if (action && typeof action.run === 'function') {
                        options.actionButton = String(action.label);
                        options.actionCallback = () => {
                            try {
                                action.run();
                            } catch (err) {
                                this._log(`module:${id}`, `notification action failed: ${messageOf(err)}`);
                            }
                        };
                    }
                    const element = this.notify(String(message), NOTIFY_LEVELS.has(level) ? level : 'info', options);
                    return Object.freeze({ close: () => element?.remove?.() });
                },
            }),
            folder: Object.freeze({
                current: () =>
                    this._liveVisit ? { path: this._liveVisit.folder, name: folderName(this._liveVisit.folder) } : null,
                onLoaded: on('loaded'),
                onVisitEnd: on('visitEnd'),
            }),
            files: Object.freeze({ list: () => this._snapshot() }),
            store: Object.freeze({ folderFile }),
        });
        return record;
    }
}
