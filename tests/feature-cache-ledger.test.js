// Main's second line of defence for .feature_cache.json (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md
// § 7): the per-file record, the read-error classification and retry, the stream parse, and the close check.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable, Writable } = require('stream');
const { parser: jsonParser } = require('stream-json');
const { pick: jsonPick } = require('stream-json/filters/Pick');
const { streamObject: jsonStreamObject } = require('stream-json/streamers/StreamObject');
const {
    createFeatureCacheLedger,
    validateWriteHeader,
    classifyReadError,
    withReadRetries,
    parseFeatureCacheStream,
    readFeatureCacheFile,
    openWriteStream,
    writeWithBackpressure,
    endWriteStream,
    cacheFileExists,
    featureCacheKey,
    checkClose,
    listMediaFiles,
    listMediaEntries,
} = require('../feature-cache-ledger');
const { isMediaFile } = require('../media-formats');

const JSON_STREAM = { parser: jsonParser, pick: jsonPick, streamObject: jsonStreamObject };
const errWith = (code) => Object.assign(new Error(code || 'parse failed'), code ? { code } : {});

describe('createFeatureCacheLedger', () => {
    it('keeps the last record per file, and a write records what it wrote', () => {
        const ledger = createFeatureCacheLedger();
        expect(ledger.get('/A/.feature_cache.json')).toBeNull();
        ledger.recordOpen('/A/.feature_cache.json', { seen: 'absent' });
        expect(ledger.get('/A/.feature_cache.json')).toEqual({ seen: 'absent' });
        ledger.recordWrite('/A/.feature_cache.json', { count: 12, version: 4 });
        expect(ledger.get('/A/.feature_cache.json')).toEqual({ seen: 'read', count: 12, version: 4 });
        expect(ledger.get('/B/.feature_cache.json')).toBeNull();
    });

    it('keeps a read record when a later open of the same file fails as unreadable (review #8)', () => {
        // The source folder is also the like folder: Phase 1 reads the file, then training's open fails past the
        // retries. The visit's next save would be refused as `unseen`, with a false "never read" warning.
        const ledger = createFeatureCacheLedger();
        ledger.recordOpen('/A/.feature_cache.json', { seen: 'read', count: 9, version: 4 });
        ledger.recordOpen('/A/.feature_cache.json', { seen: 'unreadable' });
        expect(ledger.get('/A/.feature_cache.json')).toEqual({ seen: 'read', count: 9, version: 4 });
        // Any other open still replaces it: the file is gone, or no longer parses.
        ledger.recordOpen('/A/.feature_cache.json', { seen: 'corrupt' });
        expect(ledger.get('/A/.feature_cache.json')).toEqual({ seen: 'corrupt' });
        ledger.recordOpen('/A/.feature_cache.json', { seen: 'unreadable' });
        expect(ledger.get('/A/.feature_cache.json')).toEqual({ seen: 'unreadable' });
    });

    it('counts the writes to each file: the generation starts at 0 and only a write moves it (review #5)', () => {
        const ledger = createFeatureCacheLedger();
        expect(ledger.generation('/A/.feature_cache.json')).toBe(0);
        ledger.recordOpen('/A/.feature_cache.json', { seen: 'read', count: 3, version: 4 });
        expect(ledger.generation('/A/.feature_cache.json')).toBe(0);
        expect(ledger.recordWrite('/A/.feature_cache.json', { count: 4, version: 4 })).toBe(1);
        expect(ledger.recordWrite('/A/.feature_cache.json', { count: 5, version: 4 })).toBe(2);
        expect(ledger.generation('/A/.feature_cache.json')).toBe(2);
        expect(ledger.generation('/B/.feature_cache.json')).toBe(0);
    });
});

