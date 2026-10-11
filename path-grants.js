// path-grants.js
// The folders the user has granted this app (each picked in main's own native folder dialog),
// and the check every privileged file IPC runs before it touches a path the renderer named
// (G1). Pure CommonJS with no Electron import, so Vitest can load it.
//
// A path is allowed when its canonical form (realpath of the longest existing prefix, the
// missing tail re-appended) lies inside a granted root's canonical form. Callers use the
// result only as a yes/no: handlers keep acting on the renderer's ORIGINAL string, because
// substituting the canonical one would change every path load-folder returns for a folder
// reached through a junction or spelled in another case, and every path-keyed store
// (feature/sort/bulk caches, a saved tournament's files) would stop matching.

const path = require('path');
const nodeFs = require('fs');
const { promisify } = require('util');

const fsp = nodeFs.promises;
// Node's JS realpath walks lstat/readlink one component at a time, so it still follows links
// on volumes where the native one (GetFinalPathNameByHandleW) fails (deep review #4).
const jsRealpath = promisify(nodeFs.realpath);

const GRANTS_VERSION = 1;

// A `.` or `..` segment, with either separator. Such a path is refused outright rather than
// normalized: the check would see `a/link/../x` as `a/x`, while a POSIX kernel resolves `link`
// first and acts on `<link target's parent>/x` (final review I3). No legitimate caller sends
// one — every path the renderer holds came from main already normalized.
function hasDotSegment(p) {
    return p.split(/[\\/]+/).some((s) => s === '.' || s === '..');
}

// The one path shape every check accepts: a non-empty absolute string, no NUL, no dot segment.
function isCleanAbsolute(p) {
    return typeof p === 'string' && p.length > 0 && !p.includes('\0') && path.isAbsolute(p) && !hasDotSegment(p);
}

