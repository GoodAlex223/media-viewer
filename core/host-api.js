// The host API a module's code is given (v2 spec § 7, host API version 1; the P1a part). Types only: a module may
// import this file for its JSDoc, and it is the one file outside its own folder a module may import
// (mv/module-imports). The host itself is built in core/module-host.js.

/**
 * One folder visit: from a folder's load until the next folder's load, or the quit. A store call is checked against
 * it at the call (plan C9): a call made while the visit is live, including inside onVisitEnd, reaches this folder.
 * @typedef {Readonly<{ id: number, folder: string, isLive: () => boolean }>} Visit
 */

/**
 * A file in the open folder, as files.list() and onLoaded give it.
 * @typedef {Readonly<{ name: string, path: string, size: number | null, mtimeMs: number | null, type: string | null }>} FileEntry
 */

/**
 * A folder-file read. A read that fails is `unreadable`, never `absent`: treat it as never read, and do not save
 * over it.
 * @typedef {{ status: 'ok', value: any, recovered: boolean } | { status: 'absent' } | { status: 'unreadable', reason: string }} ReadResult
 */

/**
 * @typedef {object} Host
 * @property {Readonly<{ id: string, version: string }>} module
 * @property {Readonly<{ error: (msg: string, detail?: string) => void, perf: (line: string) => void }>} log
 * @property {Readonly<{ get: (key: string, fallback?: any) => any, set: (key: string, value: any) => void }>} settings
 *     Kept in localStorage under module.<id>.<key>, as JSON. A key is 1–64 of A–Z a–z 0–9 _ . -
 * @property {Readonly<{ notify: (message: string, level?: 'info' | 'success' | 'warning' | 'error',
 *     options?: { sticky?: boolean, action?: { label: string, run: () => void } }) => { close: () => void } }>} ui
 * @property {Readonly<{ current: () => ({ path: string, name: string } | null),
 *     onLoaded: (fn: (visit: Visit, files: ReadonlyArray<FileEntry>) => void) => () => void,
 *     onVisitEnd: (fn: (visit: Visit) => void) => () => void }>} folder
 * @property {Readonly<{ list: () => ReadonlyArray<FileEntry> }>} files
 * @property {Readonly<{ folderFile: (name: string) => {
 *     read: (visit: Visit) => Promise<ReadResult>,
 *     write: (visit: Visit, value: any) => Promise<{ success: true } | { success: false, error: string }>,
 *     delete: (visit: Visit) => Promise<{ success: true } | { success: false, error: string }> } }>} store
 *     Only names the module declared in module.json's folderFiles.
 */

/**
 * What a module's entry exports. activate may return a promise; the host waits for it up to 5 s, import included.
 * @typedef {{ activate: (host: Host) => (void | { deactivate?: () => any, testApi?: any }
 *     | Promise<void | { deactivate?: () => any, testApi?: any }>) }} ModuleExports
 */

export {};
