// v2 P1a: the module registry (spec §§ 6.1, 6.5 steps 1–2, 8.1). Main reads every <root>/<folder>/module.json as
// data, never as code (rule M-1): it validates the manifest strictly (plan C6), resolves dependencies, and keeps the
// user's toggles in modules.json. Toggles take effect on restart, so a row has the state it launched with
// (`enabledAtLaunch`, which `status` reflects) and the state the next launch will have (`enabledNext`).
//
// No Electron import: main.js injects the fs, the roots, the writer (atomic-write.js) and the logger.
'use strict';

const path = require('path');

const SUPPORTED_API_VERSIONS = Object.freeze([1]);
// Today's per-folder files, which core still reads and writes itself. No module may declare one; each later phase
// moves its names to the module that takes the file over (bulk ratings: P4b).
const CORE_RESERVED_FOLDER_FILES = Object.freeze([
    '.bulk_rated.json',
    '.feature_cache.json',
    '.hash_cache.json',
    '.sort_cache.json',
    '.tournament_state.json',
]);

const MANIFEST_MAX_BYTES = 65536;
const STATE_MAX_BYTES = 65536;
const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const ENTRY_RE = /^ui\/[A-Za-z0-9._/-]+\.js$/;
const FOLDER_FILE_RE = /^\.[A-Za-z0-9_-]{1,58}\.json$/;
const FOLDER_FILE_MAX_BYTES = 268435456;
const MAX_DEPENDENCIES = 16;
const MAX_FOLDER_FILES = 8;
// Keys whose meaning arrives with a later phase: absent or empty until that phase widens this validator (C6).
const LATER_KEYS = [
    'uses',
    'provides',
    'contributes',
    'appData',
    'workers',
    'styles',
    'jobs',
    'tools',
    'permissions',
    'legacySettingsKeys',
];
const REQUIRED_KEYS = ['id', 'name', 'version', 'apiVersion', 'entry', 'defaultEnabled'];
const KNOWN_KEYS = new Set([...REQUIRED_KEYS, 'description', 'requires', 'optional', 'folderFiles', ...LATER_KEYS]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isEmpty = (v) =>
    v === undefined || (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && !Object.keys(v).length);
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

function checkIdList(key, value, selfId, errors) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        errors.push(`${key}: must be a list of module ids`);
        return [];
    }
    if (value.length > MAX_DEPENDENCIES) {
        errors.push(`${key}: at most ${MAX_DEPENDENCIES} ids`);
    }
    const seen = new Set();
    for (const id of value) {
        if (typeof id !== 'string' || !ID_RE.test(id)) {
            errors.push(`${key}: ${JSON.stringify(id)} is not a module id`);
        } else if (id === selfId) {
            errors.push(`${key}: a module cannot depend on itself`);
        } else if (seen.has(id)) {
            errors.push(`${key}: ${id} is listed twice`);
        }
        seen.add(id);
    }
    return value;
}

function checkFolderFiles(value, reserved, errors) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        errors.push('folderFiles: must be a list');
        return [];
    }
    if (value.length > MAX_FOLDER_FILES) {
        errors.push(`folderFiles: at most ${MAX_FOLDER_FILES} files`);
    }
    const names = new Set();
    for (const decl of value) {
        if (!isPlainObject(decl)) {
            errors.push('folderFiles: each entry is { name, kind, maxBytes }');
            continue;
        }
        const extra = Object.keys(decl).filter((k) => !['name', 'kind', 'maxBytes'].includes(k));
        if (extra.length) {
            errors.push(`folderFiles: unknown key ${extra[0]}`);
        }
        const { name, kind, maxBytes } = decl;
        if (typeof name !== 'string' || !FOLDER_FILE_RE.test(name)) {
            errors.push(`folderFiles: ${JSON.stringify(name)} is not a dot-file .json name`);
        } else if (reserved.includes(name)) {
            errors.push(`folderFiles: ${name} is owned by core`);
        } else if (names.has(name)) {
            errors.push(`folderFiles: ${name} is declared twice`);
        }
        names.add(name);
        if (kind !== 'cache' && kind !== 'data') {
            errors.push(`folderFiles: kind of ${name} must be cache or data`);
        }
        if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > FOLDER_FILE_MAX_BYTES) {
            errors.push(`folderFiles: maxBytes of ${name} must be a whole number from 1 to ${FOLDER_FILE_MAX_BYTES}`);
        }
    }
    return value.map(({ name, kind, maxBytes }) => ({ name, kind, maxBytes }));
}