describe('validateWriteHeader', () => {
    const ok = { version: 4, featureDim: 64, clipDim: 512, fileCount: 3 };

    it('accepts a header with a non-negative integer fileCount', () => {
        expect(validateWriteHeader(ok)).toEqual({ ok: true, version: 4, fileCount: 3, basisGen: null });
        expect(validateWriteHeader({ ...ok, fileCount: 0 })).toEqual({
            ok: true,
            version: 4,
            fileCount: 0,
            basisGen: null,
        });
    });

    it('takes an optional basisGen: the generation of the file the writer last read or wrote', () => {
        expect(validateWriteHeader({ ...ok, basisGen: 0 })).toMatchObject({ ok: true, basisGen: 0 });
        expect(validateWriteHeader({ ...ok, basisGen: 7 })).toMatchObject({ ok: true, basisGen: 7 });
        expect(validateWriteHeader({ ...ok, basisGen: null })).toMatchObject({ ok: true, basisGen: null });
    });

    it.each([
        ['no header', undefined],
        ['no fileCount', { ...ok, fileCount: undefined }],
        ['a negative fileCount', { ...ok, fileCount: -1 }],
        ['a non-integer fileCount', { ...ok, fileCount: 1.5 }],
        ['an infinite fileCount', { ...ok, fileCount: Infinity }],
        ['a string fileCount', { ...ok, fileCount: '3' }],
        ['a negative basisGen', { ...ok, basisGen: -1 }],
        ['a non-integer basisGen', { ...ok, basisGen: 0.5 }],
        ['a string basisGen', { ...ok, basisGen: '1' }],
    ])('refuses %s', (_label, header) => {
        expect(validateWriteHeader(header)).toMatchObject({ ok: false, error: expect.any(String) });
    });
});

describe('classifyReadError', () => {
    it.each([
        ['ENOENT', 'absent'],
        ['EBUSY', 'retry'],
        ['EPERM', 'retry'],
        ['EACCES', 'retry'],
        [undefined, 'corrupt'],
        ['EISDIR', 'unreadable'],
    ])('%s → %s', (code, kind) => {
        expect(classifyReadError(errWith(code))).toBe(kind);
    });
});

describe('withReadRetries', () => {
    it('retries EBUSY 4 times, 150 ms apart, and succeeds on the 5th', async () => {
        const sleep = vi.fn(async () => {});
        let calls = 0;
        const result = await withReadRetries(
            async () => {
                calls++;
                if (calls < 5) {
                    throw errWith('EBUSY');
                }
                return 'read';
            },
            { sleep }
        );
        expect(result).toBe('read');
        expect(calls).toBe(5);
        expect(sleep.mock.calls).toEqual([[150], [150], [150], [150]]);
    });

    it('gives up after 5 attempts and rethrows the last error', async () => {
        const sleep = vi.fn(async () => {});
        const fn = vi.fn(async () => {
            throw errWith('EPERM');
        });
        await expect(withReadRetries(fn, { sleep })).rejects.toMatchObject({ code: 'EPERM' });
        expect(fn).toHaveBeenCalledTimes(5);
    });

    it('stops at once on ENOENT', async () => {
        const sleep = vi.fn(async () => {});
        const fn = vi.fn(async () => {
            throw errWith('ENOENT');
        });
        await expect(withReadRetries(fn, { sleep })).rejects.toMatchObject({ code: 'ENOENT' });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });
});

describe('parseFeatureCacheStream', () => {
    let dir;
    afterEach(() => {
        if (dir) {
            fs.rmSync(dir, { recursive: true, force: true });
            dir = null;
        }
    });

    it('settles with an error when the source stream errors (EISDIR)', async () => {
        // The pre-fix open built this chain with .pipe() and listened for errors on the last stage only: a read-stream
        // error was unhandled and the open never answered (plan Progress Log, the 2026-10-21 probe).
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ledger-'));
        const settled = parseFeatureCacheStream(fs.createReadStream(dir), JSON_STREAM).then(
            () => 'resolved',
            (err) => err.code
        );
        const timeout = new Promise((resolve) => setTimeout(() => resolve('hung'), 2000));
        expect(await Promise.race([settled, timeout])).toBe('EISDIR');
    });

    it('parses a small v4 file into [name, entry] pairs', async () => {
        const body = JSON.stringify({
            version: 4,
            featureDim: 64,
            clipDim: 512,
            features: {
                'a.jpg': { vector: [0.1], clipVector: null, size: 1, mtime: 2 },
                'b.jpg': { vector: [0.2], clipVector: [0.3], size: 3, mtime: 4 },
            },
        });
        const entries = await parseFeatureCacheStream(Readable.from([body]), JSON_STREAM);
        expect(entries).toEqual([
            ['a.jpg', { vector: [0.1], clipVector: null, size: 1, mtime: 2 }],
            ['b.jpg', { vector: [0.2], clipVector: [0.3], size: 3, mtime: 4 }],
        ]);
    });

    it('rejects a truncated file with an error that has no code (corrupt)', async () => {
        const body = '{"version":4,"featureDim":64,"clipDim":512,"features":{"a.jpg":{"vector":[0.1';
        const err = await parseFeatureCacheStream(Readable.from([body]), JSON_STREAM).catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBeUndefined();
        expect(classifyReadError(err)).toBe('corrupt');
    });
});

