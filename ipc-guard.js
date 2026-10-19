// ipc-guard.js
// Registration wrapper for every privileged ipcMain channel (G1). A `handle` call reaches its
// handler only after two checks: the sender is the app's own top-level index.html, and every
// argument passes the kind its channel declared (`any` checks nothing; it marks an argument the
// handler validates itself or treats as opaque data). An `on` channel may replace the URL check
// with its own sender test (app-close-allow checks the sender's identity). A refused call returns
// that channel's own failure value (the renderer's existing error branches already handle it) and
// is logged; it never throws. Pure CommonJS with no Electron import, so Vitest can load it.

const path = require('path');
const { isCleanAbsolute, asciiFold, createMediaReadRule } = require('./path-grants');
const { APP_SCHEME } = require('./app-protocol');

const DEFAULT_REJECT = Object.freeze({ success: false, error: 'Not permitted' });

// The page a sender frame shows: scheme, host and path of its URL, without query or fragment
// (G1 I1). The app page is served from its own scheme, where a URL has one spelling, so it is
// compared as text. A file: URL has no host and identifies nothing.
function pageId(raw) {
    let u;
    try {
        u = new URL(raw);
    } catch (_err) {
        return null;
    }
    return u.host ? `${u.protocol}//${u.host}${u.pathname}` : null;
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

function createIpcGuard({ ipcMain, grants, tempDirs, expectedUrl, logger, isMediaFile, platform = process.platform }) {
    const expected = pageId(expectedUrl);
    if (!expected || !expected.startsWith(`${APP_SCHEME}://`)) {
        throw new Error('ipc-guard: expectedUrl must be an app: URL');
    }

    const isTrustedSender = (event) => {
        const frame = event?.senderFrame;
        if (!frame || frame.parent) {
            return false;
        }
        return pageId(frame.url) === expected;
    };

    const isString = (v) => typeof v === 'string';
    // Content reads (JXL decode, video probe, keyframes, CLIP) go through the one media-read rule
    // the app scheme's media door also uses (path-grants.js). Without isMediaFile it refuses all.
    const resolveMediaRead = createMediaReadRule({ grants, isMediaFile });
    const mediaRead = async (v) => isString(v) && (await resolveMediaRead(v)) !== null;
    const isMediaName = (v) => typeof isMediaFile === 'function' && isMediaFile(path.extname(v).toLowerCase());
    const grantedEntry = async (v) => isString(v) && (await grants.resolveEntry(v)) !== null;
    const kinds = {
        any: () => true,
        string: isString,
        grantedPath: async (v) => isString(v) && (await grants.resolveAllowed(v)) !== null,
        basename: (v) => isPlainBasename(v, platform),
        trackedTempDir: (v) => isString(v) && tempDirs.has(v),
        // An operation on a directory entry (rename, existence): authorized by the folder that
        // HOLDS it, which must be granted; the entry itself may be a link that points anywhere
        // (review M-a). Only that: following the entry (deep review #9) also accepted a link
        // outside every grant that points into one, and a granted root itself.
        grantedEntry,
        // move-file's source and new name (deep review #8): a media file under a media file name.
        // A move could otherwise rename a cache file of chosen text to any name under a grant.
        mediaEntry: async (v) => isString(v) && isMediaName(v) && (await grantedEntry(v)),
        mediaBasename: (v) => isPlainBasename(v, platform) && isMediaName(v),
        // A read of a media file's content: see mediaRead above.
        grantedMediaRead: mediaRead,
        grantedOrTempMediaRead: async (v) => isString(v) && (tempDirs.isChildFile(v) || (await mediaRead(v))),
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
function tierAssignmentsKind({ isMediaFile, maxTier = 100, maxEntries = 100000 }) {
    // Exact comparison, not case-folded (commit security review): JS toLowerCase() equates names
    // NTFS keeps distinct (U+212A KELVIN SIGN vs 'k'). Every key load-folder produced starts with
    // this exact folder string, so a legitimate call is unaffected.
    return (assignments, args) => {
        const folderPath = args?.[0];
        if (!isCleanAbsolute(folderPath)) {
            return false;
        }
        if (assignments === null || typeof assignments !== 'object' || Array.isArray(assignments)) {
            return false;
        }
        const entries = Object.entries(assignments);
        if (entries.length > maxEntries) {
            return false;
        }
        const folder = path.resolve(folderPath);
        for (const [src, tier] of entries) {
            if (!Number.isSafeInteger(tier) || tier < 0 || tier > maxTier) {
                return false;
            }
            if (!isCleanAbsolute(src) || path.dirname(path.resolve(src)) !== folder) {
                return false;
            }
            if (!isMediaFile(path.extname(src).toLowerCase())) {
                return false;
            }
        }
        return true;
    };
}

// applyTournamentResults' link check for one tier folder (deep review #5): the realpath of
// `<folder>/_Tier-N` must sit DIRECTLY in the folder's own realpath, compared exactly, and only the
// tier folder's name may differ, by ASCII case (a user-made `_tier-3`). Folding the whole path
// let a junction into a sibling differing only by case (a case-sensitive tree) pass.
function tierDirMatches(realTier, realRoot, tierName) {
    return path.dirname(realTier) === realRoot && asciiFold(path.basename(realTier)) === asciiFold(tierName);
}

module.exports = {
    createIpcGuard,
    isPlainBasename,
    tierAssignmentsKind,
    tierDirMatches,
    DEFAULT_REJECT,
};
