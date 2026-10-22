// Main's folder-file writer (G2 PR 2, B2): .hash_cache.json, .sort_cache.json and .bulk_rated.json. A truncating
// writeFile left a torn file when the app quit mid-save, and .bulk_rated.json holds ratings that exist nowhere else.
// Each write goes to a tmp with a fresh name, is fsynced, then renamed over the target; writes to one target run one
// at a time, in call order. An orphaned tmp (a quit mid-write) is swept by a later session's first write to that
// target, once it is TMP_SWEEP_MIN_AGE_MS old.
const crypto = require('crypto');
const path = require('path');

// Old enough that no live write still owns it: a write holds its tmp for seconds, not minutes.
const TMP_SWEEP_MIN_AGE_MS = 600_000;

function tmpPathFor(targetPath, id) {
    return path.join(path.dirname(targetPath), `${path.basename(targetPath)}.${id}.tmp`);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
        const dir = path.dirname(targetPath);
        const pattern = new RegExp(`^${escapeRegExp(path.basename(targetPath))}\\.[0-9a-f]{12}\\.tmp$`);
        const cutoff = now() - TMP_SWEEP_MIN_AGE_MS;
        let names;
        try {
            names = await fs.readdir(dir);
        } catch (_err) {
            return;
        }
        for (const name of names) {
            if (!pattern.test(name)) {
                continue;
            }
            const p = path.join(dir, name);
            try {
                const st = await fs.lstat(p);
                if (st.isFile() && st.mtimeMs < cutoff) {
                    await fs.unlink(p);
                }
            } catch (_err) {
                // best effort: an orphan left now is swept by a later session
            }
        }
    }

    async function writeOnce(targetPath, data) {
        const tmp = tmpPathFor(targetPath, makeId());
        await assertPath(tmp);
        await assertPath(targetPath);
        if (!swept.has(targetPath)) {
            swept.add(targetPath);
            await sweepOrphans(targetPath);
        }
        // 'wx': an entry already at this name (planted, or another writer's) is refused, and never unlinked below.
        const fh = await fs.open(tmp, 'wx');
        try {
            try {
                await fh.writeFile(data, 'utf8');
                await fh.sync();
            } finally {
                await fh.close();
            }
            await withRetries(() => fs.rename(tmp, targetPath));
        } catch (err) {
            await fs.unlink(tmp).catch(() => {});
            throw err;
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

module.exports = { createAtomicWriter, tmpPathFor, TMP_SWEEP_MIN_AGE_MS };
