// Main's folder-file writer (G2 PR 2, B2): a unique tmp, fsync, rename, one write per target at a time. Real files
// in a temp folder; fs wrappers are injected only where a failure has to be forced.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fsSync = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { createAtomicWriter, readRecoveryCopy, tmpPathFor, TMP_SWEEP_MIN_AGE_MS } = require('../atomic-write.js');
const { withReadRetries } = require('../feature-cache-ledger');

const TMP_NAME = /^\.hash_cache\.json\.[0-9a-f]{12}\.tmp$/;
const errWith = (code) => Object.assign(new Error(code), { code });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noSleepRetries = (fn) => withReadRetries(fn, { sleep: async () => {} });

let dir;
let target;

beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mv-atomic-'));
    target = path.join(dir, '.hash_cache.json');
    await fsp.writeFile(target, 'old', 'utf8');
});

afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
});

const readTarget = () => fsp.readFile(target, 'utf8');
const tmpFiles = async () => (await fsp.readdir(dir)).filter((name) => name.endsWith('.tmp'));

function makeWriter(overrides = {}) {
    return createAtomicWriter({
        fs: fsp,
        assertPath: async () => {},
        withRetries: noSleepRetries,
        ...overrides,
    });
}

/** An fs whose opened handles get `handleOverrides(realHandle, openIndex)` laid over the real FileHandle. */
function fsWithHandles(handleOverrides, extra = {}) {
    let opens = 0;
    return {
        ...fsp,
        open: async (p, flags) => {
            const real = await fsp.open(p, flags);
            const index = opens++;
            return {
                writeFile: (d, enc) => real.writeFile(d, enc),
                sync: () => real.sync(),
                close: () => real.close(),
                ...handleOverrides(real, index),
            };
        },
        ...extra,
    };
}

const DATA = 'n'.repeat(4000);

