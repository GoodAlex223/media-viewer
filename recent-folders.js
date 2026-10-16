// Recently opened folders (G4) — pure logic: no DOM, no IPC, no localStorage.
// Spec: docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md
// media-viewer.js imports this file as a namespace (`import * as RecentFolders`), so an extracted-method
// unit test supplies every function through one global (`globalThis.RecentFolders`).
//
// The validation here is hygiene, not a security control: main's grant check on every folder IPC is the
// boundary (spec § 5). A tampered list can only name folders that main then refuses.

export const MAX_RECENT_FOLDERS = 8;
export const MAX_PATH_LENGTH = 4096;
const STORAGE_VERSION = 1;

function isValidPath(p) {
    return typeof p === 'string' && p.length > 0 && p.length <= MAX_PATH_LENGTH;
}

function isValidEntry(e) {
    return (
        e !== null &&
        typeof e === 'object' &&
        isValidPath(e.path) &&
        typeof e.openedAt === 'number' &&
        Number.isFinite(e.openedAt) &&
        e.openedAt >= 0
    );
}

/**
 * The stored list, validated and clamped (spec § 5). Never throws: anything unreadable is an empty list.
 * Paths compare exactly — no case folding (NTFS can keep case-variant folders distinct).
 * @param {string|null} raw - localStorage.getItem('recentFolders')
 * @returns {{path: string, openedAt: number}[]} most recent first
 */
export function parseRecentFolders(raw) {
    if (typeof raw !== 'string') {
        return [];
    }
    let data;
    try {
        data = JSON.parse(raw);
    } catch (_err) {
        return [];
    }
    if (data === null || typeof data !== 'object' || data.version !== STORAGE_VERSION || !Array.isArray(data.entries)) {
        return [];
    }
    const seen = new Set();
    const out = [];
    for (const e of data.entries) {
        if (!isValidEntry(e) || seen.has(e.path)) {
            continue;
        }
        seen.add(e.path);
        out.push({ path: e.path, openedAt: e.openedAt });
        if (out.length === MAX_RECENT_FOLDERS) {
            break;
        }
    }
    return out;
}

/** A new list with `path` first (stamped `now`), any older copy removed, capped. An invalid path changes nothing. */
export function recordRecentFolder(entries, path, now) {
    if (!isValidPath(path)) {
        return entries.slice();
    }
    return [{ path, openedAt: now }, ...entries.filter((e) => e.path !== path)].slice(0, MAX_RECENT_FOLDERS);
}

/** A new list without `path`. */
export function removeRecentFolder(entries, path) {
    return entries.filter((e) => e.path !== path);
}

/** The localStorage value; parseRecentFolders reads it back. */
export function serializeRecentFolders(entries) {
    return JSON.stringify({
        version: STORAGE_VERSION,
        entries: entries.map(({ path, openedAt }) => ({ path, openedAt })),
    });
}

/** The name a row shows: the last path segment, or the whole path when there is none (a drive root). */
export function folderDisplayName(path, basename) {
    const name = typeof basename === 'function' ? basename(path) : '';
    return name || path;
}

/**
 * What a click on a listed folder does (spec § 6), from main's two answers:
 * `status` — getGrantStatus([path])[0]: true, false or 'unreachable' (undefined if the query failed or was refused);
 * `exists` — checkFolderExists(path), asked only when granted: true, false, or null when refused.
 * @returns {'open'|'missing'|'regrant'|'unreachable'|'error'}
 */
export function classifyRecentFolder(status, exists) {
    if (status === true) {
        if (exists === true) {
            return 'open';
        }
        if (exists === false) {
            return 'missing';
        }
        return exists === null ? 'regrant' : 'error';
    }
    if (status === false) {
        return 'regrant';
    }
    return status === 'unreachable' ? 'unreachable' : 'error';
}