/**
 * Validates one module.json's text against the P1a manifest (plan Task 2's table).
 * @param {string} json the file's text (a byte-order mark is stripped)
 * @param {{ folderName: string, reservedFolderFiles?: readonly string[] }} options
 * @returns {{ ok: true, manifest: object } | { ok: false, errors: string[] }}
 */
function validateManifest(json, { folderName, reservedFolderFiles = CORE_RESERVED_FOLDER_FILES }) {
    if (typeof json !== 'string') {
        return { ok: false, errors: ['module.json: not text'] };
    }
    if (Buffer.byteLength(json, 'utf8') > MANIFEST_MAX_BYTES) {
        return { ok: false, errors: [`module.json: over ${MANIFEST_MAX_BYTES} bytes`] };
    }
    let m;
    try {
        m = JSON.parse(stripBom(json));
    } catch (err) {
        return { ok: false, errors: [`module.json: not valid JSON (${err.message})`] };
    }
    if (!isPlainObject(m)) {
        return { ok: false, errors: ['module.json: must be a JSON object'] };
    }

    const errors = [];
    for (const key of Object.keys(m)) {
        if (!KNOWN_KEYS.has(key)) {
            errors.push(`${key}: unknown key ${key}`);
        } else if (LATER_KEYS.includes(key) && !isEmpty(m[key])) {
            errors.push(`${key}: not supported yet by host API v1 (arrives with a later phase)`);
        }
    }
    for (const key of REQUIRED_KEYS) {
        if (!(key in m)) {
            errors.push(`${key}: required`);
        }
    }

    if ('id' in m) {
        if (typeof m.id !== 'string' || !ID_RE.test(m.id)) {
            errors.push(`id: ${JSON.stringify(m.id)} must be lowercase letters, digits and dashes (at most 40)`);
        } else if (m.id === 'core') {
            errors.push('id: core is reserved');
        } else if (m.id !== folderName) {
            errors.push(`id: ${m.id} does not equal its folder name ${folderName}`);
        }
    }
    if ('name' in m && (typeof m.name !== 'string' || m.name.length < 1 || m.name.length > 60)) {
        errors.push('name: must be 1 to 60 characters');
    }
    if ('version' in m && (typeof m.version !== 'string' || !VERSION_RE.test(m.version))) {
        errors.push('version: must look like 1.0.0');
    }
    if ('apiVersion' in m && !SUPPORTED_API_VERSIONS.includes(m.apiVersion)) {
        errors.push(
            `apiVersion: ${JSON.stringify(m.apiVersion)} is not supported (this host: ${SUPPORTED_API_VERSIONS})`
        );
    }
    if ('description' in m && (typeof m.description !== 'string' || m.description.length > 200)) {
        errors.push('description: at most 200 characters');
    }
    if ('entry' in m) {
        const segments = typeof m.entry === 'string' ? m.entry.split('/') : [];
        if (!ENTRY_RE.test(m.entry) || segments.some((s) => s === '' || s === '.' || s === '..')) {
            errors.push('entry: must be a .js file under ui/, with no . or .. segment');
        }
    }
    if ('defaultEnabled' in m && typeof m.defaultEnabled !== 'boolean') {
        errors.push('defaultEnabled: must be true or false');
    }
    const requires = checkIdList('requires', m.requires, m.id, errors);
    const optional = checkIdList('optional', m.optional, m.id, errors);
    for (const id of optional) {
        if (requires.includes(id)) {
            errors.push(`optional: ${id} is also in requires`);
        }
    }
    const folderFiles = checkFolderFiles(m.folderFiles, reservedFolderFiles, errors);

    if (errors.length) {
        return { ok: false, errors };
    }
    return {
        ok: true,
        manifest: {
            id: m.id,
            name: m.name,
            version: m.version,
            apiVersion: m.apiVersion,
            description: m.description ?? '',
            entry: m.entry,
            defaultEnabled: m.defaultEnabled,
            requires: [...requires],
            optional: [...optional],
            folderFiles,
        },
    };
}

