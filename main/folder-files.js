// v2 P1a: the folder-file service (spec §§ 7.9, 8.2). A module's per-folder files, by owner and declared name. The
// IPC guard refuses an undeclared (owner, name) first (main/module-ipc.js); this checks it again, so no caller can
// reach a file its module did not declare.
//
// A read is tagged, and a read that fails is never "absent": a module that takes "unreadable" for "missing" saves
// over data it never read (CLAUDE.md § Cache Management, the bulk-rated bullet: "never read" is not "no ratings").
'use strict';

const path = require('path');

const NOT_PERMITTED = 'Not permitted';

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

    /** @returns {Promise<{ status: 'ok', value: any, recovered: boolean } | { status: 'absent' } | { status: 'unreadable', reason: string }>} */
    async function read(owner, folder, name) {
        const decl = registry.folderFileDecl(owner, name);
        if (!decl) {
            return { status: 'unreadable', reason: NOT_PERMITTED };
        }
        const filePath = path.join(folder, name);
        try {
            await assertPath(filePath);
            const st = await fs.lstat(filePath);
            if (!st.isFile()) {
                return { status: 'unreadable', reason: 'not a file' };
            }
            if (st.size > decl.maxBytes) {
                return { status: 'unreadable', reason: 'too large' };
            }
            const text = await fs.readFile(filePath, 'utf8');
            if (Buffer.byteLength(text, 'utf8') > decl.maxBytes) {
                return { status: 'unreadable', reason: 'too large' }; // it grew since the lstat
            }
            try {
                return { status: 'ok', value: JSON.parse(text), recovered: false };
            } catch (err) {
                // A torn file: the writer's in-place write of a held-open file was cut short, and its tmp is the last
                // whole copy (atomic-write.js). Only for a file that does not parse: a missing one stays missing.
                const value = await readRecoveryCopy(filePath, { fs, assertPath, parse: JSON.parse });
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
        const decl = registry.folderFileDecl(owner, name);
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
        if (!registry.folderFileDecl(owner, name)) {
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
