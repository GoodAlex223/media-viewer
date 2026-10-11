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
const fsp = require('fs').promises;

const GRANTS_VERSION = 1;

// A `.` or `..` segment, with either separator. Such a path is refused outright rather than
// normalized: the check would see `a/link/../x` as `a/x`, while a POSIX kernel resolves `link`
// first and acts on `<link target's parent>/x` (final review I3). No legitimate caller sends
// one — every path the renderer holds came from main already normalized.
function hasDotSegment(p) {
    return p.split(/[\\/]+/).some((s) => s === '.' || s === '..');
}

// Lexical, boundary-aware containment (`C:\Photos2` is not inside `C:\Photos`); accepts the root
// itself, and a root that already ends in a separator (a drive root such as `E:\` — final
// review I4). EXACT comparison, deliberately not case-folded (commit security review): JS
// toLowerCase() equates names NTFS keeps distinct (U+212A KELVIN SIGN lowercases to 'k'), which
// let a look-alike sibling of a granted folder read as inside it. Callers compare canonical
// paths from native realpath, which carry the on-disk casing, so exactness costs a legitimate
// caller nothing; only a deleted root reached with different casing now fails closed.
function isInsideDir(child, root, _platform = process.platform) {
    const c = child;
    const r = root;
    if (c === r) {
        return true;
    }
    return c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

function createGrantStore({ storePath, fs = fsp, platform = process.platform } = {}) {
    let roots = []; // [{ path: canonical, grantedAt }]
    let saveChain = Promise.resolve();

    async function canonicalize(p) {
        if (typeof p !== 'string' || p.length === 0 || p.includes('\0') || !path.isAbsolute(p) || hasDotSegment(p)) {
            return null;
        }
        let current = path.resolve(p);
        const tail = [];
        for (;;) {
            try {
                const real = await fs.realpath(current);
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

    const isInside = (child, root) => isInsideDir(child, root, platform);

    async function load() {
        try {
            const parsed = JSON.parse(await fs.readFile(storePath, 'utf-8'));
            if (!parsed || parsed.version !== GRANTS_VERSION || !Array.isArray(parsed.roots)) {
                roots = [];
                return { ok: false, reason: 'unrecognised grant store' };
            }
            roots = parsed.roots
                .filter((r) => r && typeof r.path === 'string' && path.isAbsolute(r.path))
                .map((r) => ({ path: r.path, grantedAt: Number.isFinite(r.grantedAt) ? r.grantedAt : 0 }));
            return { ok: true, count: roots.length };
        } catch (err) {
            roots = [];
            return { ok: false, reason: err.code === 'ENOENT' ? 'no grant store yet' : err.message };
        }
    }

    function save() {
        const write = async () => {
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
        if (!roots.some((r) => r.path === canonical)) {
            roots.push({ path: canonical, grantedAt: Date.now() });
        }
        try {
            await save();
            return { path: canonical, persisted: true };
        } catch (_err) {
            return { path: canonical, persisted: false }; // the session still has the grant
        }
    }

    async function resolveAllowed(p) {
        const canonical = await canonicalize(p);
        if (!canonical) {
            return null;
        }
        return roots.some((r) => isInside(canonical, r.path)) ? canonical : null;
    }

    // A directory ENTRY, authorized by the folder that holds it: the canonical parent must be inside
    // a grant, and the entry itself may be a link whose target lies anywhere (review M-a). For
    // operations on the entry only — a move renames the link, never its target. Content reads must
    // not use this alone (see ipc-guard's grantedMediaRead).
    async function resolveEntry(p) {
        if (typeof p !== 'string' || !path.isAbsolute(p) || hasDotSegment(p)) {
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
    // the path resolves (typically its drive is absent: a removable or offline network drive), yet
    // it lies under a stored root, so it was granted and is merely unavailable (review M-b).
    async function status(p) {
        const canonical = await canonicalize(p);
        if (canonical) {
            return roots.some((r) => isInside(canonical, r.path)) ? 'granted' : 'denied';
        }
        if (typeof p === 'string' && path.isAbsolute(p) && !hasDotSegment(p) && !p.includes('\0')) {
            const lexical = path.resolve(p);
            if (roots.some((r) => isInside(lexical, r.path))) {
                return 'unreachable';
            }
        }
        return 'denied';
    }

    return {
        load,
        grant,
        resolveAllowed,
        resolveEntry,
        status,
        canonicalize,
        list: () => roots.map((r) => r.path),
    };
}

// Temp directories main itself created (extractKeyframes). The renderer gets each path from
// main and hands it back unchanged, so exact string comparison is both sufficient and strict.
// (Exact: no case folding, which equated look-alike names — commit security review.)
function createTempDirRegistry() {
    const dirs = new Set();
    const key = (p) => (typeof p === 'string' && path.isAbsolute(p) && !hasDotSegment(p) ? path.resolve(p) : null);
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
            return k !== null && dirs.has(path.dirname(path.resolve(p)));
        },
    };
}

module.exports = { createGrantStore, createTempDirRegistry, hasDotSegment, isInsideDir, GRANTS_VERSION };