describe('readFeatureCacheFile', () => {
    const body = JSON.stringify({
        version: 4,
        featureDim: 64,
        clipDim: 512,
        features: { 'a.jpg': { vector: [0.1], clipVector: null, size: 1, mtime: 2 } },
    });
    const failing = (code) => {
        const s = new Readable({ read() {} });
        process.nextTick(() => s.destroy(errWith(code)));
        return s;
    };
    // A fake fs whose head reads (the ones given `end`) fail with `code` the first `headFailures` times.
    const fakeFs = ({ text = body, headFailures = 0, code = 'EBUSY' } = {}) => {
        let heads = 0;
        return {
            access: vi.fn(async () => {}),
            createReadStream: vi.fn((_p, opts) => {
                if (opts && opts.end !== undefined && heads++ < headFailures) {
                    return failing(code);
                }
                return Readable.from([text]);
            }),
            json: JSON_STREAM,
            sleep: vi.fn(async () => {}),
        };
    };

    it('reads the version and the entries', async () => {
        expect(await readFeatureCacheFile('/A/.feature_cache.json', fakeFs())).toEqual({
            version: 4,
            entries: [['a.jpg', { vector: [0.1], clipVector: null, size: 1, mtime: 2 }]],
        });
    });

    it('retries a head read that hits a brief lock, so the version is never lost (review #1)', async () => {
        // The lock is released inside the ~0.5 ms between the head's open and the parse's: the head fails, the parse
        // succeeds. A null version turned off both shrink guards (review #1: 24,000 entries → 5).
        const deps = fakeFs({ headFailures: 1 });
        const read = await readFeatureCacheFile('/A/.feature_cache.json', deps);
        expect(read.version).toBe(4);
        expect(deps.sleep).toHaveBeenCalledTimes(1);
    });

    it('rejects, as unreadable, a head read that fails with another I/O error', async () => {
        const err = await readFeatureCacheFile(
            '/A/.feature_cache.json',
            fakeFs({ headFailures: 1, code: 'EIO' })
        ).catch((e) => e);
        expect(classifyReadError(err)).toBe('unreadable');
    });

    it('rejects, as unreadable, a parsed file whose head names no version', async () => {
        const text = JSON.stringify({ features: { 'a.jpg': { vector: [0.1], size: 1, mtime: 2 } } });
        const err = await readFeatureCacheFile('/A/.feature_cache.json', fakeFs({ text })).catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        expect(classifyReadError(err)).toBe('unreadable');
    });
});