describe('createAtomicWriter', () => {
    it('writes the new content and leaves no tmp behind', async () => {
        await makeWriter().writeFileAtomic(target, DATA);
        expect(await readTarget()).toBe(DATA);
        expect(await tmpFiles()).toEqual([]);
    });

    it('a write that fails mid-way leaves the old file intact and removes its tmp', async () => {
        const fs = fsWithHandles((real) => ({
            writeFile: async (d, enc) => {
                await real.writeFile(d.slice(0, d.length / 2), enc);
                throw errWith('ENOSPC');
            },
        }));
        await expect(makeWriter({ fs }).writeFileAtomic(target, DATA)).rejects.toMatchObject({ code: 'ENOSPC' });
        expect(await readTarget()).toBe('old');
        expect(await tmpFiles()).toEqual([]);
    });

    it('an interrupted write leaves the old file intact', async () => {
        // The quit-mid-save case: half the data reaches the disk, then the process dies. Closing the real handle
        // models the OS releasing it; the write itself never settles.
        const hang = () => new Promise(() => {});
        const fs = fsWithHandles((real) => ({
            writeFile: async (d, enc) => {
                await real.writeFile(d.slice(0, d.length / 2), enc);
                await real.close();
                return hang();
            },
        }));
        // A direct overwrite through this fs is interrupted the same way.
        fs.writeFile = async (p, d, enc) => {
            await fsp.writeFile(p, d.slice(0, d.length / 2), enc);
            return hang();
        };
        const pending = makeWriter({ fs }).writeFileAtomic(target, DATA);
        pending.catch(() => {});
        await delay(100);
        expect(await readTarget()).toBe('old');
        expect(await tmpFiles()).toHaveLength(1);

        // The next launch: its first write to the target sweeps the orphan, now older than the sweep's minimum age.
        const later = makeWriter({ now: () => Date.now() + 11 * 60_000 });
        await later.writeFileAtomic(target, 'newer');
        expect(await readTarget()).toBe('newer');
        expect(await tmpFiles()).toEqual([]);
    });

    it('a failed rename leaves the old file intact and removes its tmp', async () => {
        const fs = { ...fsp, rename: async () => Promise.reject(errWith('EXDEV')) };
        await expect(makeWriter({ fs }).writeFileAtomic(target, DATA)).rejects.toMatchObject({ code: 'EXDEV' });
        expect(await readTarget()).toBe('old');
        expect(await tmpFiles()).toEqual([]);
    });

    it('two overlapping writes to one target land in call order', async () => {
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        const fs = fsWithHandles((real) => ({
            writeFile: async (d, enc) => {
                if (d === 'first') {
                    await gate;
                }
                return real.writeFile(d, enc);
            },
        }));
        const writer = makeWriter({ fs });
        const first = writer.writeFileAtomic(target, 'first');
        const second = writer.writeFileAtomic(target, 'second');
        // In order, the second cannot finish before the gate opens; out of order, it finishes first.
        await Promise.race([second, delay(200)]);
        release();
        await Promise.all([first, second]);
        expect(await readTarget()).toBe('second');
    });

    it('a write after a failed write still runs', async () => {
        let renames = 0;
        const fs = {
            ...fsp,
            rename: (from, to) => (renames++ === 0 ? Promise.reject(errWith('EXDEV')) : fsp.rename(from, to)),
        };
        const writer = makeWriter({ fs });
        const first = writer.writeFileAtomic(target, 'first');
        const second = writer.writeFileAtomic(target, 'second');
        await expect(first).rejects.toMatchObject({ code: 'EXDEV' });
        await second;
        expect(await readTarget()).toBe('second');
        expect(await tmpFiles()).toEqual([]);
    });

    it('each write uses a fresh tmp name matching the sweep pattern', async () => {
        const opened = [];
        const fs = {
            ...fsp,
            open: (p, flags) => {
                opened.push(p);
                return fsp.open(p, flags);
            },
        };
        const writer = makeWriter({ fs });
        await writer.writeFileAtomic(target, 'one');
        await writer.writeFileAtomic(target, 'two');
        expect(opened).toHaveLength(2);
        expect(opened[0]).not.toBe(opened[1]);
        for (const p of opened) {
            expect(path.dirname(p)).toBe(dir);
            expect(path.basename(p)).toMatch(TMP_NAME);
        }
    });

    it('the tmp and the target are checked before anything is written', async () => {
        const events = [];
        const fs = {
            ...fsp,
            open: (p, flags) => {
                events.push(['open', p]);
                return fsp.open(p, flags);
            },
        };
        const assertPath = async (p) => {
            events.push(['assert', p]);
        };
        await makeWriter({ fs, assertPath, makeId: () => 'abcdef012345' }).writeFileAtomic(target, DATA);
        const tmp = tmpPathFor(target, 'abcdef012345');
        expect(events).toEqual([
            ['assert', tmp],
            ['assert', target],
            ['open', tmp],
        ]);

        await fsp.writeFile(target, 'old', 'utf8');
        const refuseTmp = async (p) => {
            if (p.endsWith('.tmp')) {
                throw new Error('Not permitted: link');
            }
        };
        await expect(makeWriter({ assertPath: refuseTmp }).writeFileAtomic(target, DATA)).rejects.toThrow(
            'Not permitted: link'
        );
        expect(await fsp.readdir(dir)).toEqual(['.hash_cache.json']);
        expect(await readTarget()).toBe('old');
    });

    it('an entry already at the tmp name is neither written nor removed', async () => {
        const id = '0123456789ab';
        const planted = tmpPathFor(target, id);
        await fsp.writeFile(planted, 'sentinel', 'utf8');
        await expect(makeWriter({ makeId: () => id }).writeFileAtomic(target, DATA)).rejects.toMatchObject({
            code: 'EEXIST',
        });
        expect(await fsp.readFile(planted, 'utf8')).toBe('sentinel');
        expect(await readTarget()).toBe('old');
    });

    it('the sweep removes only old orphans of this target', async () => {
        const old = (Date.now() - TMP_SWEEP_MIN_AGE_MS - 60_000) / 1000;
        const oldOrphan = path.join(dir, '.hash_cache.json.111111111111.tmp');
        const youngOrphan = path.join(dir, '.hash_cache.json.222222222222.tmp');
        const otherTarget = path.join(dir, '.sort_cache.json.333333333333.tmp');
        const backup = path.join(dir, '.hash_cache.json.bak');
        for (const p of [oldOrphan, youngOrphan, otherTarget, backup]) {
            fsSync.writeFileSync(p, 'x');
        }
        for (const p of [oldOrphan, otherTarget, backup]) {
            fsSync.utimesSync(p, old, old);
        }
        const readdir = vi.fn((...args) => fsp.readdir(...args));
        const writer = makeWriter({ fs: { ...fsp, readdir } });
        await writer.writeFileAtomic(target, 'one');
        expect(fsSync.existsSync(oldOrphan)).toBe(false);
        expect(fsSync.existsSync(youngOrphan)).toBe(true);
        expect(fsSync.existsSync(otherTarget)).toBe(true);
        expect(fsSync.existsSync(backup)).toBe(true);

        fsSync.writeFileSync(oldOrphan, 'x');
        fsSync.utimesSync(oldOrphan, old, old);
        await writer.writeFileAtomic(target, 'two');
        expect(readdir).toHaveBeenCalledTimes(1);
        expect(fsSync.existsSync(oldOrphan)).toBe(true);
        expect(await readTarget()).toBe('two');
    });

    it('a rename that fails with EPERM twice is retried', async () => {
        const sleep = vi.fn(async () => {});
        let renames = 0;
        const fs = {
            ...fsp,
            rename: (from, to) => (++renames <= 2 ? Promise.reject(errWith('EPERM')) : fsp.rename(from, to)),
        };
        const writer = makeWriter({ fs, withRetries: (fn) => withReadRetries(fn, { sleep }) });
        await writer.writeFileAtomic(target, DATA);
        expect(renames).toBe(3);
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(await readTarget()).toBe(DATA);
        expect(await tmpFiles()).toEqual([]);
    });

    // PR #87 review #2, measured: while another program holds the target open, Windows refuses the rename with EPERM
    // through every retry (~650 ms), even when the reader shares the file for delete. An in-place write succeeds.
    it.each(['EPERM', 'EACCES', 'EBUSY'])(
        'a rename refused with %s through every retry writes the target in place',
        async (code) => {
            const asserted = [];
            const fs = { ...fsp, rename: async () => Promise.reject(errWith(code)) };
            const assertPath = async (p) => {
                asserted.push(path.basename(p));
            };
            await makeWriter({ fs, assertPath, makeId: () => 'abcdef012345' }).writeFileAtomic(target, DATA);
            expect(await readTarget()).toBe(DATA);
            expect(await tmpFiles()).toEqual([]);
            // The target is checked again right before it is opened in place.
            expect(asserted).toEqual(['.hash_cache.json.abcdef012345.tmp', '.hash_cache.json', '.hash_cache.json']);
        }
    );

    it('the in-place write refuses a target that became a link since the first check', async () => {
        let targetChecks = 0;
        const assertPath = async (p) => {
            if (!p.endsWith('.tmp') && ++targetChecks === 2) {
                throw new Error('Not permitted: .hash_cache.json is a link');
            }
        };
        const fs = { ...fsp, rename: async () => Promise.reject(errWith('EPERM')) };
        await expect(makeWriter({ fs, assertPath }).writeFileAtomic(target, DATA)).rejects.toThrow(
            'Not permitted: .hash_cache.json is a link'
        );
        expect(await readTarget()).toBe('old');
        expect(await tmpFiles()).toEqual([]);
    });

    // The user's ruling on PR #87 review #2 (2026-10-24): an in-place write is not crash-safe, so the whole tmp stays
    // until it is complete, and a torn target is read back from it.
    it('an in-place write cut short keeps the whole tmp, and readRecoveryCopy reads it back', async () => {
        const ratings = JSON.stringify({ version: 1, good: ['a.png'], bad: ['b.png'] });
        const fs = {
            ...fsp,
            rename: async () => Promise.reject(errWith('EPERM')),
            writeFile: async (p, d, enc) => {
                await fsp.writeFile(p, d.slice(0, 10), enc); // the crash, or a full disk, mid-overwrite
                throw errWith('ENOSPC');
            },
        };
        await expect(makeWriter({ fs }).writeFileAtomic(target, ratings)).rejects.toMatchObject({ code: 'ENOSPC' });
        expect(() => JSON.parse(fsSync.readFileSync(target, 'utf8'))).toThrow(SyntaxError);
        expect(await tmpFiles()).toHaveLength(1);
        const recovered = await readRecoveryCopy(target, { fs: fsp, assertPath: async () => {}, parse: JSON.parse });
        expect(recovered).toEqual({ version: 1, good: ['a.png'], bad: ['b.png'] });
    });

    it('a failed write sweeps nothing, so an old whole copy survives it', async () => {
        const old = (Date.now() - TMP_SWEEP_MIN_AGE_MS - 60_000) / 1000;
        const copy = path.join(dir, '.hash_cache.json.111111111111.tmp');
        fsSync.writeFileSync(copy, '{"whole":true}');
        fsSync.utimesSync(copy, old, old);
        const fs = { ...fsp, rename: async () => Promise.reject(errWith('EXDEV')) };
        await expect(makeWriter({ fs }).writeFileAtomic(target, DATA)).rejects.toMatchObject({ code: 'EXDEV' });
        expect(fsSync.existsSync(copy)).toBe(true);
    });

    // PR #87 review, held back: some volumes refuse FlushFileBuffers (libuv: EISDIR). The writes before this writer
    // never flushed, so a refused flush must not cost the save.
    it('a refused flush still saves', async () => {
        const fs = fsWithHandles(() => ({ sync: async () => Promise.reject(errWith('EISDIR')) }));
        await makeWriter({ fs }).writeFileAtomic(target, DATA);
        expect(await readTarget()).toBe(DATA);
        expect(await tmpFiles()).toEqual([]);
    });
});

