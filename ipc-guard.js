// ipc-guard.js
// Registration wrapper for every privileged ipcMain channel (G1). A call reaches its handler
// only after two checks: the sender is the app's own top-level index.html, and every argument
// passes the kind its channel declared. A refused call returns that channel's own failure value
// (the renderer's existing error branches already handle it) and is logged; it never throws.
// Pure CommonJS with no Electron import, so Vitest can load it.

const path = require('path');
const { hasDotSegment } = require('./path-grants');

const DEFAULT_REJECT = Object.freeze({ success: false, error: 'Not permitted' });

// A file: URL reduced to what identifies the document: no query or fragment, and case-folded on
// Windows, where Chromium and pathToFileURL can disagree on the drive letter's case.
function normalizeFileUrl(raw, platform = process.platform) {
    let u;
    try {
        u = new URL(raw);
    } catch (_err) {
        return null;
    }
    if (u.protocol !== 'file:') {
        return null;
    }
    u.search = '';
    u.hash = '';
    return platform === 'win32' ? u.href.toLowerCase() : u.href;
}

function isPlainBasename(v, platform = process.platform) {
    if (typeof v !== 'string' || v.length === 0 || v.length > 255) {
        return false;
    }
    if (v === '.' || v === '..' || /[\\/\0]/.test(v)) {
        return false;
    }
    return !(platform === 'win32' && v.includes(':'));
}

function describe(v) {
    if (typeof v === 'string') {
        return JSON.stringify(v.length > 200 ? v.slice(0, 200) + '…' : v);
    }
    return Array.isArray(v) ? `array(${v.length})` : typeof v;
}

function createIpcGuard({ ipcMain, grants, tempDirs, expectedUrl, logger, platform = process.platform }) {
    const expected = normalizeFileUrl(expectedUrl, platform);
    if (!expected) {
        throw new Error('ipc-guard: expectedUrl must be a file: URL');
    }

    const isTrustedSender = (event) => {
        const frame = event?.senderFrame;
        if (!frame || frame.parent) {
            return false;
        }
        return normalizeFileUrl(frame.url, platform) === expected;
    };

    const isString = (v) => typeof v === 'string';
    const kinds = {
        any: () => true,
        string: isString,
        grantedPath: async (v) => isString(v) && (await grants.resolveAllowed(v)) !== null,
        basename: (v) => isPlainBasename(v, platform),
        trackedTempDir: (v) => isString(v) && tempDirs.has(v),
        grantedOrTempPath: async (v) =>
            isString(v) && (tempDirs.isChildFile(v) || (await grants.resolveAllowed(v)) !== null),
        binary: (v) => v instanceof ArrayBuffer || ArrayBuffer.isView(v),
    };
    const int = (min, max) => (v) => Number.isSafeInteger(v) && v >= min && v <= max;
    const optional = (kind) => (v, args) => v === undefined || v === null || kind(v, args);
    const oneOf =
        (...values) =>
        (v) =>
            values.includes(v);
    const arrayOf = (kind, maxLength) => async (v, args) => {
        if (!Array.isArray(v) || v.length > maxLength) {
            return false;
        }
        for (const item of v) {
            if (!(await kind(item, args))) {
                return false;
            }
        }
        return true;
    };
    const shape = (spec) => async (v, args) => {
        if (v === null || typeof v !== 'object' || Array.isArray(v)) {
            return false;
        }
        for (const [key, kind] of Object.entries(spec)) {
            if (!(await kind(v[key], args))) {
                return false;
            }
        }
        return true;
    };

    async function check(event, argKinds, args) {
        if (!isTrustedSender(event)) {
            return 'untrusted sender';
        }
        if (args.length > argKinds.length) {
            return `expected at most ${argKinds.length} argument(s), got ${args.length}`;
        }
        for (let i = 0; i < argKinds.length; i++) {
            if (!(await argKinds[i](args[i], args))) {
                return `argument ${i} rejected (${describe(args[i])})`;
            }
        }
        return null;
    }

    const rejectWith = (rejectValue) => {
        if (typeof rejectValue === 'function') {
            return rejectValue();
        }
        return rejectValue !== null && typeof rejectValue === 'object' ? { ...rejectValue } : rejectValue;
    };

    function handle(channel, argKinds, fn, { rejectValue = DEFAULT_REJECT } = {}) {
        ipcMain.handle(channel, async (event, ...args) => {
            const reason = await check(event, argKinds, args);
            if (reason !== null) {
                logger.warn('ipc-guard', `Refused ${channel}: ${reason}`);
                return rejectWith(rejectValue);
            }
            return fn(event, ...args);
        });
    }

    // `isTrusted` replaces the URL check for a channel that must work even if the URL check ever
    // fails — closing the window (final review I1: a refused app-close-allow trapped the app).
    function on(channel, fn, { isTrusted = isTrustedSender } = {}) {
        ipcMain.on(channel, (event, ...args) => {
            if (!isTrusted(event)) {
                logger.warn('ipc-guard', `Refused ${channel}: untrusted sender`);
                return;
            }
            fn(event, ...args);
        });
    }

    return { handle, on, kinds, int, optional, oneOf, arrayOf, shape, isTrustedSender };
}

// The tier map applyTournamentResults receives: every key a media file DIRECTLY inside the
// folder (args[0], itself checked by grantedPath), every value a small non-negative integer —
// integer-ness is what keeps `_Tier-${tier}` a plain folder name (G1, F6/F7). All or nothing:
// one bad entry refuses the whole call before any mkdir or rename runs.
function tierAssignmentsKind({ isMediaFile, maxTier = 100, maxEntries = 100000, platform = process.platform }) {
    const fold = (p) => (platform === 'win32' ? p.toLowerCase() : p);
    return (assignments, args) => {
        const folderPath = args?.[0];
        if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath) || hasDotSegment(folderPath)) {
            return false;
        }
        if (assignments === null || typeof assignments !== 'object' || Array.isArray(assignments)) {
            return false;
        }
        const entries = Object.entries(assignments);
        if (entries.length > maxEntries) {
            return false;
        }
        const folder = fold(path.resolve(folderPath));
        for (const [src, tier] of entries) {
            if (!Number.isSafeInteger(tier) || tier < 0 || tier > maxTier) {
                return false;
            }
            if (!path.isAbsolute(src) || hasDotSegment(src) || fold(path.dirname(path.resolve(src))) !== folder) {
                return false;
            }
            if (!isMediaFile(path.extname(src).toLowerCase())) {
                return false;
            }
        }
        return true;
    };
}

module.exports = { createIpcGuard, normalizeFileUrl, isPlainBasename, tierAssignmentsKind, DEFAULT_REJECT };
