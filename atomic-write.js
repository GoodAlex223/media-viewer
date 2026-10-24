// Main's folder-file writer (G2 PR 2, B2): .hash_cache.json, .sort_cache.json and .bulk_rated.json. A truncating
// writeFile left a torn file when the app quit mid-save, and .bulk_rated.json holds ratings that exist nowhere else.
// Each write goes to a tmp with a fresh name, is fsynced, then renamed over the target; writes to one target run one
// at a time, in call order. When another program holds the target open, the target is written in place instead, and
// the tmp stays until that write is complete, so a torn target still has a whole copy (readRecoveryCopy). An orphaned
// tmp is swept after a later session's first successful write to that target, once it is TMP_SWEEP_MIN_AGE_MS old.
const crypto = require('crypto');
const path = require('path');

// Old enough that no live write still owns it: a write holds its tmp for seconds, not minutes.
const TMP_SWEEP_MIN_AGE_MS = 600_000;

// A rename that still fails with one of these after its retries meets a target another program holds open: Windows
// refuses to replace an open file, even one shared for delete (PR #87 review #2, measured). The write then goes in
// place, as every write did before this writer.
const HELD_OPEN_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function tmpPathFor(targetPath, id) {
    return path.join(path.dirname(targetPath), `${path.basename(targetPath)}.${id}.tmp`);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The names tmpPathFor gives `targetPath`'s tmps, and nothing else in its folder.
const tmpPattern = (targetPath) => new RegExp(`^${escapeRegExp(path.basename(targetPath))}\\.[0-9a-f]{12}\\.tmp$`);

// targetPath's tmps that are plain files, newest first.
async function listTmps(fs, targetPath) {
    const dir = path.dirname(targetPath);
    const pattern = tmpPattern(targetPath);
    let names;
    try {
        names = await fs.readdir(dir);
    } catch (_err) {
        return [];
    }
    const tmps = [];
    for (const name of names.filter((n) => pattern.test(n))) {
        const p = path.join(dir, name);
        try {
            const st = await fs.lstat(p);
            if (st.isFile()) {
                tmps.push({ path: p, mtimeMs: st.mtimeMs });
            }
        } catch (_err) {
            // gone meanwhile
        }
    }
    return tmps.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * The last whole copy of a target that does not parse (the user's ruling on PR #87 review #2, 2026-10-24): an in-place
 * write of a held-open target that a crash cut short leaves it torn, with the writer's fsynced tmp still beside it.
 * Returns the first tmp, newest first, that `parse` accepts, or null. Each is checked with `assertPath` before it is
 * read; a torn, refused or vanished one is skipped.
 * @param {string} targetPath
 * @param {{ fs: typeof import('fs').promises, assertPath: (p: string) => Promise<void>, parse: (text: string) => any }} deps
 */
async function readRecoveryCopy(targetPath, { fs, assertPath, parse }) {
    for (const tmp of await listTmps(fs, targetPath)) {
        try {
            await assertPath(tmp.path);
            return parse(await fs.readFile(tmp.path, 'utf8'));
        } catch (_err) {
            // the next one
        }
    }
    return null;
}

/**
 * @param {object} deps
 * @param {typeof import('fs').promises} deps.fs
 * @param {(p: string) => Promise<void>} deps.assertPath main's assertFixedPath: throws for a link or an ungranted path
 * @param {(fn: () => Promise<any>) => Promise<any>} deps.withRetries feature-cache-ledger's withReadRetries (injected,
 *     so the rename shares write-close's lock-retry loop rather than a third copy of it)
 */
function createAtomicWriter({
    fs,
    assertPath,
    withRetries,
    makeId = () => crypto.randomBytes(6).toString('hex'),
    now = Date.now,
}) {
    const chains = new Map(); // target → the tail of its write queue (never rejects)
    const swept = new Set(); // targets whose directory this writer has swept

    async function sweepOrphans(targetPath) {
        const cutoff = now() - TMP_SWEEP_MIN_AGE_MS;
        for (const tmp of await listTmps(fs, targetPath)) {
            if (tmp.mtimeMs < cutoff) {
                // best effort: an orphan left now is swept by a later session
                await fs.unlink(tmp.path).catch(() => {});
            }
        }
    }

    async function writeOnce(targetPath, data) {
        const tmp = tmpPathFor(targetPath, makeId());
        await assertPath(tmp);
        await assertPath(targetPath);
        let tmpIsTheWholeCopy = false;
        // 'wx': an entry already at this name (planted, or another writer's) is refused, and never unlinked below.
        const fh = await fs.open(tmp, 'wx');
        try {
            try {
                await fh.writeFile(data, 'utf8');
                // Best effort: some volumes refuse a flush (libuv reports ERROR_INVALID_FUNCTION as EISDIR), and the
                // writes before this writer had none. The data is written either way; the flush adds power-loss safety.
                await fh.sync().catch(() => {});
            } finally {
                await fh.close();
            }
            try {
                await withRetries(() => fs.rename(tmp, targetPath));
            } catch (err) {
                if (!HELD_OPEN_CODES.has(err && err.code)) {
                    throw err;
                }
                // Checked again: the target is opened, not replaced, so a link planted since the first check would be
                // followed out of the folder.
                await assertPath(targetPath);
                // From here the tmp is the whole copy: an overwrite cut short (a crash, a full disk) tears the target,
                // and readRecoveryCopy then reads the tmp. It goes only once the overwrite is complete.
                tmpIsTheWholeCopy = true;
                await fs.writeFile(targetPath, data, 'utf8');
                await fs.unlink(tmp).catch(() => {});
            }
        } catch (err) {
            if (!tmpIsTheWholeCopy) {
                await fs.unlink(tmp).catch(() => {});
            }
            throw err;
        }
        // After a successful write, never before one: a sweep first could remove the only whole copy of a torn target.
        if (!swept.has(targetPath)) {
            swept.add(targetPath);
            await sweepOrphans(targetPath);
        }
    }

    function writeFileAtomic(targetPath, data) {
        const prev = chains.get(targetPath) || Promise.resolve();
        const run = prev.then(() => writeOnce(targetPath, data));
        const tail = run.catch(() => {}); // a failed write does not stop the next one
        chains.set(targetPath, tail);
        tail.then(() => {
            if (chains.get(targetPath) === tail) {
                chains.delete(targetPath);
            }
        });
        return run;
    }

    return { writeFileAtomic };
}

module.exports = { createAtomicWriter, readRecoveryCopy, tmpPathFor, TMP_SWEEP_MIN_AGE_MS };