// The shortest path from `start` back to itself inside one strongly connected set, as "a → b → a".
function describeCycle(start, members, edgesOf) {
    const prev = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
        const at = queue.shift();
        for (const next of edgesOf(at)) {
            if (next === start) {
                const pathIds = [start];
                for (let p = at; p !== start; p = prev.get(p)) {
                    pathIds.splice(1, 0, p);
                }
                return `dependency cycle: ${[...pathIds, start].join(' → ')}`;
            }
            if (members.has(next) && !prev.has(next)) {
                prev.set(next, at);
                queue.push(next);
            }
        }
    }
    return `dependency cycle: ${[...members].sort().join(', ')}`;
}

// Tarjan's strongly connected sets over `ids`, each set of two or more ids is a cycle.
function findCycles(ids, edgesOf) {
    let counter = 0;
    const index = new Map();
    const low = new Map();
    const stack = [];
    const onStack = new Set();
    const cycles = [];
    function visit(v) {
        index.set(v, counter);
        low.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);
        for (const w of edgesOf(v)) {
            if (!index.has(w)) {
                visit(w);
                low.set(v, Math.min(low.get(v), low.get(w)));
            } else if (onStack.has(w)) {
                low.set(v, Math.min(low.get(v), index.get(w)));
            }
        }
        if (low.get(v) === index.get(v)) {
            const set = new Set();
            let w;
            do {
                w = stack.pop();
                onStack.delete(w);
                set.add(w);
            } while (w !== v);
            if (set.size > 1) {
                cycles.push(set);
            }
        }
    }
    for (const id of ids) {
        if (!index.has(id)) {
            visit(id);
        }
    }
    return cycles;
}

/**
 * @param {object} deps
 * @param {{ realpath, readdir, stat, readFile }} deps.fs fs.promises (or a fake)
 * @param {{ dir: string, kind: 'app' | 'e2e' }[]} deps.roots module roots, searched in order; a missing one is skipped
 * @param {string} deps.statePath modules.json
 * @param {{ writeFileAtomic: (target: string, data: string) => Promise<void> }} deps.writer atomic-write.js's writer
 * @param {{ warn: (source: string, message: string) => void }} deps.logger
 * @param {readonly string[]} [deps.reservedFolderFiles]
 */