describe('the write stream (review #3)', () => {
    // A stream main can no longer write (a read-only share, a full disk, the folder deleted in Explorer) must fail the
    // IPC call. Before, write-open returned success, the async error was uncaught in main, write-chunk waited for a
    // 'drain' that never came, and the renderer's IO lock was held for the rest of the session.
    const HUNG = 'hung';
    const within = (promise, ms = 1000) =>
        Promise.race([
            promise.then(
                () => 'resolved',
                (err) => err.code || err.message
            ),
            new Promise((resolve) => setTimeout(() => resolve(HUNG), ms)),
        ]);
    const failingWritable = (code) =>
        new Writable({
            highWaterMark: 1,
            write(_chunk, _enc, cb) {
                setTimeout(() => cb(errWith(code)), 5);
            },
        });
    let dir;
    afterEach(() => {
        if (dir) {
            fs.rmSync(dir, { recursive: true, force: true });
            dir = null;
        }
    });

    it('openWriteStream rejects when the temp file cannot be created', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ledger-'));
        const tmp = path.join(dir, 'gone', '.feature_cache.json.tmp');
        expect(await within(openWriteStream(tmp, fs.createWriteStream))).toBe('ENOENT');
    });

    it('openWriteStream resolves once the file is open, and the stream writes', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ledger-'));
        const tmp = path.join(dir, '.feature_cache.json.tmp');
        const stream = await openWriteStream(tmp, fs.createWriteStream);
        await writeWithBackpressure(stream, '{"a":');
        await endWriteStream(stream, '1}');
        expect(fs.readFileSync(tmp, 'utf-8')).toBe('{"a":1}');
    });

    it('writeWithBackpressure rejects when the stream fails before it drains', async () => {
        const stream = failingWritable('ENOSPC');
        stream.on('error', () => {}); // the listener openWriteStream attaches
        expect(await within(writeWithBackpressure(stream, 'x'.repeat(64)))).toBe('ENOSPC');
    });

    it('writeWithBackpressure and endWriteStream reject on a stream that has already failed', async () => {
        const stream = failingWritable('ENOSPC');
        stream.on('error', () => {});
        stream.destroy(errWith('ENOSPC'));
        await new Promise((resolve) => setImmediate(resolve));
        expect(await within(writeWithBackpressure(stream, 'x'))).not.toBe(HUNG);
        expect(await within(endWriteStream(stream, '}}'))).not.toBe(HUNG);
        expect(await within(endWriteStream(stream, '}}'))).not.toBe('resolved');
    });
});

describe('featureCacheKey (review #9)', () => {
    // The key is the folder's canonical path from path-grants, so a folder opened through a junction and the same
    // folder saved as the like folder share one record. canonicalize falls back to the JS realpath where the native
    // call throws (deep review #4); the old key fell back to the raw spelling.
    it('keys every spelling of one folder to one record', async () => {
        const canonicalize = vi.fn(async (p) => (p === '/J' || p === '/real' ? '/real' : null));
        const a = await featureCacheKey('/J', canonicalize);
        const b = await featureCacheKey('/real', canonicalize);
        expect(a).toBe(b);
        expect(a).toBe(path.join('/real', '.feature_cache.json'));
    });

    it('falls back to the resolved path when canonicalize refuses', async () => {
        expect(await featureCacheKey('/other', async () => null)).toBe(
            path.join(path.resolve('/other'), '.feature_cache.json')
        );
    });
});

describe('cacheFileExists (review #13)', () => {
    // Only "no such file" lets checkClose skip its rules. Any other failure (a one-shot SMB error, EPERM) fails
    // closed: the file is treated as there, so `unseen` and `shrink` still apply.
    it.each([
        ['ENOENT', false],
        ['EPERM', true],
        ['EACCES', true],
        ['EBUSY', true],
        ['ECONNRESET', true],
        ['ETIMEDOUT', true],
        ['UNKNOWN', true],
        ['EIO', true],
    ])('%s → %s', async (code, exists) => {
        expect(await cacheFileExists('/A/.feature_cache.json', async () => Promise.reject(errWith(code)))).toBe(exists);
    });

    it('true when access succeeds', async () => {
        expect(await cacheFileExists('/A/.feature_cache.json', async () => {})).toBe(true);
    });
});