// Case fold for ASCII letters only. Unlike toLowerCase(), it never equates names NTFS keeps
// distinct (U+212A KELVIN SIGN lowercases to 'k' — commit security review).
function asciiFold(s) {
    return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

// Lexical, boundary-aware containment (`C:\Photos2` is not inside `C:\Photos`); accepts the root
// itself, and a root that already ends in a separator (a drive root such as `E:\` — final
// review I4). EXACT comparison, deliberately not case-folded (commit security review): JS
// toLowerCase() equates names NTFS keeps distinct, which let a look-alike sibling of a granted
// folder read as inside it. Callers compare canonical paths from realpath, which carry the
// on-disk casing; a case-only rename is handled by re-resolving the roots (deep review #12).
function isInsideDir(child, root) {
    if (child === root) {
        return true;
    }
    return child.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

// One stored root: its canonical path, and the spelling it was picked under (`alias`): a mapped
// or subst drive's realpath is its target, so only the alias still names it while the drive is
// offline (deep review #6).
function parseRoots(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== GRANTS_VERSION || !Array.isArray(parsed.roots)) {
        return null;
    }
    return parsed.roots
        .filter((r) => r && typeof r.path === 'string' && path.isAbsolute(r.path))
        .map((r) => ({
            path: r.path,
            alias: typeof r.alias === 'string' && path.isAbsolute(r.alias) ? r.alias : undefined,
            grantedAt: Number.isFinite(r.grantedAt) ? r.grantedAt : 0,
        }));
}

function createGrantStore({ storePath, fs = fsp, realpathFallback = jsRealpath } = {}) {
    let roots = []; // [{ path: canonical, alias: as picked, grantedAt }]
    let saveChain = Promise.resolve();

    async function realpathOf(p) {
        try {
            return await fs.realpath(p);
        } catch (err) {
            // Deep review #4: the native call throws EISDIR on RAM disks that bypass the Volume
            // Mount Manager (ImDisk) and UNKNOWN on WinFsp disk-mode mounts (rclone, sshfs-win).
            if ((err.code === 'EISDIR' || err.code === 'UNKNOWN') && realpathFallback) {
                return realpathFallback(p);
            }
            throw err;
        }
    }

    async function canonicalize(p) {
        if (!isCleanAbsolute(p)) {
            return null;
        }
        let current = path.resolve(p);
        const tail = [];
        for (;;) {
            try {
                const real = await realpathOf(current);
                return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
            } catch (err) {
                if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
                    return null; // EACCES and friends: fail closed
                }
                const parent = path.dirname(current);
                if (parent === current) {
                    return null;
                }
                tail.push(path.basename(current));
                current = parent;
            }
        }
    }

    async function load() {
        try {
            const parsed = parseRoots(await fs.readFile(storePath, 'utf-8'));
            roots = parsed ?? [];
            return parsed ? { ok: true, count: roots.length } : { ok: false, reason: 'unrecognised grant store' };
        } catch (err) {
            roots = [];
            return { ok: false, reason: err.code === 'ENOENT' ? 'no grant store yet' : err.message };
        }
    }

    function save() {
        const write = async () => {
            // Deep review #15: another instance on the same userData may have saved since this one
            // loaded. Merge its roots in rather than overwrite them; this instance's alias wins.
            try {
                const onDisk = parseRoots(await fs.readFile(storePath, 'utf-8')) ?? [];
                for (const r of onDisk) {
                    if (!roots.some((mine) => mine.path === r.path)) {
                        roots.push(r);
                    }
                }
            } catch (_err) {
                // no store yet, or unreadable: this instance's roots are written as they are
            }
            const tmp = storePath + '.tmp';
            await fs.mkdir(path.dirname(storePath), { recursive: true });
            await fs.writeFile(tmp, JSON.stringify({ version: GRANTS_VERSION, roots }, null, 2), 'utf-8');
            await fs.rename(tmp, storePath); // atomic replace, as the ML model cache does
        };
        // One writer at a time: two grants racing on the same .tmp would lose one rename.
        saveChain = saveChain.then(write, write);
        return saveChain;
    }

    async function grant(p) {
        const canonical = await canonicalize(p);
        if (!canonical) {
            return { path: null, persisted: false };
        }
        const alias = path.resolve(p);
        const existing = roots.find((r) => r.path === canonical);
        if (existing) {
            existing.alias = alias; // the latest spelling the user picked
        } else {
            roots.push({ path: canonical, alias, grantedAt: Date.now() });
        }
        try {
            await save();
            return { path: canonical, persisted: true };
        } catch (_err) {
            return { path: canonical, persisted: false }; // the session still has the grant
        }
    }

    // Deep review #12: a case-only rename of a granted folder (or an ancestor) changes what realpath
    // returns, and exact containment would revoke the grant. Re-resolve only the roots this path
    // matches under an ASCII fold, and adopt a root's new spelling only when it is the old one up to
    // ASCII case: a junction swapped in under the name, or a Unicode look-alike, cannot move a root.
    // In a case-sensitive folder the old spelling still resolves to itself, so nothing changes.
    async function refreshRootsFor(canonical) {
        const folded = asciiFold(canonical);
        let changed = false;
        for (const r of roots) {
            if (!isInsideDir(folded, asciiFold(r.path))) {
                continue;
            }
            let real;
            try {
                real = await realpathOf(r.path);
            } catch (_err) {
                continue;
            }
            if (real !== r.path && asciiFold(real) === asciiFold(r.path)) {
                r.path = real;
                changed = true;
            }
        }
        if (changed) {
            try {
                await save();
            } catch (_err) {
                // the session keeps the refreshed spelling either way
            }
        }
        return changed;
    }

    async function isGrantedCanonical(canonical) {
        if (roots.some((r) => isInsideDir(canonical, r.path))) {
            return true;
        }
        return (await refreshRootsFor(canonical)) && roots.some((r) => isInsideDir(canonical, r.path));
    }

    async function resolveAllowed(p) {
        const canonical = await canonicalize(p);
        return canonical && (await isGrantedCanonical(canonical)) ? canonical : null;
    }

    // A directory ENTRY, authorized by the folder that holds it: the canonical parent must be inside
    // a grant, and the entry itself may be a link whose target lies anywhere (review M-a). For
    // operations on the entry only — a move renames the link, never its target. Content reads must
    // not use this alone (see ipc-guard's grantedMediaRead).
    async function resolveEntry(p) {
        if (!isCleanAbsolute(p)) {
            return null;
        }
        const resolved = path.resolve(p);
        const name = path.basename(resolved);
        const parent = path.dirname(resolved);
        if (!name || parent === resolved) {
            return null; // a root has no entry name
        }
        const allowedParent = await resolveAllowed(parent);
        return allowedParent ? path.join(allowedParent, name) : null;
    }

    // For the renderer's re-confirm marks only — it authorizes nothing. 'unreachable': nothing on
    // the path resolves (typically its drive is absent: a removable, mapped or subst drive, or an
    // offline network share), yet it lies under a stored root or the spelling that root was picked
    // under, so it was granted and is merely unavailable (review M-b, deep review #6).
    async function status(p) {
        const canonical = await canonicalize(p);
        if (canonical) {
            return (await isGrantedCanonical(canonical)) ? 'granted' : 'denied';
        }
        if (isCleanAbsolute(p)) {
            const lexical = asciiFold(path.resolve(p));
            const under = (root) => root !== undefined && isInsideDir(lexical, asciiFold(root));
            if (roots.some((r) => under(r.path) || under(r.alias))) {
                return 'unreachable';
            }
        }
        return 'denied';
    }

    // One path at a time (deep review #3): realpath on an offline network share holds a libuv
    // thread for the SMB timeout (~21 s), and main has four; a parallel batch stalled every
    // other file IPC behind it.
    async function statusMany(paths) {
        const out = [];
        for (const p of paths) {
            out.push(await status(p));
        }
        return out;
    }

    return {
        load,
        grant,
        resolveAllowed,
        resolveEntry,
        status,
        statusMany,
        canonicalize,
        list: () => roots.map((r) => r.path),
    };
}

// Temp directories main itself created (extractKeyframes). The renderer gets each path from
// main and hands it back unchanged, so exact string comparison is both sufficient and strict
// (no case folding, which equated look-alike names — commit security review).
function createTempDirRegistry() {
    const dirs = new Set();
    const key = (p) => (isCleanAbsolute(p) ? path.resolve(p) : null);
    return {
        add(dir) {
            const k = key(dir);
            if (k) {
                dirs.add(k);
            }
        },
        has(dir) {
            const k = key(dir);
            return k !== null && dirs.has(k);
        },
        delete(dir) {
            const k = key(dir);
            if (k) {
                dirs.delete(k);
            }
        },
        isChildFile(p) {
            const k = key(p);
            return k !== null && dirs.has(path.dirname(k));
        },
    };
}

module.exports = {
    createGrantStore,
    createTempDirRegistry,
    hasDotSegment,
    isCleanAbsolute,
    asciiFold,
    isInsideDir,
    GRANTS_VERSION,
};