function createModuleRegistry({
    fs,
    roots,
    statePath,
    writer,
    logger,
    reservedFolderFiles = CORE_RESERVED_FOLDER_FILES,
}) {
    let records = []; // one per module folder found, in root then folder-name order
    let byId = new Map(); // id → record, for ids held by exactly one folder
    let order = [];
    let savedEnabled = {}; // modules.json's `enabled`, unknown ids included
    let setChain = Promise.resolve();

    async function readState() {
        let text;
        try {
            const st = await fs.stat(statePath);
            if (st.size > STATE_MAX_BYTES) {
                logger.warn(
                    'modules',
                    `modules.json is over ${STATE_MAX_BYTES} bytes; using the defaults for this launch`
                );
                return {};
            }
            text = await fs.readFile(statePath, 'utf8');
        } catch (err) {
            if (err && err.code !== 'ENOENT') {
                logger.warn(
                    'modules',
                    `modules.json could not be read (${err.message}); using the defaults for this launch`
                );
            }
            return {};
        }
        let parsed;
        try {
            parsed = JSON.parse(stripBom(String(text)));
        } catch (_err) {
            parsed = null;
        }
        if (!isPlainObject(parsed) || parsed.version !== 1 || !isPlainObject(parsed.enabled)) {
            logger.warn(
                'modules',
                'modules.json is not { "version": 1, "enabled": {…} }; using the defaults for this launch'
            );
            return {};
        }
        return { ...parsed.enabled };
    }

    async function readModuleFolder(rootDir, kind, name) {
        const joined = path.join(rootDir, name);
        let st;
        try {
            st = await fs.stat(joined);
        } catch (_err) {
            return null;
        }
        if (!st.isDirectory()) {
            return null;
        }
        const manifestPath = path.join(joined, 'module.json');
        let mst;
        try {
            mst = await fs.stat(manifestPath);
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                return null; // not a module folder
            }
            return {
                folderName: name,
                dir: joined,
                root: kind,
                manifest: null,
                errors: [`module.json: ${err.message}`],
            };
        }
        const record = { folderName: name, dir: joined, root: kind, manifest: null, errors: [] };
        try {
            if ((await fs.realpath(joined)) !== joined) {
                record.errors.push('the module folder is a link');
                return record;
            }
            if (!mst.isFile()) {
                record.errors.push('module.json: not a file');
                return record;
            }
            if (mst.size > MANIFEST_MAX_BYTES) {
                record.errors.push(`module.json: over ${MANIFEST_MAX_BYTES} bytes`);
                return record;
            }
            const result = validateManifest(String(await fs.readFile(manifestPath, 'utf8')), {
                folderName: name,
                reservedFolderFiles,
            });
            if (!result.ok) {
                record.errors.push(...result.errors);
                return record;
            }
            const entryStat = await fs.stat(path.join(joined, ...result.manifest.entry.split('/'))).catch(() => null);
            if (!entryStat || !entryStat.isFile()) {
                record.errors.push(`entry: ${result.manifest.entry} is not a file`);
                return record;
            }
            record.manifest = result.manifest;
        } catch (err) {
            record.errors.push(`module.json: ${err.message}`);
        }
        return record;
    }

    const rowId = (r) => (r.manifest ? r.manifest.id : r.folderName);
    const invalidate = (r, reason) => {
        if (!r.errors.length) {
            r.errors.push(reason);
        }
    };
    const isValid = (r) => r.errors.length === 0;

    function wantedAtLaunch(r) {
        const saved = Object.hasOwn(savedEnabled, rowId(r)) ? savedEnabled[rowId(r)] : undefined;
        return typeof saved === 'boolean' ? saved : Boolean(r.manifest && r.manifest.defaultEnabled);
    }

    function resolve() {
        // Duplicates (C15): an id held by two folders, or a folder file declared by two modules, invalidates every
        // module involved, so no outcome depends on which root or folder was read first.
        const idGroups = new Map();
        for (const r of records) {
            idGroups.set(rowId(r), [...(idGroups.get(rowId(r)) || []), r]);
        }
        for (const [id, group] of idGroups) {
            if (group.length > 1) {
                const where = group.map((r) => r.root).join(' and ');
                group.forEach((r) => invalidate(r, `duplicate id ${id} (in ${where})`));
            }
        }
        const fileOwners = new Map();
        for (const r of records.filter(isValid)) {
            for (const decl of r.manifest.folderFiles) {
                fileOwners.set(decl.name, [...(fileOwners.get(decl.name) || []), r]);
            }
        }
        for (const [name, owners] of fileOwners) {
            if (owners.length > 1) {
                const ownerIds = owners.map(rowId);
                owners.forEach((r) =>
                    invalidate(
                        r,
                        `folderFiles: ${name} is also declared by ${ownerIds.filter((i) => i !== rowId(r)).join(', ')}`
                    )
                );
            }
        }

        byId = new Map();
        for (const [id, group] of idGroups) {
            if (group.length === 1) {
                byId.set(id, group[0]);
            }
        }

        // Cycles over requires ∪ optional, among the modules still valid.
        const validIds = () => [...byId.keys()].filter((id) => isValid(byId.get(id))).sort();
        const edgesOf = (id) => {
            const m = byId.get(id).manifest;
            return [...m.requires, ...m.optional].filter((d) => byId.has(d) && isValid(byId.get(d))).sort();
        };
        for (const members of findCycles(validIds(), edgesOf)) {
            const start = [...members].sort()[0];
            const reason = describeCycle(start, members, edgesOf);
            members.forEach((id) => invalidate(byId.get(id), reason));
        }

        // Topological order (Kahn, ties by id): each module after everything it requires or welcomes.
        const ids = validIds();
        const pending = new Map(ids.map((id) => [id, new Set(edgesOf(id))]));
        order = [];
        while (pending.size) {
            const ready = [...pending.keys()].filter((id) => pending.get(id).size === 0).sort();
            const next = ready[0];
            order.push(next);
            pending.delete(next);
            pending.forEach((deps) => deps.delete(next));
        }

        // Status in that order, so a dependency's status is known before its dependents'.
        for (const r of records) {
            r.enabledAtLaunch = wantedAtLaunch(r);
            r.enabledNext = r.enabledAtLaunch;
            if (!isValid(r)) {
                r.status = 'invalid';
                r.reason = r.errors.join('; ');
            }
        }
        for (const id of order) {
            const r = byId.get(id);
            r.reason = null;
            if (!r.enabledAtLaunch) {
                r.status = 'off';
                continue;
            }
            r.status = 'enabled';
            for (const dep of r.manifest.requires) {
                const d = byId.get(dep);
                const anyRow = records.some((x) => rowId(x) === dep);
                let reason = null;
                if (!anyRow) {
                    reason = `requires ${dep}, which is not installed`;
                } else if (!d || d.status === 'invalid') {
                    reason = `disabled because ${dep} is not valid`;
                } else if (d.status === 'off') {
                    reason = `disabled because ${dep} is off`;
                } else if (d.status === 'blocked') {
                    reason = `disabled because ${dep} is disabled`;
                }
                if (reason) {
                    r.status = 'blocked';
                    r.reason = reason;
                    break;
                }
            }
        }
    }

    async function load() {
        records = [];
        savedEnabled = await readState();
        for (const root of roots) {
            let rootDir;
            try {
                rootDir = await fs.realpath(root.dir);
            } catch (err) {
                if (err && err.code !== 'ENOENT') {
                    logger.warn('modules', `module root (${root.kind}) could not be opened: ${err.message}`);
                }
                continue;
            }
            let names;
            try {
                names = await fs.readdir(rootDir);
            } catch (err) {
                logger.warn('modules', `module root (${root.kind}) could not be listed: ${err.message}`);
                continue;
            }
            for (const name of [...names].sort()) {
                const record = await readModuleFolder(rootDir, root.kind, name);
                if (record) {
                    records.push(record);
                }
            }
        }
        resolve();
    }

    function rowOf(r) {
        const m = r.manifest;
        return {
            id: rowId(r),
            name: m ? m.name : r.folderName,
            version: m ? m.version : '',
            description: m ? m.description : '',
            root: r.root,
            entryPath: m && r.status !== 'invalid' ? `modules/${m.id}/${m.entry}` : null,
            status: r.status,
            reason: r.reason,
            enabledAtLaunch: r.enabledAtLaunch,
            enabledNext: r.enabledNext,
            defaultEnabled: Boolean(m && m.defaultEnabled),
            requires: m ? [...m.requires] : [],
            optional: m ? [...m.optional] : [],
            folderFiles: m ? m.folderFiles.map((f) => ({ ...f })) : [],
        };
    }

    function list() {
        return {
            apiVersions: [...SUPPORTED_API_VERSIONS],
            order: [...order],
            restartNeeded: records.some((r) => r.enabledNext !== r.enabledAtLaunch),
            modules: records.map(rowOf),
        };
    }

    async function applyEnabled(id, enabled) {
        const r = byId.get(id);
        if (!r) {
            return { error: `no module ${id}` };
        }
        if (r.status === 'invalid') {
            return { error: `${id} is not valid` };
        }
        const next = { ...savedEnabled, [id]: enabled };
        try {
            await writer.writeFileAtomic(statePath, JSON.stringify({ version: 1, enabled: next }, null, 2));
        } catch (err) {
            return { error: err && err.message ? err.message : String(err) };
        }
        savedEnabled = next;
        r.enabledNext = enabled;
        return list();
    }

    // One toggle at a time, so each builds on the last one written: two quick clicks keep both.
    function setEnabled(id, enabled) {
        const run = setChain.then(() => applyEnabled(id, enabled));
        setChain = run.catch(() => {});
        return run;
    }

    function isActive(id) {
        const r = byId.get(id);
        return Boolean(r && r.enabledAtLaunch && r.status === 'enabled');
    }

    function folderFileDecl(owner, name) {
        if (!isActive(owner)) {
            return null;
        }
        const decl = byId.get(owner).manifest.folderFiles.find((f) => f.name === name);
        return decl ? { kind: decl.kind, maxBytes: decl.maxBytes } : null;
    }

    function moduleDir(id) {
        const r = byId.get(id);
        return r && r.status !== 'invalid' ? r.dir : null;
    }

    return { load, list, setEnabled, moduleDir, folderFileDecl, isActive };
}

module.exports = { SUPPORTED_API_VERSIONS, CORE_RESERVED_FOLDER_FILES, validateManifest, createModuleRegistry };
