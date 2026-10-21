// FeatureCacheStore (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md § 5, § 7.3): the folder
// visit, its cache state, the read, the frozen-copy save queue and the refusal handling. The load and save suites
// that media-viewer-utils.test.js held for the old renderer methods are ported here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    FeatureCacheStore,
    decideSave,
    coversFolder,
    refusalMessage,
    DROPPED_WORK_MESSAGE,
    AUTOSAVE_MS,
    MAX_AUTO_REREADS,
    READ_CHUNK,
    WRITE_BATCH,
} from '../feature-cache-store.js';
import { FakeMain, makeFiles, settle } from './feature-cache-harness.js';

/** The store's io over FakeMain, late-bound so a test can replace one of main's calls. */
function ioFor(main) {
    return {
        open: (folder) => main.api.featureCacheOpen(folder),
        chunk: (offset, limit) => main.api.featureCacheChunk(offset, limit),
        close: () => main.api.featureCacheClose(),
        writeOpen: (folder, header) => main.api.featureCacheWriteOpen(folder, header),
        writeChunk: (batch) => main.api.featureCacheWriteChunk(batch),
        writeClose: () => main.api.featureCacheWriteClose(),
    };
}

/** A store over `main`, with the host's three maps and its file list in `host`. */
function makeStore(main, { files = [], clip = false, version = 4, timers } = {}) {
    const host = {
        featureCache: new Map(),
        clipCache: new Map(),
        featureMetadata: new Map(),
        files,
        clip,
    };
    const notify = vi.fn();
    const logError = vi.fn();
    const store = new FeatureCacheStore({
        io: ioFor(main),
        getMaps: () => host,
        getMediaFiles: () => host.files,
        getConfig: () => ({ featureCacheVersion: version, enableClipFeatures: host.clip }),
        basename: (p) => String(p).split('/').pop(),
        logError,
        notify,
        ...(timers ? { timers } : {}),
    });
    return { store, host, notify, logError };
}

/** The host's part of a folder change: the old visit ends, the maps and list are reset, a new visit begins. */
function switchTo(store, host, folder, files) {
    store.endVisit();
    host.featureCache.clear();
    host.clipCache.clear();
    host.featureMetadata.clear();
    host.files = files;
    return store.beginVisit(folder);
}

const vec = (v = 0.5) => new Float32Array(64).fill(v);
const clipVec = (v = 0.25) => new Float32Array(512).fill(v);

/** Main answers the open with `count` entries on disk and empty chunks: the visit reads with that baseline. */
async function readWithBaseline(main, store, count) {
    main.api.featureCacheOpen = async () => ({ success: true, version: 4, count });
    main.api.featureCacheChunk = async () => ({ entries: [] });
    await store.ensureRead();
}

const frozen = (over) => ({
    state: 'read',
    baseline: 0,
    entries: [],
    fileCount: 0,
    covers: false,
    ...over,
});