describe('readRecoveryCopy', () => {
    const at = (name, text, ageSeconds) => {
        const p = path.join(dir, name);
        fsSync.writeFileSync(p, text);
        const t = Date.now() / 1000 - ageSeconds;
        fsSync.utimesSync(p, t, t);
        return p;
    };
    const read = (assertPath = async () => {}) => readRecoveryCopy(target, { fs: fsp, assertPath, parse: JSON.parse });

    it('reads the newest tmp that parses, skipping a torn one and one the path check refuses', async () => {
        at('.hash_cache.json.aaaaaaaaaaaa.tmp', '{"n":1}', 300);
        const refused = at('.hash_cache.json.bbbbbbbbbbbb.tmp', '{"n":2}', 200);
        at('.hash_cache.json.cccccccccccc.tmp', '{"n":', 100); // newest, torn
        at('.sort_cache.json.dddddddddddd.tmp', '{"n":4}', 10); // another target's
        at('.hash_cache.json.bak', '{"n":5}', 10); // not a tmp name
        const assertPath = async (p) => {
            if (p === refused) {
                throw new Error('Not permitted: link');
            }
        };
        expect(await read(assertPath)).toEqual({ n: 1 });
        expect(await read()).toEqual({ n: 2 });
    });

    it('returns null when no tmp parses', async () => {
        expect(await read()).toBeNull();
        at('.hash_cache.json.aaaaaaaaaaaa.tmp', 'not json', 100);
        expect(await read()).toBeNull();
    });
});

describe('tmpPathFor', () => {
    it('names the tmp beside its target', () => {
        expect(tmpPathFor(path.join('C:', 'x', '.bulk_rated.json'), 'abc')).toBe(
            path.join('C:', 'x', '.bulk_rated.json.abc.tmp')
        );
    });
});
