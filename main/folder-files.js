// v2 P1a: the folder-file service (spec §§ 7.9, 8.2). A module's per-folder files, by owner and declared name. The
// IPC guard refuses an undeclared (owner, name) first (main/module-ipc.js); this checks it again, so no caller can
// reach a file its module did not declare.
//
// A read is tagged, and a read that fails is never "absent": a module that takes "unreadable" for "missing" saves
// over data it never read (CLAUDE.md § Cache Management, the bulk-rated bullet: "never read" is not "no ratings").
'use strict';

const path = require('path');
const { asciiFold } = require('../path-grants');
const { CORE_RESERVED_FOLDER_FILES } = require('./module-registry');

const NOT_PERMITTED = 'Not permitted';
const READ_CHUNK_BYTES = 64 * 1024;

class TooLargeError extends Error {}

/**
 * @param {object} deps
 * @param {typeof import('fs').promises} deps.fs
 * @param {{ folderFileDecl: (owner: string, name: string) => ({ kind: string, maxBytes: number } | null) }} deps.registry
 * @param {(p: string) => Promise<void>} deps.assertPath main's assertFixedPath: throws for a link or an ungranted path
 * @param {{ writeFileAtomic: (target: string, data: string) => Promise<void> }} deps.writer atomic-write.js's writer
 * @param {typeof import('../atomic-write').readRecoveryCopy} deps.readRecoveryCopy
 * @param {{ warn: (source: string, message: string) => void }} deps.logger
 */
function createFolderFiles({ fs, registry, assertPath, writer, readRecoveryCopy, logger }) {
    // One operation per file at a time, in call order, so a delete never overtakes a write asked for before it.
    const chains = new Map();
    function inOrder(target, op) {
        const run = (chains.get(target) || Promise.resolve()).then(op);
        const tail = run.catch(() => {});
        chains.set(target, tail);
        tail.then(() => {
            if (chains.get(target) === tail) {
                chains.delete(target);
            }
        });
        return run;
    }

    // The declaration for (owner, name), or null. A name that is one of core's files once case is folded is refused
    // whatever the registry says: NTFS would open core's file (the registry already takes lower-case names only).
    function declOf(owner, name) {
        if (typeof name !== 'string' || CORE_RESERVED_FOLDER_FILES.includes(asciiFold(name))) {
            return null;
        }
        return registry.folderFileDecl(owner, name);
    }

    // A file's text, read through one handle and never past maxBytes + 1 bytes, so a file that grows after its size
    // check costs main no more memory than its cap. Throws TooLargeError over the cap.
    async function readBounded(filePath, maxBytes) {
        const fh = await fs.open(filePath, 'r');
        try {
            const st = await fh.stat();
            if (!st.isFile()) {
                throw new Error('not a file');
            }
            if (st.size > maxBytes) {
                throw new TooLargeError('too large');
            }
            const chunks = [];
            let total = 0;
            while (total <= maxBytes) {
                const want = Math.min(Math.max(st.size + 1 - total, READ_CHUNK_BYTES), maxBytes + 1 - total);
                const buf = Buffer.alloc(want);
                const { bytesRead } = await fh.read(buf, 0, want, total);
                if (bytesRead === 0) {
                    break;
                }
                chunks.push(buf.subarray(0, bytesRead));
                total += bytesRead;
            }
            if (total > maxBytes) {
                throw new TooLargeError('too large'); // it grew since the check
            }
            return Buffer.concat(chunks, total).toString('utf8');
        } finally {
            await fh.close();
        }
    }

    /** @returns {Promise<{ status: 'ok', value: any, recovered: boolean } | { status: 'absent' } | { status: 'unreadable', reason: string }>} */
    async function read(owner, folder, name) {
        const decl = declOf(owner, name);
        if (!decl) {
            return { status: 'unreadable', reason: NOT_PERMITTED };
        }
        const filePath = path.join(folder, name);
        try {
            await assertPath(filePath);
            const text = await readBounded(filePath, decl.maxBytes);
            try {
                return { status: 'ok', value: JSON.parse(text), recovered: false };
            } catch (err) {
                // A torn file: the writer's in-place write of a held-open file was cut short, and its tmp is the last
                // whole copy (atomic-write.js). Only for a file that does not parse: a missing one stays missing. A
                // tmp over the cap is skipped like a torn one.
                const capped = { ...fs, readFile: (p) => readBounded(p, decl.maxBytes) };
                const value = await readRecoveryCopy(filePath, { fs: capped, assertPath, parse: JSON.parse });
                if (value === null) {
                    return { status: 'unreadable', reason: 'does not parse' };
                }
                logger.warn('main', `${name} did not parse (${err.message}); read its last whole copy`);
                return { status: 'ok', value, recovered: true };
            }
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                return { status: 'absent' };
            }
            return { status: 'unreadable', reason: err && err.message ? err.message : String(err) };
        }
    }

    async function write(owner, folder, name, value) {
        const decl = declOf(owner, name);
        if (!decl) {
            return { success: false, error: NOT_PERMITTED };
        }
        let text;
        try {
            text = JSON.stringify(value, null, 2);
        } catch (err) {
            return { success: false, error: `not JSON (${err.message})` };
        }
        if (text === undefined) {
            return { success: false, error: 'not JSON' };
        }
        if (Buffer.byteLength(text, 'utf8') > decl.maxBytes) {
            return { success: false, error: 'too large' };
        }
        const filePath = path.join(folder, name);
        try {
            await inOrder(filePath, () => writer.writeFileAtomic(filePath, text));
            return { success: true };
        } catch (err) {
            return { success: false, error: err && err.message ? err.message : String(err) };
        }
    }

    async function remove(owner, folder, name) {
        if (!declOf(owner, name)) {
            return { success: false, error: NOT_PERMITTED };
        }
        const filePath = path.join(folder, name);
        try {
            await inOrder(filePath, async () => {
                await assertPath(filePath);
                if ((await fs.lstat(filePath)).isDirectory()) {
                    throw new Error(`${name} is a folder`);
                }
                await fs.unlink(filePath);
            });
            return { success: true };
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                return { success: true };
            }
            return { success: false, error: err && err.message ? err.message : String(err) };
        }
    }

    return { read, write, remove };
}

module.exports = { createFolderFiles };