let main;
beforeEach(() => {
    main = new FakeMain();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('decideSave', () => {
    const n = (k) => Array.from({ length: k }, () => ['x', vec(), null, 1, 1]);

    it('blocked → no write', () => {
        expect(decideSave(frozen({ state: 'blocked', entries: n(3) }))).toEqual({ write: false, reason: 'blocked' });
    });
    it('no entries → no write', () => {
        expect(decideSave(frozen({ state: 'absent', entries: [] }))).toEqual({ write: false, reason: 'empty' });
    });
    it('unread, not covering → no write', () => {
        expect(decideSave(frozen({ state: 'unread', entries: n(3), fileCount: 2000 }))).toEqual({
            write: false,
            reason: 'unread',
        });
    });
    it('unread, covering → write', () => {
        expect(decideSave(frozen({ state: 'unread', entries: n(3), fileCount: 3, covers: true }))).toEqual({
            write: true,
        });
    });
    it('read 23,559 with 32 entries in a 20,929-file folder → the shrink guard', () => {
        expect(decideSave(frozen({ state: 'read', baseline: 23559, entries: n(32), fileCount: 20929 }))).toEqual({
            write: false,
            reason: 'shrink-guard',
        });
    });
    it('read 5,000 with 500 entries in a 500-file folder → write (a real shrink)', () => {
        expect(decideSave(frozen({ state: 'read', baseline: 5000, entries: n(500), fileCount: 500 }))).toEqual({
            write: true,
        });
    });
    it('absent → write', () => {
        expect(decideSave(frozen({ state: 'absent', entries: n(3), fileCount: 2000 }))).toEqual({ write: true });
    });
    it('discard → write', () => {
        expect(decideSave(frozen({ state: 'discard', entries: n(3), fileCount: 2000 }))).toEqual({ write: true });
    });
});

describe('coversFolder', () => {
    const entry = (name, clip = null) => [name, vec(), clip, 1, 1];

    it('is true when every file has an entry, with a clip vector when CLIP is required', () => {
        expect(coversFolder(['a', 'b'], [entry('a', clipVec()), entry('b', clipVec())], true)).toBe(true);
    });
    it('is false when one file has no entry', () => {
        expect(coversFolder(['a', 'b'], [entry('a')], false)).toBe(false);
    });
    it('is false when one entry lacks its clip vector and CLIP is required', () => {
        expect(coversFolder(['a', 'b'], [entry('a', clipVec()), entry('b')], true)).toBe(false);
    });
    it('is true for a missing clip vector when CLIP is not required', () => {
        expect(coversFolder(['a', 'b'], [entry('a'), entry('b')], false)).toBe(true);
    });
    it('is false for an empty folder', () => {
        expect(coversFolder([], [], false)).toBe(false);
    });
});

describe('messages', () => {
    it('formats the shrink refusal with grouped counts', () => {
        expect(refusalMessage({ refused: 'shrink', seen: 2000, written: 3 })).toBe(
            'Feature cache not saved: it would have replaced 2,000 cached entries with 3. The cache on disk is unchanged.'
        );
    });
    it('formats the unseen refusal, and names a training folder when given its label', () => {
        expect(refusalMessage({ refused: 'unseen', seen: null, written: 3, label: 'Training cache for "likes"' })).toBe(
            'Training cache for "likes" not saved: this folder\'s cache was never read in this session. The cache on disk is unchanged.'
        );
    });
    it('pins the dropped-work text', () => {
        expect(DROPPED_WORK_MESSAGE).toBe(
            "Couldn't read this folder's feature cache, so the new features weren't saved."
        );
    });
    it('pins the batch sizes and the autosave period', () => {
        expect([READ_CHUNK, WRITE_BATCH, AUTOSAVE_MS]).toEqual([1000, 1000, 30000]);
    });
});

describe('the visit', () => {
    it('beginVisit returns a frozen token that is current until the visit ends', () => {
        const { store } = makeStore(main);
        expect(store.visit).toBeNull();
        const v = store.beginVisit('/A');
        expect(Object.isFrozen(v)).toBe(true);
        expect(v.folder).toBe('/A');
        expect(store.isCurrent(v)).toBe(true);
        expect(store.getState()).toEqual({ state: 'unread', baseline: null, dirty: false });
        store.endVisit();
        expect(store.isCurrent(v)).toBe(false);
        expect(store.visit).toBeNull();
        expect(store.getState()).toEqual({ state: 'none', baseline: null, dirty: false });
    });

    it('a write for a visit that is not current changes nothing', () => {
        const files = makeFiles('/A', 'a', 2);
        const { store, host } = makeStore(main, { files });
        const old = store.beginVisit('/A');
        switchTo(store, host, '/B', makeFiles('/B', 'b', 2));
        expect(store.putFeature(old, '/A/a0.jpg', vec())).toBe(false);
        expect(store.putClip(old, '/A/a0.jpg', clipVec())).toBe(false);
        expect(host.featureCache.size).toBe(0);
        expect(host.clipCache.size).toBe(0);
        expect(store.getState().dirty).toBe(false);
    });

    it("putFeature records the file's size and mtime and makes the visit dirty", () => {
        const files = makeFiles('/A', 'a', 2);
        const { store, host } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        expect(store.putFeature(v, '/A/a1.jpg', vec())).toBe(true);
        expect(host.featureMetadata.get('/A/a1.jpg')).toEqual({ size: 1001, mtime: 5001 });
        expect(store.getState().dirty).toBe(true);
    });

    it('needsRead is true for unread and blocked only', async () => {
        const files = makeFiles('/A', 'a', 3);
        const { store, host } = makeStore(main, { files });
        store.beginVisit('/A');
        expect(store.needsRead()).toBe(true); // unread
        await store.ensureRead(); // no file
        expect(store.getState().state).toBe('absent');
        expect(store.needsRead()).toBe(false);
        main.seed('/B', makeFiles('/B', 'b', 3));
        switchTo(store, host, '/B', makeFiles('/B', 'b', 3));
        await store.ensureRead();
        expect(store.getState().state).toBe('read');
        expect(store.needsRead()).toBe(false);
        // An unexplained refusal blocks the visit; a blocked visit reads again.
        main.api.featureCacheWriteClose = async () => ({ success: false, refused: 'shrink', seen: 3, written: 1 });
        await store.requestSave();
        expect(store.getState().state).toBe('blocked');
        expect(store.needsRead()).toBe(true);
        main.api.featureCacheOpen = async () => ({ success: false, corrupt: true, error: 'bad json' });
        switchTo(store, host, '/C', makeFiles('/C', 'c', 1));
        await store.ensureRead();
        expect(store.getState().state).toBe('discard');
        expect(store.needsRead()).toBe(false);
        expect(store.visit).not.toBeNull();
        store.endVisit();
        expect(store.needsRead()).toBe(false); // no visit
    });
});

describe('ensureRead: ported from loadFeatureCache incremental + signal', () => {
    function mkFile(name, size, mtime) {
        return { name, path: '/d/' + name, size, mtimeMs: mtime };
    }
    function mkEntry(size, mtime) {
        return { vector: Array.from({ length: 64 }, () => 0.1), clipVector: null, size, mtime };
    }
    function installApi(chunks, { version = 4, count } = {}) {
        const all = chunks.flat();
        main.api.featureCacheOpen = async () => ({ success: true, version, count: count ?? all.length });
        main.api.featureCacheChunk = async (offset, limit) => ({ entries: all.slice(offset, offset + limit) });
    }
    function binaryApi(chunk) {
        main.api.featureCacheOpen = async () => ({ success: true, version: 4, count: chunk.names.length });
        main.api.featureCacheChunk = async () => chunk;
    }

    it('populates the feature cache incrementally and reports progress', async () => {
        const files = [mkFile('a.png', 10, 100), mkFile('b.png', 20, 200)];
        installApi([
            [
                ['a.png', mkEntry(10, 100)],
                ['b.png', mkEntry(20, 200)],
            ],
        ]);
        const { store, host } = makeStore(main, { files });
        store.beginVisit('/d');
        const seen = [];
        await store.ensureRead({ onProgress: (c, t) => seen.push([c, t]) });
        expect(host.featureCache.size).toBe(2);
        expect(seen[seen.length - 1][0]).toBe(2); // final progress reached total
    });

    it('stops on signal.aborted without loading everything', async () => {
        const files = Array.from({ length: 5 }, (_, i) => mkFile(`f${i}.png`, i, i));
        installApi([files.map((f) => [f.name, mkEntry(f.size, f.mtimeMs)])], { count: 5 });
        const { store, host } = makeStore(main, { files });
        store.beginVisit('/d');
        const controller = new AbortController();
        controller.abort(); // aborted before the first chunk
        await store.ensureRead({ signal: controller.signal });
        expect(host.featureCache.size).toBe(0);
        expect(store.getState().state).toBe('unread');
    });

    it('leaves an existing cache untouched when the file is not found', async () => {
        const { store, host } = makeStore(main, { files: [mkFile('a.png', 10, 100)] });
        const v = store.beginVisit('/d');
        const existing = vec(0.3);
        store.putFeature(v, '/d/a.png', existing);
        await store.ensureRead(); // FakeMain has no /d: notFound
        expect(host.featureCache.size).toBe(1);
        expect(host.featureCache.get('/d/a.png')).toBe(existing);
        expect(store.getState().state).toBe('absent');
    });

    it('a cancelled mid-load leaves the existing cache untouched (no truncation)', async () => {
        // DATA-LOSS REGRESSION LOCK. A partial read must never reach the maps: the autosave would write it.
        // 1500 files → two chunks. Abort after the first chunk's progress.
        const files = Array.from({ length: 1500 }, (_, i) => mkFile(`f${i}.png`, i, i));
        installApi([files.map((f) => [f.name, mkEntry(f.size, f.mtimeMs)])], { count: 1500 });
        const { store, host } = makeStore(main, { files });
        const v = store.beginVisit('/d');
        store.putFeature(v, '/d/old1.png', vec());
        store.putFeature(v, '/d/old2.png', vec());
        const controller = new AbortController();
        await store.ensureRead({
            signal: controller.signal,
            onProgress: (loaded) => {
                if (loaded >= 1) {
                    controller.abort();
                }
            },
        });
        expect(host.featureCache.size).toBe(2); // prior entries intact, not truncated
        expect(host.featureCache.has('/d/old1.png')).toBe(true);
        expect(host.featureCache.has('/d/f0.png')).toBe(false); // no staged reload key leaked in
        expect(store.getState().state).toBe('unread');
    });

    it('a mid-stream throw leaves the visit unread and the maps untouched', async () => {
        // Changed on purpose (spec my calls 2 and 6): there is no legacy single-read fallback any more.
        const files = Array.from({ length: 1500 }, (_, i) => mkFile(`f${i}.png`, i, i));
        const all = files.map((f) => [f.name, mkEntry(f.size, f.mtimeMs)]);
        main.api.featureCacheOpen = async () => ({ success: true, version: 4, count: 1500 });
        main.api.featureCacheChunk = async (offset) => {
            if (offset === 0) {
                return { entries: all.slice(0, 1000) };
            }
            throw new Error('IPC hiccup on chunk 2');
        };
        const close = vi.spyOn(main.api, 'featureCacheClose');
        const { store, host, logError } = makeStore(main, { files });
        store.beginVisit('/d');
        await store.ensureRead();
        expect(host.featureCache.size).toBe(0);
        expect(store.getState().state).toBe('unread');
        expect(close).toHaveBeenCalledTimes(1); // the session is released
        expect(logError).toHaveBeenCalledWith('Feature-cache read failed for /d: IPC hiccup on chunk 2');
    });

    it('consumes the binary chunk shape (vecBuf/clipBuf) into the caches', async () => {
        const vecs = new Float32Array(64).fill(0.5);
        const clips = new Float32Array(512).fill(0.25);
        binaryApi({
            names: ['a.png'],
            sizes: [10],
            mtimes: [100],
            hasClip: [1],
            vecBuf: vecs.buffer,
            clipBuf: clips.buffer,
        });
        const { store, host } = makeStore(main, { files: [mkFile('a.png', 10, 100)] });
        store.beginVisit('/d');
        await store.ensureRead();
        expect(host.featureCache.get('/d/a.png')[0]).toBeCloseTo(0.5);
        expect(host.clipCache.get('/d/a.png')[0]).toBeCloseTo(0.25);
    });

    it('does NOT cache a clip vector for a binary entry with hasClip=0 (garbage clipBuf ignored)', async () => {
        const vecs = new Float32Array(64).fill(0.5);
        const clips = new Float32Array(512).fill(0.9); // deliberate non-zero garbage in the unused slot
        binaryApi({
            names: ['a.png'],
            sizes: [10],
            mtimes: [100],
            hasClip: [0],
            vecBuf: vecs.buffer,
            clipBuf: clips.buffer,
        });
        const { store, host } = makeStore(main, { files: [mkFile('a.png', 10, 100)] });
        store.beginVisit('/d');
        await store.ensureRead();
        expect(host.featureCache.get('/d/a.png')[0]).toBeCloseTo(0.5); // 64-dim vector still lands
        expect(host.clipCache.has('/d/a.png')).toBe(false); // no garbage clip leaked in
    });

    it('round-trips distinct vectors for a multi-entry binary chunk (i*64 / i*512 offset math)', async () => {
        const vecs = new Float32Array(2 * 64);
        vecs.fill(0.25, 0, 64);
        vecs.fill(0.75, 64, 128);
        const clips = new Float32Array(2 * 512);
        clips.fill(0.1, 0, 512);
        clips.fill(0.2, 512, 1024);
        binaryApi({
            names: ['a.png', 'b.png'],
            sizes: [10, 20],
            mtimes: [100, 200],
            hasClip: [1, 1],
            vecBuf: vecs.buffer,
            clipBuf: clips.buffer,
        });
        const { store, host } = makeStore(main, { files: [mkFile('a.png', 10, 100), mkFile('b.png', 20, 200)] });
        store.beginVisit('/d');
        await store.ensureRead();
        expect(host.featureCache.get('/d/a.png')[0]).toBeCloseTo(0.25);
        expect(host.featureCache.get('/d/b.png')[0]).toBeCloseTo(0.75);
        expect(host.clipCache.get('/d/a.png')[0]).toBeCloseTo(0.1);
        expect(host.clipCache.get('/d/b.png')[0]).toBeCloseTo(0.2);
    });

    it('ingests an entry whose size/mtime EXACTLY match the current file as a cache HIT', async () => {
        // The staleness gate compares with strict !==; both sides come from the same fs.stat values.
        const size = 5368709123; // > 2^32 and past Float32 exact-integer range (2^24)
        const mtime = 1673456789012.345; // sub-ms fractional mtimeMs
        installApi([[['a.png', mkEntry(size, mtime)]]]);
        const { store, host } = makeStore(main, { files: [mkFile('a.png', size, mtime)] });
        store.beginVisit('/d');
        await store.ensureRead();
        expect(host.featureCache.size).toBe(1); // HIT — not dropped as stale
        expect(host.featureMetadata.get('/d/a.png')).toEqual({ size, mtime });
    });
});

describe('ensureRead: the visit', () => {
    it('a read that ended stale changes no state', async () => {
        main.seed('/A', makeFiles('/A', 'a', 1500));
        const { store, host } = makeStore(main, { files: makeFiles('/A', 'a', 1500) });
        store.beginVisit('/A');
        const release = main.hold('featureCacheOpen', 1);
        const read = store.ensureRead();
        await release.reached;
        store.endVisit();
        expect(store.getState()).toEqual({ state: 'none', baseline: null, dirty: false });
        host.files = makeFiles('/B', 'b', 10);
        store.beginVisit('/B');
        release();
        await read;
        expect(store.getState()).toEqual({ state: 'unread', baseline: null, dirty: false });
        expect(host.featureCache.size).toBe(0);
    });

    it('a cancel seen after the last chunk commits nothing', async () => {
        const files = makeFiles('/A', 'a', 1500);
        main.seed('/A', files);
        const { store, host } = makeStore(main, { files });
        store.beginVisit('/A');
        const controller = new AbortController();
        const release = main.hold('featureCacheChunk', 2); // the last of two chunks
        const read = store.ensureRead({ signal: controller.signal });
        await release.reached;
        controller.abort();
        release();
        await read;
        expect(host.featureCache.size).toBe(0);
        expect(store.getState().state).toBe('unread');
    });

    it("a read requested by the current visit never joins an older visit's read", async () => {
        main.seed('/A', makeFiles('/A', 'a', 10));
        main.seed('/B', makeFiles('/B', 'b', 10));
        const { store, host } = makeStore(main, { files: makeFiles('/A', 'a', 10) });
        store.beginVisit('/A');
        const release = main.hold('featureCacheOpen', 1);
        const readA = store.ensureRead();
        await release.reached;
        switchTo(store, host, '/B', makeFiles('/B', 'b', 10));
        const readB = store.ensureRead();
        expect(readB).not.toBe(readA);
        release();
        await Promise.all([readA, readB]);
        expect(host.featureCache.has('/B/b0.jpg')).toBe(true);
        expect([...host.featureCache.keys()].every((p) => p.startsWith('/B/'))).toBe(true);
        expect(store.getState()).toEqual({ state: 'read', baseline: 10, dirty: false });
    });

    it("the merge keeps this visit's extractions and lets the disk entry win on a shared path", async () => {
        const files = makeFiles('/A', 'a', 3);
        main.seed('/A', files.slice(0, 2)); // a0, a1 on disk
        const { store, host } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        const extracted0 = vec(0.9);
        const extracted2 = vec(0.8);
        store.putFeature(v, '/A/a0.jpg', extracted0); // also on disk
        store.putFeature(v, '/A/a2.jpg', extracted2); // only in memory
        await store.ensureRead();
        expect(host.featureCache.size).toBe(3);
        expect(host.featureCache.get('/A/a0.jpg')[0]).toBeCloseTo(0.1); // the disk entry won
        expect(host.featureCache.get('/A/a2.jpg')).toBe(extracted2); // kept
        expect(store.getState()).toEqual({ state: 'read', baseline: 2, dirty: true });
    });

    it('a version mismatch is discard and keeps the in-memory entries', async () => {
        main.seed('/A', makeFiles('/A', 'a', 3));
        const { store, host } = makeStore(main, { files: makeFiles('/A', 'a', 3), version: 5 });
        const v = store.beginVisit('/A');
        store.putFeature(v, '/A/a2.jpg', vec());
        await store.ensureRead();
        expect(store.getState().state).toBe('discard');
        expect(host.featureCache.size).toBe(1);
        expect(main.writes).toHaveLength(0);
    });

    it('corrupt is discard; unreadable stays unread and logs once', async () => {
        const { store, host, logError } = makeStore(main, { files: makeFiles('/A', 'a', 3) });
        main.api.featureCacheOpen = async () => ({ success: false, corrupt: true, error: 'Unexpected token' });
        store.beginVisit('/A');
        await store.ensureRead();
        expect(store.getState().state).toBe('discard');

        main.api.featureCacheOpen = async () => ({ success: false, unreadable: true, error: 'EBUSY' });
        switchTo(store, host, '/B', makeFiles('/B', 'b', 3));
        await store.ensureRead();
        await store.ensureRead();
        expect(store.getState().state).toBe('unread');
        expect(logError.mock.calls.filter(([m]) => m === 'Feature-cache read failed for /B: EBUSY')).toHaveLength(1);
    });

    it('a second ensureRead in a read visit does not open the file', async () => {
        main.seed('/A', makeFiles('/A', 'a', 3));
        const open = vi.spyOn(main.api, 'featureCacheOpen');
        const { store } = makeStore(main, { files: makeFiles('/A', 'a', 3) });
        store.beginVisit('/A');
        await store.ensureRead();
        expect(await store.ensureRead()).toBe(3);
        expect(open).toHaveBeenCalledTimes(1);
    });
});

describe('requestSave: ported from saveFeatureCache data-loss guards', () => {
    // DATA-LOSS REGRESSION LOCKS. A real user lost a 23,559-entry / 126MB .feature_cache.json: entries serialized
    // as size:0/mtime:0 were rejected at the next load, and the resulting 32-entry map was auto-saved over the
    // full cache. Both guards below must stay armed.
    function fill(store, v, n, prefix = '/d/f') {
        for (let i = 0; i < n; i++) {
            store.putFeature(v, `${prefix}${i}.png`, vec());
        }
    }
    const dFiles = (n) =>
        Array.from({ length: n }, (_, i) => ({
            name: `f${i}.png`,
            path: `/d/f${i}.png`,
            size: 100 + i,
            mtimeMs: 1000 + i,
        }));

    it('blocks the catastrophe: 32 in-memory entries never replace a 23,559-entry disk cache', async () => {
        const { store, logError } = makeStore(main, { files: dFiles(20929) });
        const v = store.beginVisit('/d');
        await readWithBaseline(main, store, 23559);
        fill(store, v, 32);
        const result = await store.requestSave();
        expect(result).toEqual({ outcome: 'skipped', reason: 'shrink-guard' });
        expect(main.writes).toHaveLength(0); // not even the streaming open
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('shrink guard'));
        expect(store.getState().baseline).toBe(23559); // untouched by the skipped save
    });

    it('allows a legitimate prune: the folder really shrank, so the smaller map must persist', async () => {
        const { store } = makeStore(main, { files: dFiles(5000) });
        const v = store.beginVisit('/d');
        await readWithBaseline(main, store, 23559);
        fill(store, v, 5000);
        const result = await store.requestSave();
        expect(result).toEqual({ outcome: 'written', written: 5000 });
        expect(main.entriesOf('/d').size).toBe(5000);
        expect(store.getState().baseline).toBe(5000); // re-baselined to what was written
    });

    it('allows a fresh build-up when the visit found no file (absent)', async () => {
        const { store } = makeStore(main, { files: dFiles(20929) });
        const v = store.beginVisit('/d');
        await store.ensureRead(); // notFound
        fill(store, v, 500);
        await store.requestSave();
        expect(main.entriesOf('/d').size).toBe(500);
        expect(store.getState()).toEqual({ state: 'read', baseline: 500, dirty: false });
    });

    it('writes nothing when the visit is unread and the copy does not cover the folder', async () => {
        const { store } = makeStore(main, { files: dFiles(20929) });
        const v = store.beginVisit('/d');
        fill(store, v, 500);
        expect(await store.requestSave()).toEqual({ outcome: 'skipped', reason: 'unread' });
        expect(main.writes).toHaveLength(0);
        expect(store.getState().dirty).toBe(true);
    });

    it('skips unresolvable entries rather than poisoning them with size:0/mtime:0', async () => {
        const { store, host } = makeStore(main, {
            files: [{ name: 'live.png', path: '/d/live.png', size: 222, mtimeMs: 2222 }],
        });
        store.beginVisit('/d');
        await store.ensureRead(); // absent
        // `meta.png` has metadata; `live.png` has none but is in the list; `orphan.png` has neither.
        host.featureCache.set('/d/meta.png', vec(0.1));
        host.featureCache.set('/d/live.png', vec(0.2));
        host.featureCache.set('/d/orphan.png', vec(0.3));
        host.featureMetadata.set('/d/meta.png', { size: 111, mtime: 1111 });
        await store.requestSave();
        const written = main.entriesOf('/d');
        expect([...written.keys()]).toEqual(['meta.png', 'live.png']);
        expect(written.get('meta.png')).toMatchObject({ size: 111, mtime: 1111 });
        expect(written.get('live.png')).toMatchObject({ size: 222, mtime: 2222 });
        for (const entry of written.values()) {
            expect(entry.size).not.toBe(0);
            expect(entry.mtime).not.toBe(0);
        }
        expect(store.getState().baseline).toBe(2); // counts what was written, not the map size (3)
    });

    it('a refused write-open saves nothing and keeps the shrink baseline', async () => {
        const { store } = makeStore(main, { files: dFiles(1) });
        const v = store.beginVisit('/d');
        await readWithBaseline(main, store, 7);
        fill(store, v, 1);
        main.api.featureCacheWriteOpen = vi.fn(async () => ({ success: false, error: 'Not permitted' }));
        const chunk = vi.spyOn(main.api, 'featureCacheWriteChunk');
        const result = await store.requestSave();
        expect(result.outcome).toBe('failed');
        expect(chunk).not.toHaveBeenCalled();
        expect(store.getState()).toEqual({ state: 'read', baseline: 7, dirty: true });
    });

    it('sends the header main checks: version, dims, fileCount, clipRequired and the basis', async () => {
        const { store } = makeStore(main, { files: dFiles(3), clip: true });
        const v = store.beginVisit('/d');
        main.api.featureCacheOpen = async () => ({ success: false, notFound: true, gen: 2 });
        await store.ensureRead();
        fill(store, v, 2);
        await store.requestSave();
        expect(main.writesTo('/d')[0].header).toEqual({
            version: 4,
            featureDim: 64,
            clipDim: 512,
            fileCount: 3,
            clipRequired: true,
            basisGen: 2,
        });
    });

    it("the basis is the generation of the visit's last read or successful write", async () => {
        const rmain = new FakeMain({ rules: true });
        const files = dFiles(3);
        rmain.list('/d', files);
        rmain.seed('/d', files.slice(0, 1));
        const { store } = makeStore(rmain, { files });
        const v = store.beginVisit('/d');
        await store.ensureRead(); // generation 0
        fill(store, v, 2);
        await store.requestSave(); // generation 1
        fill(store, v, 3);
        await store.requestSave();
        expect(rmain.writesTo('/d').map((w) => w.header.basisGen)).toEqual([0, 1]);
        expect(rmain.writesTo('/d').every((w) => w.closed)).toBe(true);
    });
});

describe('requestSave: the frozen copy and the queue', () => {
    async function readVisit(files, folder = '/A') {
        main.seed(folder, files);
        const ctx = makeStore(main, { files });
        const v = ctx.store.beginVisit(folder);
        await ctx.store.ensureRead();
        return { ...ctx, v };
    }

    it('the copy is frozen at the request', async () => {
        const files = makeFiles('/A', 'a', 4);
        const { store, host, v } = await readVisit(files.slice(0, 3));
        host.files = files;
        const save = store.requestSave();
        store.putFeature(v, '/A/a3.jpg', vec());
        host.featureCache.delete('/A/a0.jpg');
        expect(await save).toEqual({ outcome: 'written', written: 3 });
        expect(main.writesTo('/A')).toHaveLength(1);
        expect([...main.entriesOf('/A').keys()]).toEqual(['a0.jpg', 'a1.jpg', 'a2.jpg']);
    });

    it('a request while a save streams queues behind it with its own copy', async () => {
        const files = makeFiles('/A', 'a', 5);
        const { store, host, v } = await readVisit(files.slice(0, 3));
        host.files = files;
        const release = main.hold('featureCacheWriteChunk', 1);
        const first = store.requestSave();
        await release.reached;
        store.putFeature(v, '/A/a3.jpg', vec());
        const second = store.requestSave();
        expect(second).not.toBe(first);
        release();
        await Promise.all([first, second]);
        expect(main.writesTo('/A').map((w) => w.entries.size)).toEqual([3, 4]);
        expect(main.entriesOf('/A').has('a3.jpg')).toBe(true);
    });

    it('two queued requests for one visit coalesce to the newer copy', async () => {
        const files = makeFiles('/A', 'a', 6);
        const { store, host, v } = await readVisit(files.slice(0, 3));
        host.files = files;
        const release = main.hold('featureCacheWriteChunk', 1);
        const first = store.requestSave();
        await release.reached;
        store.putFeature(v, '/A/a3.jpg', vec());
        const second = store.requestSave();
        store.putFeature(v, '/A/a4.jpg', vec());
        const third = store.requestSave();
        expect(third).toBe(second);
        release();
        await Promise.all([first, second]);
        expect(main.writesTo('/A').map((w) => w.entries.size)).toEqual([3, 5]);
    });

    it('a success re-baselines the current visit to the count written', async () => {
        const files = makeFiles('/A', 'a', 4);
        const { store, host, v } = await readVisit(files.slice(0, 3));
        host.files = files;
        expect(store.getState().baseline).toBe(3);
        store.putFeature(v, '/A/a3.jpg', vec());
        await store.requestSave();
        expect(store.getState()).toEqual({ state: 'read', baseline: 4, dirty: false });
    });

    it('a success for a visit that already ended leaves the current visit alone', async () => {
        const files = makeFiles('/A', 'a', 4);
        const { store, host, v } = await readVisit(files.slice(0, 3));
        host.files = files;
        store.putFeature(v, '/A/a3.jpg', vec());
        const release = main.hold('featureCacheWriteClose', 1);
        const flush = store.endVisit();
        await release.reached;
        switchTo(store, host, '/B', makeFiles('/B', 'b', 2));
        release();
        expect(await flush).toEqual({ outcome: 'written', written: 4 });
        expect(main.entriesOf('/A').size).toBe(4);
        expect(store.getState()).toEqual({ state: 'unread', baseline: null, dirty: false });
    });

    it('dirty stays set when an entry arrived during the save', async () => {
        const files = makeFiles('/A', 'a', 5);
        const { store, host, v } = await readVisit(files.slice(0, 3));
        host.files = files;
        store.putFeature(v, '/A/a3.jpg', vec());
        const release = main.hold('featureCacheWriteChunk', 1);
        const save = store.requestSave();
        await release.reached;
        store.putFeature(v, '/A/a4.jpg', vec());
        release();
        await save;
        expect(store.getState()).toEqual({ state: 'read', baseline: 4, dirty: true });
    });

    it('endVisit flushes a dirty visit and returns null for a clean one', async () => {
        const files = makeFiles('/A', 'a', 4);
        const { store, host, v } = await readVisit(files.slice(0, 3));
        host.files = files;
        expect(store.endVisit()).toBeNull();
        store.beginVisit('/A');
        const v2 = store.visit;
        expect(v2).not.toBe(v);
        await store.ensureRead();
        store.putFeature(v2, '/A/a3.jpg', vec());
        const flush = store.endVisit();
        expect(flush).toBeInstanceOf(Promise);
        expect(await flush).toEqual({ outcome: 'written', written: 4 });
    });
});

describe('refusals (spec § 7.3)', () => {
    it("an explained refusal reads the file again, then saves it with the visit's work, and shows nothing", async () => {
        // Review Focus 5: the source folder is also the like folder, and training wrote its cache mid-visit. The D4
        // amendment's "adopts main's count" became a re-read (review #4).
        const rmain = new FakeMain({ rules: true });
        const files = makeFiles('/A', 'a', 40);
        rmain.list('/A', files);
        const { store, host, notify, logError } = makeStore(rmain, { files });
        const v = store.beginVisit('/A');
        await store.ensureRead(); // absent
        await rmain.trainingWrite(store, '/A', files);
        store.putFeature(v, '/A/a0.jpg', vec());
        expect(await store.requestSave()).toEqual({ outcome: 'refused', reason: 'stale', written: 1 });
        expect(store.getState()).toEqual({ state: 'unread', baseline: null, dirty: true }); // re-reading
        await settle();
        expect(store.getState()).toEqual({ state: 'read', baseline: 40, dirty: false });
        expect(host.featureCache.size).toBe(40);
        expect(notify).not.toHaveBeenCalled();
        expect(logError.mock.calls).toEqual([
            [
                'Feature-cache save refused by main (stale) for /A: seen 40, written 1 — explained, the file changed after this visit looked',
            ],
        ]);
    });

    it('a copy frozen before the re-read is skipped as superseded', async () => {
        const rmain = new FakeMain({ rules: true });
        const files = makeFiles('/A', 'a', 10);
        rmain.list('/A', files);
        rmain.seed('/A', files.slice(0, 5));
        const { store } = makeStore(rmain, { files });
        const v = store.beginVisit('/A');
        await store.ensureRead(); // read 5
        await rmain.trainingWrite(store, '/A', files); // all 10
        store.putFeature(v, '/A/a5.jpg', vec());
        const release = rmain.hold('featureCacheWriteClose', 2); // the visit's first close (training's was the 1st)
        const refused = store.requestSave();
        await release.reached;
        store.putFeature(v, '/A/a6.jpg', vec());
        const queued = store.requestSave(); // frozen with 7 entries, before the re-read
        release();
        expect(await refused).toMatchObject({ outcome: 'refused', reason: 'stale' });
        expect(await queued).toEqual({ outcome: 'skipped', reason: 'superseded' });
        await settle();
        expect(rmain.entriesOf('/A').size).toBe(10);
        expect(store.getState()).toEqual({ state: 'read', baseline: 10, dirty: false });
    });

    it('a main that keeps refusing gets three re-reads, then the warning and a block', async () => {
        // Each explained refusal re-reads; past MAX_AUTO_REREADS in a row with no write between, the next counts as
        // unexplained, so a main bug cannot loop the visit on the lock.
        const files = makeFiles('/A', 'a', 3);
        main.seed('/A', files);
        const { store, notify } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        await store.ensureRead();
        store.putFeature(v, '/A/a0.jpg', vec());
        const opens = vi.spyOn(main.api, 'featureCacheOpen');
        main.api.featureCacheWriteClose = async () => ({ success: false, refused: 'stale', seen: 3, written: 3 });
        await store.requestSave();
        await settle(60);
        expect(opens).toHaveBeenCalledTimes(MAX_AUTO_REREADS);
        expect(store.getState().state).toBe('blocked');
        expect(notify.mock.calls).toEqual([[refusalMessage({ refused: 'stale', seen: 3, written: 3 }), 'warning']]);
    });

    it('an unexplained refusal warns once per visit and blocks', async () => {
        const files = makeFiles('/A', 'a', 4);
        main.seed('/A', files.slice(0, 3));
        const { store, notify, logError } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        await store.ensureRead(); // read 3
        store.putFeature(v, '/A/a3.jpg', vec());
        main.api.featureCacheWriteClose = async () => ({ success: false, refused: 'shrink', seen: 2000, written: 4 });
        await store.requestSave();
        expect(store.getState().state).toBe('blocked');
        expect(await store.saveIfDirty()).toEqual({ outcome: 'skipped', reason: 'blocked' });
        await store.ensureRead(); // a blocked visit reads again
        expect(store.getState().state).toBe('read');
        await store.requestSave(); // refused again
        expect(store.getState().state).toBe('blocked');
        expect(notify.mock.calls).toEqual([[refusalMessage({ refused: 'shrink', seen: 2000, written: 4 }), 'warning']]);
        expect(logError.mock.calls.filter(([m]) => m.startsWith('Feature-cache save refused by main'))).toEqual([
            ['Feature-cache save refused by main (shrink) for /A: seen 2000, written 4'],
            ['Feature-cache save refused by main (shrink) for /A: seen 2000, written 4'],
        ]);
    });

    it('an unexplained refusal of the flush on leave warns, naming the folder left', async () => {
        // D4 holds for the most common save too: by the time main answers, another folder is on screen, so the
        // warning names the one the save was for.
        const files = makeFiles('/A', 'a', 4);
        main.seed('/A', files.slice(0, 3));
        const { store, host, notify } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        await store.ensureRead(); // read 3
        store.putFeature(v, '/A/a3.jpg', vec());
        main.api.featureCacheWriteClose = async () => ({ success: false, refused: 'shrink', seen: 2000, written: 4 });
        const flush = store.endVisit();
        switchTo(store, host, '/B', makeFiles('/B', 'b', 3));
        expect(await flush).toEqual({ outcome: 'refused', reason: 'shrink', written: 4 });
        expect(notify.mock.calls).toEqual([
            [refusalMessage({ refused: 'shrink', seen: 2000, written: 4, label: 'Feature cache for "A"' }), 'warning'],
        ]);
        expect(store.getState()).toEqual({ state: 'unread', baseline: null, dirty: false }); // B is untouched
    });

    it('an explained refusal of the flush on leave is only logged', async () => {
        const files = makeFiles('/A', 'a', 3);
        const { store, host, notify, logError } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        await store.ensureRead(); // absent
        store.putFeature(v, '/A/a0.jpg', vec());
        main.api.featureCacheWriteClose = async () => ({ success: false, refused: 'unseen', seen: null, written: 1 });
        const flush = store.endVisit();
        switchTo(store, host, '/B', makeFiles('/B', 'b', 3));
        await flush;
        expect(notify).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledTimes(1);
    });
});

describe('a write behind the visit (review #4, #5, #14)', () => {
    // FakeMain with main's real rules. The source folder is also a like folder, so the training step writes the
    // visit's own cache file behind the store (cacheIo shares only the lock).
    let rmain;
    beforeEach(() => {
        rmain = new FakeMain({ rules: true });
    });

    it("a read visit's save after a training write keeps training's entries, silently (#5 i)", async () => {
        const files = makeFiles('/L', 'l', 20);
        rmain.list('/L', files);
        rmain.seed('/L', files.slice(0, 15));
        const { store, notify } = makeStore(rmain, { files });
        const v = store.beginVisit('/L');
        await store.ensureRead(); // read 15
        await rmain.trainingWrite(store, '/L', files); // all 20
        store.putFeature(v, files[15].path, vec()); // Phase 2 re-extracts one of the five the visit lacks
        await store.requestSave(); // 16: passes both 50% rules, so main alone cannot stop it
        await settle();
        expect(rmain.entriesOf('/L').size).toBe(20);
        expect(notify).not.toHaveBeenCalled();
    });

    it('a training write never turns into a false refusal warning (#5 ii)', async () => {
        const files = makeFiles('/L', 'l', 20);
        rmain.list('/L', files);
        rmain.seed('/L', files.slice(0, 6));
        const { store, notify } = makeStore(rmain, { files });
        const v = store.beginVisit('/L');
        await store.ensureRead(); // read 6
        await rmain.trainingWrite(store, '/L', files); // all 20
        store.putFeature(v, files[6].path, vec()); // 7: under half of training's 20
        await store.requestSave();
        await settle();
        expect(notify).not.toHaveBeenCalled();
        expect(store.getState()).toMatchObject({ state: 'read', dirty: false });
        expect(rmain.entriesOf('/L').size).toBe(20);
    });

    it('an absent visit re-reads after a training write instead of adopting its count (#4)', async () => {
        const files = makeFiles('/L', 'l', 20);
        rmain.list('/L', files);
        const { store, host, notify } = makeStore(rmain, { files });
        const v = store.beginVisit('/L');
        await store.ensureRead(); // absent
        await rmain.trainingWrite(store, '/L', files); // all 20
        store.putFeature(v, files[0].path, vec());
        await store.requestSave(); // refused, explained
        await settle();
        // Then an interrupted Phase 2: 11 more entries, past half of 20. Adopting the count let this save shrink
        // the file to 12; the visit now holds what it read.
        for (const f of files.slice(1, 12)) {
            store.putFeature(v, f.path, vec());
        }
        await store.requestSave();
        await settle();
        expect(host.featureCache.size).toBe(20);
        expect(rmain.entriesOf('/L').size).toBe(20);
        expect(notify).not.toHaveBeenCalled();
    });

    it("a re-opened folder's save keeps what the old visit's flush wrote after its read (#14)", async () => {
        const aFiles = makeFiles('/A', 'a', 6);
        const bFiles = makeFiles('/B', 'b', 2);
        rmain.list('/A', aFiles);
        rmain.seed('/A', aFiles.slice(0, 3));
        const { store, host } = makeStore(rmain, { files: aFiles });
        const v1 = store.beginVisit('/A');
        await store.ensureRead(); // read 3
        store.putFeature(v1, aFiles[3].path, vec());
        const release = rmain.hold('featureCacheWriteChunk', 1);
        const streaming = store.requestSave(); // S: 4 entries
        await release.reached;
        store.putFeature(v1, aFiles[4].path, vec()); // after S froze
        switchTo(store, host, '/B', bFiles); // the flush F: 5 entries, queued behind S
        const v2 = switchTo(store, host, '/A', aFiles);
        const reread = store.ensureRead(); // takes the lock ahead of F, so it reads S's file
        release();
        await Promise.all([streaming, reread]);
        await settle();
        expect(rmain.entriesOf('/A').has('a4.jpg')).toBe(true); // F wrote it
        store.putFeature(v2, aFiles[5].path, vec());
        await store.requestSave();
        await settle();
        expect(rmain.entriesOf('/A').has('a4.jpg')).toBe(true);
        expect(rmain.entriesOf('/A').size).toBe(6);
    });
});

describe('dropped work (spec D2 amendment)', () => {
    it('finishExtractionRun warns once when the read failed and the copy does not cover the folder', async () => {
        const files = makeFiles('/A', 'a', 3);
        const { store, notify } = makeStore(main, { files });
        main.api.featureCacheOpen = async () => ({ success: false, unreadable: true, error: 'EACCES' });
        const v = store.beginVisit('/A');
        await store.ensureRead();
        store.putFeature(v, '/A/a0.jpg', vec());
        expect(await store.finishExtractionRun(v)).toEqual({ outcome: 'skipped', reason: 'unread' });
        store.putFeature(v, '/A/a1.jpg', vec());
        await store.finishExtractionRun(v);
        expect(notify.mock.calls).toEqual([[DROPPED_WORK_MESSAGE, 'warning']]);
        expect(main.writes).toHaveLength(0);
    });

    it('finishExtractionRun saves a copy that covers the folder even when the read failed', async () => {
        const files = makeFiles('/A', 'a', 2);
        const { store, notify } = makeStore(main, { files });
        main.api.featureCacheOpen = async () => ({ success: false, unreadable: true, error: 'EACCES' });
        const v = store.beginVisit('/A');
        await store.ensureRead();
        store.putFeature(v, '/A/a0.jpg', vec());
        store.putFeature(v, '/A/a1.jpg', vec());
        expect(await store.finishExtractionRun(v)).toEqual({ outcome: 'written', written: 2 });
        expect(notify).not.toHaveBeenCalled();
    });

    it('finishExtractionRun does not warn after a cancelled read', async () => {
        const files = makeFiles('/A', 'a', 3);
        main.seed('/A', files);
        const { store, notify } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        const controller = new AbortController();
        controller.abort();
        await store.ensureRead({ signal: controller.signal });
        store.putFeature(v, '/A/a0.jpg', vec());
        await store.finishExtractionRun(v);
        expect(notify).not.toHaveBeenCalled();
    });

    it('finishExtractionRun for a visit that ended does nothing', async () => {
        const files = makeFiles('/A', 'a', 3);
        const { store, host } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        switchTo(store, host, '/B', makeFiles('/B', 'b', 3));
        expect(await store.finishExtractionRun(v)).toBeNull();
        expect(main.writes).toHaveLength(0);
    });
});

describe('Review Focus', () => {
    it("a read queued behind another folder's save reads its own folder", async () => {
        // RF1: a folder switch, then an AI sort, while the old folder's flush is still streaming.
        const aFiles = makeFiles('/A', 'a', 4);
        main.seed('/A', aFiles.slice(0, 3));
        main.seed('/B', makeFiles('/B', 'b', 5));
        const { store, host } = makeStore(main, { files: aFiles });
        const v = store.beginVisit('/A');
        await store.ensureRead();
        store.putFeature(v, '/A/a3.jpg', vec());
        const opens = vi.spyOn(main.api, 'featureCacheOpen');
        const release = main.hold('featureCacheWriteChunk', 1);
        const flush = store.endVisit();
        await release.reached;
        host.featureCache.clear();
        host.clipCache.clear();
        host.featureMetadata.clear();
        host.files = makeFiles('/B', 'b', 5);
        store.beginVisit('/B');
        const readB = store.ensureRead();
        await settle(10);
        expect(opens).not.toHaveBeenCalled(); // waiting behind A's write on the lock
        release();
        await Promise.all([flush, readB]);
        expect(main.entriesOf('/A').size).toBe(4);
        expect(opens.mock.calls).toEqual([['/B']]);
        expect(host.featureCache.size).toBe(5);
        expect([...host.featureCache.keys()].every((p) => p.startsWith('/B/'))).toBe(true);
    });

    it('rapid switches write only the folder that had work', async () => {
        // RF3: A → B → C before A's flush finishes.
        const aFiles = makeFiles('/A', 'a', 4);
        main.seed('/A', aFiles.slice(0, 3));
        const { store, host } = makeStore(main, { files: aFiles });
        const v = store.beginVisit('/A');
        await store.ensureRead();
        store.putFeature(v, '/A/a3.jpg', vec());
        const release = main.hold('featureCacheWriteClose', 1);
        switchTo(store, host, '/B', makeFiles('/B', 'b', 3));
        await release.reached;
        switchTo(store, host, '/C', makeFiles('/C', 'c', 3));
        release();
        await settle();
        expect(main.writes.map((w) => w.folder)).toEqual(['/A']);
        expect(main.entriesOf('/A').size).toBe(4);
        expect(store.getState()).toEqual({ state: 'unread', baseline: null, dirty: false });
    });

    it('a visit whose read failed reads again next time', async () => {
        // RF4: the cache was unreadable (antivirus held it), then readable later in the visit.
        const files = makeFiles('/A', 'a', 4);
        main.seed('/A', files.slice(0, 3));
        const realOpen = main.api.featureCacheOpen;
        main.api.featureCacheOpen = async () => ({ success: false, unreadable: true, error: 'EBUSY' });
        const { store, host, notify } = makeStore(main, { files });
        const v = store.beginVisit('/A');
        await store.ensureRead();
        expect(store.needsRead()).toBe(true);
        store.putFeature(v, '/A/a3.jpg', vec());
        await store.finishExtractionRun(v); // warns: the work cannot be saved yet
        main.api.featureCacheOpen = realOpen;
        await store.ensureRead();
        expect(store.getState().state).toBe('read');
        expect(host.featureCache.size).toBe(4);
        expect(await store.finishExtractionRun(v)).toEqual({ outcome: 'written', written: 4 });
        expect(notify.mock.calls).toEqual([[DROPPED_WORK_MESSAGE, 'warning']]);
    });
});

describe('autosave', () => {
    it('startAutoSave arms one 30 s interval that calls saveIfDirty; stopAutoSave clears it', () => {
        const timers = { setInterval: vi.fn(() => 42), clearInterval: vi.fn() };
        const { store } = makeStore(main, { timers });
        const saveIfDirty = vi.spyOn(store, 'saveIfDirty');
        store.startAutoSave();
        store.startAutoSave(); // re-arming replaces, never stacks
        expect(timers.setInterval).toHaveBeenCalledTimes(2);
        expect(timers.clearInterval).toHaveBeenCalledWith(42);
        expect(timers.setInterval.mock.calls[0][1]).toBe(30000);
        timers.setInterval.mock.calls[1][0]();
        expect(saveIfDirty).toHaveBeenCalledTimes(1);
        store.stopAutoSave();
        expect(timers.clearInterval).toHaveBeenCalledTimes(2);
        store.stopAutoSave();
        expect(timers.clearInterval).toHaveBeenCalledTimes(2);
    });

    it('saveIfDirty writes nothing for a clean visit', async () => {
        main.seed('/A', makeFiles('/A', 'a', 3));
        const { store } = makeStore(main, { files: makeFiles('/A', 'a', 3) });
        store.beginVisit('/A');
        await store.ensureRead();
        expect(await store.saveIfDirty()).toBeNull();
        expect(main.writes).toHaveLength(0);
    });
});

describe('acquireLock', () => {
    it('serializes its holders in request order', async () => {
        const { store } = makeStore(main);
        const order = [];
        const r1 = await store.acquireLock();
        const p2 = store.acquireLock().then((release) => {
            order.push('second');
            release();
        });
        await settle(5);
        expect(order).toEqual([]);
        order.push('first');
        r1();
        await p2;
        expect(order).toEqual(['first', 'second']);
    });
});