describe('checkClose', () => {
    const header = (over = {}) => ({ version: 4, fileCount: 3, basisGen: null, ...over });
    const names = (...n) => new Set(n);
    const run = (over) =>
        checkClose({
            record: null,
            destinationExists: true,
            header: header(),
            written: 1,
            writtenNames: names('a.jpg'),
            clipNames: names(),
            listFolderMedia: vi.fn(async () => ['a.jpg', 'b.jpg', 'c.jpg']),
            ...over,
        });

    it('refuses unseen: no record, the file exists, and the write is partial', async () => {
        expect(await run({})).toEqual({ ok: false, refused: 'unseen', seen: null, written: 1 });
    });

    it('allows unseen with full coverage', async () => {
        const all = names('a.jpg', 'b.jpg', 'c.jpg');
        expect(await run({ written: 3, writtenNames: all, clipNames: all })).toEqual({ ok: true });
    });

    it('refuses unseen when one media file is missing', async () => {
        expect(await run({ written: 2, writtenNames: names('a.jpg', 'b.jpg') })).toMatchObject({
            ok: false,
            refused: 'unseen',
        });
    });

    it('refuses unseen when one CLIP vector is missing', async () => {
        const all = names('a.jpg', 'b.jpg', 'c.jpg');
        expect(await run({ written: 3, writtenNames: all, clipNames: names('a.jpg', 'b.jpg') })).toMatchObject({
            ok: false,
            refused: 'unseen',
        });
    });

    it('unseen needs a CLIP vector for every file, whatever the header says (review #2)', async () => {
        // main cannot know what an unread file holds: with CLIP off, a 64-dim copy erased the CLIP vectors on disk.
        const all = names('a.jpg', 'b.jpg', 'c.jpg');
        expect(
            await run({
                header: { ...header(), clipRequired: false },
                written: 3,
                writtenNames: all,
                clipNames: names(),
            })
        ).toMatchObject({ ok: false, refused: 'unseen' });
    });

    it('refuses unseen for a folder with no media files', async () => {
        expect(await run({ listFolderMedia: vi.fn(async () => []) })).toMatchObject({ ok: false, refused: 'unseen' });
    });

    it('treats an unreadable record as no record', async () => {
        expect(await run({ record: { seen: 'unreadable' } })).toMatchObject({ ok: false, refused: 'unseen' });
    });

    it('treats absent with an existing destination as no record (a file appeared after the read)', async () => {
        expect(await run({ record: { seen: 'absent' } })).toMatchObject({ ok: false, refused: 'unseen' });
        const all = names('a.jpg', 'b.jpg', 'c.jpg');
        expect(await run({ record: { seen: 'absent' }, written: 3, writtenNames: all, clipNames: all })).toEqual({
            ok: true,
        });
    });

    it('refuses shrink: read 2,000, written 3, fileCount 2,000', async () => {
        expect(
            await run({
                record: { seen: 'read', count: 2000, version: 4 },
                header: header({ fileCount: 2000 }),
                written: 3,
            })
        ).toEqual({ ok: false, refused: 'shrink', seen: 2000, written: 3 });
    });

    it('allows a real shrink: read 2,000, written 500, fileCount 500', async () => {
        expect(
            await run({
                record: { seen: 'read', count: 2000, version: 4 },
                header: header({ fileCount: 500 }),
                written: 500,
            })
        ).toEqual({ ok: true });
    });

    it('allows a version change (read v3, header v4)', async () => {
        expect(
            await run({
                record: { seen: 'read', count: 2000, version: 3 },
                header: header({ fileCount: 2000 }),
                written: 3,
            })
        ).toEqual({ ok: true });
    });

    it('keeps the shrink rule when either version is unknown (review #1)', async () => {
        // Only a known version change skips it. The open no longer records a null version, and this holds if
        // anything ever does.
        const shrink = { header: header({ fileCount: 24000 }), written: 50 };
        expect(await run({ ...shrink, record: { seen: 'read', count: 24000, version: null } })).toMatchObject({
            ok: false,
            refused: 'shrink',
        });
        expect(
            await run({
                ...shrink,
                header: header({ fileCount: 24000, version: null }),
                record: { seen: 'read', count: 24000, version: 4 },
            })
        ).toMatchObject({ ok: false, refused: 'shrink' });
    });

    it('allows corrupt, and absent when no file has appeared', async () => {
        expect(await run({ record: { seen: 'corrupt' } })).toEqual({ ok: true });
        expect(await run({ record: { seen: 'absent' }, destinationExists: false })).toEqual({ ok: true });
    });

    it('allows anything when the destination does not exist', async () => {
        expect(
            await run({
                record: { seen: 'read', count: 2000, version: 4 },
                header: header({ fileCount: 2000 }),
                written: 3,
                destinationExists: false,
            })
        ).toEqual({ ok: true });
        expect(await run({ destinationExists: false })).toEqual({ ok: true });
    });

    it('refuses stale: the file was written since the generation the writer is based on (review #5)', async () => {
        // The source folder is also a like folder: the visit read the file at generation 0, then training wrote it.
        // The visit's copy lacks training's entries, so it may not replace them, whatever its count.
        const read = { seen: 'read', count: 2000, version: 4 };
        expect(
            await run({
                record: read,
                header: header({ fileCount: 2000, basisGen: 0 }),
                written: 1520,
                generation: 1,
            })
        ).toEqual({ ok: false, refused: 'stale', seen: 2000, written: 1520 });
        expect(
            await run({ record: { seen: 'absent' }, header: header({ basisGen: 0 }), written: 3, generation: 1 })
        ).toEqual({ ok: false, refused: 'stale', seen: null, written: 3 });
    });

    it('a basis equal to the generation goes on to the other rules', async () => {
        const read = { seen: 'read', count: 2000, version: 4 };
        const base = { record: read, header: header({ fileCount: 2000, basisGen: 1 }), generation: 1 };
        expect(await run({ ...base, written: 2000 })).toEqual({ ok: true });
        expect(await run({ ...base, written: 3 })).toMatchObject({ ok: false, refused: 'shrink' });
    });

    it('a write with no basis (the training path) is not checked for staleness', async () => {
        const read = { seen: 'read', count: 2000, version: 4 };
        expect(
            await run({
                record: read,
                header: header({ fileCount: 2000, basisGen: null }),
                written: 2000,
                generation: 5,
            })
        ).toEqual({ ok: true });
    });

    it('a stale writer may still write when no file is there', async () => {
        expect(
            await run({ destinationExists: false, header: header({ basisGen: 0 }), written: 1, generation: 3 })
        ).toEqual({ ok: true });
    });

    it('lists the folder only for the coverage case', async () => {
        const list = vi.fn(async () => ['a.jpg']);
        await run({ record: { seen: 'read', count: 2000, version: 4 }, listFolderMedia: list });
        await run({ record: { seen: 'corrupt' }, listFolderMedia: list });
        await run({ destinationExists: false, listFolderMedia: list });
        expect(list).not.toHaveBeenCalled();
        await run({ listFolderMedia: list });
        expect(list).toHaveBeenCalledTimes(1);
    });
});

