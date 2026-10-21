// Main's second line of defence for .feature_cache.json (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md
// § 7): the per-file record, the read-error classification and retry, the stream parse, and the close check.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { parser: jsonParser } = require('stream-json');
const { pick: jsonPick } = require('stream-json/filters/Pick');
const { streamObject: jsonStreamObject } = require('stream-json/streamers/StreamObject');
const {
    createFeatureCacheLedger,
    validateWriteHeader,
    classifyReadError,
    withReadRetries,
    parseFeatureCacheStream,
    checkClose,
    listMediaFiles,
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
});

describe('validateWriteHeader', () => {
    const ok = { version: 4, featureDim: 64, clipDim: 512, fileCount: 3, clipRequired: false };

    it('accepts a header with a non-negative integer fileCount and a boolean clipRequired', () => {
        expect(validateWriteHeader(ok)).toEqual({ ok: true, version: 4, fileCount: 3, clipRequired: false });
        expect(validateWriteHeader({ ...ok, fileCount: 0, clipRequired: true })).toEqual({
            ok: true,
            version: 4,
            fileCount: 0,
            clipRequired: true,
        });
    });

    it.each([
        ['no header', undefined],
        ['no fileCount', { ...ok, fileCount: undefined }],
        ['a negative fileCount', { ...ok, fileCount: -1 }],
        ['a non-integer fileCount', { ...ok, fileCount: 1.5 }],
        ['an infinite fileCount', { ...ok, fileCount: Infinity }],
        ['a string fileCount', { ...ok, fileCount: '3' }],
        ['no clipRequired', { ...ok, clipRequired: undefined }],
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

describe('checkClose', () => {
    const header = (over = {}) => ({ version: 4, fileCount: 3, clipRequired: false, ...over });
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
        expect(await run({ written: 3, writtenNames: names('a.jpg', 'b.jpg', 'c.jpg') })).toEqual({ ok: true });
    });

    it('refuses unseen when one media file is missing', async () => {
        expect(await run({ written: 2, writtenNames: names('a.jpg', 'b.jpg') })).toMatchObject({
            ok: false,
            refused: 'unseen',
        });
    });

    it('refuses unseen when one CLIP vector is missing and CLIP is required', async () => {
        const all = names('a.jpg', 'b.jpg', 'c.jpg');
        expect(
            await run({
                header: header({ clipRequired: true }),
                written: 3,
                writtenNames: all,
                clipNames: names('a.jpg', 'b.jpg'),
            })
        ).toMatchObject({ ok: false, refused: 'unseen' });
        expect(
            await run({ header: header({ clipRequired: true }), written: 3, writtenNames: all, clipNames: all })
        ).toEqual({ ok: true });
    });

    it('refuses unseen for a folder with no media files', async () => {
        expect(await run({ listFolderMedia: vi.fn(async () => []) })).toMatchObject({ ok: false, refused: 'unseen' });
    });

    it('treats an unreadable record as no record', async () => {
        expect(await run({ record: { seen: 'unreadable' } })).toMatchObject({ ok: false, refused: 'unseen' });
    });

    it('treats absent with an existing destination as no record (a file appeared after the read)', async () => {
        expect(await run({ record: { seen: 'absent' } })).toMatchObject({ ok: false, refused: 'unseen' });
        expect(
            await run({ record: { seen: 'absent' }, written: 3, writtenNames: names('a.jpg', 'b.jpg', 'c.jpg') })
        ).toEqual({ ok: true });
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
});