describe('listMediaFiles', () => {
    let dir;
    afterEach(() => {
        if (dir) {
            fs.rmSync(dir, { recursive: true, force: true });
            dir = null;
        }
    });

    it('lists the media files the way load-folder does: files only, by extension, the cache itself excluded', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ledger-'));
        for (const name of ['a.jpg', 'B.PNG', 'notes.txt', '.feature_cache.json']) {
            fs.writeFileSync(path.join(dir, name), 'x');
        }
        fs.mkdirSync(path.join(dir, 'sub.jpg'));
        expect((await listMediaFiles(dir, isMediaFile)).sort()).toEqual(['B.PNG', 'a.jpg']);
    });

    it('leaves out a media file whose stat fails, as load-folder does (review #7)', async () => {
        // A name readdir returns but stat cannot open (the review reproduced it with a lone-surrogate name on NTFS):
        // load-folder drops it, so the renderer's list never holds it. Kept here, it made the folder uncoverable.
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ledger-'));
        for (const name of ['a.jpg', 'b.jpg']) {
            fs.writeFileSync(path.join(dir, name), 'x');
        }
        const realStat = fs.promises.stat;
        const spy = vi
            .spyOn(fs.promises, 'stat')
            .mockImplementation((p, ...rest) =>
                path.basename(String(p)) === 'b.jpg' ? Promise.reject(errWith('ENOENT')) : realStat(p, ...rest)
            );
        try {
            expect(await listMediaFiles(dir, isMediaFile)).toEqual(['a.jpg']);
        } finally {
            spy.mockRestore();
        }
    });

    it('gives load-folder each file with its stat, in listing order', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ledger-'));
        fs.writeFileSync(path.join(dir, 'a.jpg'), 'xy');
        fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
        const listed = await listMediaEntries(dir, isMediaFile);
        expect(listed.map((e) => [e.name, e.path, e.stats.size])).toEqual([['a.jpg', path.join(dir, 'a.jpg'), 2]]);
    });
});
