// hash-parity.js (G2 PR 2 T6, spec § 9.1, D4/D5, B5/B6): the parity diagnostic's flag, its D4 classifier, its
// perf-log lines and its two-pass run.
import { describe, it, expect, vi } from 'vitest';
import * as HashParity from '../hash-parity.js';
import { fakeHashPool } from './hash-pool-harness.js';

const { readParityFlag, classifyParity, formatParityLines, runHashParity, PARITY_MAX_RATE, MAX_PARITY_DETAIL_LINES } =
    HashParity;

const H0 = '0'.repeat(256);
// `bits` differing bits from H0, at the front.
const flip = (bits) => '1'.repeat(bits) + '0'.repeat(256 - bits);

const jpegInfo = { type: 'jpeg', format: 'I420', icc: false };
// B15's pixel measure of a differing file: re-hashed with the same hashes, no read-back byte more than 1 level off.
const onePixel = { maxDiff: 1, reproduced: true };
/** A row both routes hashed; the main route's hash differs from the worker's by `bits`. `pixels`: its B15 measure. */
const row = (name, bits = 0, info = jpegInfo, kind = info.type, pixels = undefined) => ({
    name,
    kind,
    worker: { hash: H0, info },
    main: { hash: flip(bits) },
    ...(pixels ? { pixels } : {}),
});
const identicalRows = (n) => Array.from({ length: n }, (_, i) => row(`same${i}.jpg`));

describe('constants', () => {
    it('match the spec', () => {
        expect(PARITY_MAX_RATE).toBe(0.005);
        expect(MAX_PARITY_DETAIL_LINES).toBe(200);
        expect(HashParity.PARITY_MAX_PIXEL_DIFF).toBe(1);
        expect(HashParity.PHASE_PIXELS).toBe('Parity: pixel check');
    });
});

describe('readParityFlag', () => {
    it('is on only for hashParity=1', () => {
        expect(readParityFlag('?hashParity=1')).toBe(true);
        expect(readParityFlag('')).toBe(false);
        expect(readParityFlag('?hashParity=0')).toBe(false);
    });
});

describe('classifyParity (D4, B6)', () => {
    it('all identical passes', () => {
        const r = classifyParity(identicalRows(10));
        expect(r).toMatchObject({
            images: 10,
            compared: 10,
            identical: 10,
            diff1: 0,
            diff2plus: 0,
            rate: 0,
            verdict: 'pass',
            diffs: [],
            workerFailures: [],
            mainFailures: [],
        });
    });

    it('one 1-bit JPEG in 1,000 passes, accepted', () => {
        const r = classifyParity([
            ...identicalRows(999),
            row('one.jpg', 1, { type: 'jpeg', format: 'I420', icc: true }, 'jpeg', onePixel),
        ]);
        expect(r.verdict).toBe('pass');
        expect(r.diff1).toBe(1);
        expect(r.diffs).toEqual([
            {
                name: 'one.jpg',
                bits: 1,
                cls: 'accepted',
                type: 'jpeg',
                format: 'I420',
                icc: true,
                maxPixel: 1,
                note: null,
            },
        ]);
        expect(r.diffs.filter((d) => d.cls === 'accepted')).toHaveLength(1);
        expect(r.rate).toBe(0.001);
    });

    it('a 1-bit PNG fails, even 1 level off', () => {
        const r = classifyParity([
            ...identicalRows(99),
            row('a.png', 1, { type: 'png', format: null, icc: false }, 'png', onePixel),
        ]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ name: 'a.png', bits: 1, cls: 'defect', type: 'png', format: null });
    });

    // B15 (the user's ruling, 2026-10-25): with no two block means equal, every hash has 127 bits set, so the
    // smallest difference ±1 rounding can make is the two blocks at the median trading places: 2 bits.
    it('a 2-bit JPEG at most 1 level off is accepted (B15)', () => {
        const r = classifyParity([...identicalRows(999), row('two.jpg', 2, jpegInfo, 'jpeg', onePixel)]);
        expect(r.verdict).toBe('pass');
        expect(r.diff2plus).toBe(1);
        expect(r.diff1).toBe(0);
        expect(r.diffs[0]).toMatchObject({ bits: 2, cls: 'accepted', maxPixel: 1, note: null });
    });

    it('a JPEG diff 2 levels off is a defect, whatever its bits', () => {
        const r = classifyParity([
            ...identicalRows(999),
            row('one.jpg', 1, jpegInfo, 'jpeg', { maxDiff: 2, reproduced: true }),
        ]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ bits: 1, cls: 'defect', maxPixel: 2, note: null });
    });

    it('a JPEG diff with no pixel measure is a defect', () => {
        const r = classifyParity([...identicalRows(999), row('one.jpg', 1)]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ bits: 1, cls: 'defect', maxPixel: null, note: null });
    });

    it('a JPEG diff whose measure did not reproduce its hashes is a defect', () => {
        const r = classifyParity([
            ...identicalRows(999),
            row('two.jpg', 2, jpegInfo, 'jpeg', { maxDiff: 1, reproduced: false }),
        ]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ cls: 'defect', maxPixel: 1, note: 'not reproduced' });
    });

    it('a JPEG diff whose measure reproduced but has no max difference is a defect', () => {
        const r = classifyParity([...identicalRows(999), row('two.jpg', 2, jpegInfo, 'jpeg', { reproduced: true })]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ cls: 'defect', maxPixel: null });
    });

    it('a JPEG diff whose measure failed is a defect, with the reason', () => {
        const r = classifyParity([
            ...identicalRows(999),
            row('two.jpg', 2, jpegInfo, 'jpeg', { error: 'Main route timed out' }),
        ]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ cls: 'defect', maxPixel: null, note: 'Main route timed out' });
    });

    it('a 1-bit WebP fails as BGRA and passes as I420', () => {
        const bgra = classifyParity([
            ...identicalRows(999),
            row('a.webp', 1, { type: 'webp', format: 'BGRA' }, 'webp', onePixel),
        ]);
        expect(bgra.verdict).toBe('fail');
        expect(bgra.diffs[0].cls).toBe('defect');
        const yuv = classifyParity([
            ...identicalRows(999),
            row('a.webp', 1, { type: 'webp', format: 'I420' }, 'webp', onePixel),
        ]);
        expect(yuv.verdict).toBe('pass');
        expect(yuv.diffs[0].cls).toBe('accepted');
    });

    it('a 1-bit JXL fails', () => {
        // The worker sniffs a JXL's PNG frame bytes as png; the row's kind says what the file is.
        const r = classifyParity([
            ...identicalRows(999),
            row('a.jxl', 1, { type: 'png', format: null }, 'jxl', onePixel),
        ]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ name: 'a.jxl', type: 'jxl', cls: 'defect' });
    });

    it('5 one-bit JPEGs in 1,000 pass (0.50%, the boundary); 6 fail (0.60%)', () => {
        const ones = (n) => Array.from({ length: n }, (_, i) => row(`d${i}.jpg`, 1, jpegInfo, 'jpeg', onePixel));
        const five = classifyParity([...identicalRows(995), ...ones(5)]);
        expect(five.rate).toBe(0.005);
        expect(five.verdict).toBe('pass');
        const six = classifyParity([...identicalRows(994), ...ones(6)]);
        expect(six.rate).toBe(0.006);
        expect(six.verdict).toBe('fail');
        expect(six.diffs.every((d) => d.cls === 'accepted')).toBe(true);
    });

    it('rows with a failed route are not compared, and are listed', () => {
        const r = classifyParity([
            row('ok.jpg'),
            { name: 'wfail.png', kind: null, worker: { error: 'decode failed' }, main: { hash: H0 } },
            { name: 'mfail.jpg', kind: 'jpeg', worker: { hash: H0, info: jpegInfo }, main: { error: 'timeout' } },
        ]);
        expect(r).toMatchObject({ images: 3, compared: 1, identical: 1, diff1: 0, diff2plus: 0, verdict: 'pass' });
        expect(r.workerFailures).toEqual([{ name: 'wfail.png', error: 'decode failed' }]);
        expect(r.mainFailures).toEqual([{ name: 'mfail.jpg', error: 'timeout' }]);
        expect(r.diffs).toEqual([]);
    });

    it('nothing compared: rate 0', () => {
        expect(classifyParity([]).rate).toBe(0);
    });

    // R-T6a: a run whose worker route never produced a hash must not read as a pass.
    it('nothing compared is not a pass', () => {
        const rows = ['a.jpg', 'b.jpg', 'c.png'].map((name) => ({
            name,
            kind: null,
            worker: { error: 'decode failed' },
            main: { hash: H0 },
        }));
        const r = classifyParity(rows);
        expect(r.compared).toBe(0);
        expect(r.diffs).toEqual([]);
        expect(r.workerFailures).toHaveLength(3);
        expect(r.verdict).toBe('fail');
        expect(classifyParity([]).verdict).toBe('fail');
    });
});

describe('formatParityLines', () => {
    const base = {
        outcome: 'done',
        canary: 'pass',
        poolSize: 3,
        workerMs: 1234.4,
        mainMs: 5678.6,
        videos: 2,
    };

    it('writes the exact summary, then diffs, worker failures and main failures in that order', () => {
        const report = {
            ...base,
            ...classifyParity([
                row('ok.jpg'),
                row('one.jpg', 1, { type: 'jpeg', format: 'I420', icc: true }, 'jpeg', onePixel),
                row('a.png', 3, { type: 'png', format: null, icc: false }),
                { name: 'w.png', kind: null, worker: { error: 'decode failed' }, main: { hash: H0 } },
                { name: 'm.jpg', kind: 'jpeg', worker: { hash: H0, info: jpegInfo }, main: { error: 'timeout' } },
            ]),
        };
        expect(formatParityLines(report, { folder: 'C:\\pics' })).toEqual([
            'Hash parity: outcome=done verdict=fail images=5 compared=3 identical=1 diff1=1 diff2plus=1 rate=66.67% ' +
                'workerFailed=1 mainFailed=1 videos=2 canary=pass | worker=1234ms (pool 3) | main=5679ms | ' +
                'order=worker,main | folder=C:\\pics',
            'Hash parity diff: one.jpg bits=1 class=accepted type=jpeg format=I420 icc=yes maxPixel=1',
            'Hash parity diff: a.png bits=3 class=defect type=png format=- icc=no maxPixel=-',
            'Hash parity worker-failed: w.png error=decode failed',
            'Hash parity main-failed: m.jpg error=timeout',
        ]);
    });

    it("a diff line names its pixel measure's max difference, and why it could not accept", () => {
        const rows = [
            row('two.jpg', 2, jpegInfo, 'jpeg', onePixel),
            row('moved.jpg', 2, jpegInfo, 'jpeg', { maxDiff: 1, reproduced: false }),
            row('slow.jpg', 2, jpegInfo, 'jpeg', { error: 'Main route timed out' }),
        ];
        expect(formatParityLines({ ...base, ...classifyParity(rows) }, { folder: '/f' }).slice(1)).toEqual([
            'Hash parity diff: two.jpg bits=2 class=accepted type=jpeg format=I420 icc=no maxPixel=1',
            'Hash parity diff: moved.jpg bits=2 class=defect type=jpeg format=I420 icc=no maxPixel=1 note=not reproduced',
            'Hash parity diff: slow.jpg bits=2 class=defect type=jpeg format=I420 icc=no maxPixel=- note=Main route timed out',
        ]);
    });

    // R-F2: a failed canary's detail is the first detail line; a passing canary writes none.
    it('a failed canary writes its detail first, before the diff lines', () => {
        const rows = [row('ok.jpg'), row('a.png', 3, { type: 'png', format: null, icc: false })];
        const report = {
            ...base,
            canary: 'fail',
            canaryDetail: 'canary-jpeg: 12 bytes differ, 0 bits',
            ...classifyParity(rows),
        };
        const lines = formatParityLines(report, { folder: '/f' });
        expect(lines[0]).toMatch(/^Hash parity: outcome=done verdict=fail .* canary=fail \| worker=/);
        expect(lines.slice(1)).toEqual([
            'Hash parity canary: canary-jpeg: 12 bytes differ, 0 bits',
            'Hash parity diff: a.png bits=3 class=defect type=png format=- icc=no maxPixel=-',
        ]);
        const passing = formatParityLines(
            { ...report, canary: 'pass', canaryDetail: 'canary-jpeg: 0 bytes differ, 0 bits' },
            {
                folder: '/f',
            }
        );
        expect(passing.filter((l) => l.startsWith('Hash parity canary:'))).toEqual([]);
    });

    it('the canary line counts toward the 200-line cap', () => {
        const rows = Array.from({ length: 250 }, (_, i) => row(`d${i}.png`, 2, { type: 'png', format: null }));
        const lines = formatParityLines(
            { ...base, canary: 'fail', canaryDetail: 'pool terminated', ...classifyParity(rows) },
            { folder: '/f' }
        );
        expect(lines).toHaveLength(1 + 200 + 1);
        expect(lines[1]).toBe('Hash parity canary: pool terminated');
        expect(lines[201]).toBe('Hash parity: 51 more lines not written');
    });

    it('caps the detail lines at 200 and says how many were not written', () => {
        const rows = Array.from({ length: 250 }, (_, i) => row(`d${i}.png`, 2, { type: 'png', format: null }));
        const lines = formatParityLines({ ...base, ...classifyParity(rows) }, { folder: '/f' });
        expect(lines).toHaveLength(1 + 200 + 1);
        expect(lines.slice(1, 201).every((l) => l.startsWith('Hash parity diff: '))).toBe(true);
        expect(lines[201]).toBe('Hash parity: 50 more lines not written');
    });
});

describe('runHashParity', () => {
    /**
     * A pool whose results depend on the requested route: `worker(path)` and `main(path)` each return a result's
     * body. The real pool's abort contract: nothing more is yielded once the signal aborts.
     */
    function routePool({ worker, main, compare, canary = { ok: true, detail: 'ok' }, size = 3 } = {}) {
        const pool = fakeHashPool(async () => H0, { size, canary });
        if (compare) {
            pool.comparePixels = vi.fn(compare);
        }
        pool.hashFiles = vi.fn(async function* (paths, { signal = null, route } = {}) {
            for (const path of paths) {
                if (signal?.aborted) {
                    return;
                }
                const body = await (route === 'worker' ? worker(path) : main(path));
                if (signal?.aborted) {
                    return;
                }
                yield { path, ...body };
            }
        });
        return pool;
    }
    const workerOk = async () => ({ hash: H0, route: 'worker', info: jpegInfo });
    const mainOk = async () => ({ hash: H0, route: 'main' });

    it('runs the worker pass, then the main pass, over every image', async () => {
        const pool = routePool({ worker: workerOk, main: mainOk });
        const onProgress = vi.fn();
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg'], {
            signal: new AbortController().signal,
            onProgress,
            isJxl: () => false,
            videos: 0,
        });
        expect(pool.hashFiles).toHaveBeenCalledTimes(2);
        expect(pool.hashFiles.mock.calls[0][1].route).toBe('worker');
        expect(pool.hashFiles.mock.calls[1][1].route).toBe('main');
        expect(pool.hashFiles.mock.calls[0][0]).toEqual(['/f/a.jpg', '/f/b.jpg']);
        expect(pool.hashFiles.mock.calls[1][0]).toEqual(['/f/a.jpg', '/f/b.jpg']);
        expect(pool.checkCanary.mock.invocationCallOrder[0]).toBeLessThan(pool.hashFiles.mock.invocationCallOrder[0]);
        expect(report).toMatchObject({
            outcome: 'done',
            canary: 'pass',
            poolSize: 3,
            videos: 0,
            verdict: 'pass',
            images: 2,
            compared: 2,
            identical: 2,
        });
        expect(typeof report.workerMs).toBe('number');
        expect(typeof report.mainMs).toBe('number');
        const phases = onProgress.mock.calls.map((c) => c[0]);
        expect(phases.indexOf('Parity: main-thread route')).toBeGreaterThan(
            phases.lastIndexOf('Parity: background route')
        );
        expect(onProgress).toHaveBeenCalledWith('Parity: background route', 2, 2);
        expect(onProgress).toHaveBeenCalledWith('Parity: main-thread route', 2, 2);
    });

    it('classifies what the two passes returned, by file name and kind', async () => {
        const pool = routePool({
            worker: async (p) =>
                p.endsWith('.jxl')
                    ? { hash: H0, route: 'worker', info: { type: 'png', format: null, icc: false } }
                    : workerOk(),
            main: async (p) => ({ hash: p.endsWith('b.jpg') ? flip(1) : p.endsWith('.jxl') ? flip(1) : H0 }),
            compare: async () => ({ workerHash: H0, mainHash: flip(1), maxPixelDiff: 1, bytesDiffer: 7 }),
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg', '/f/c.jxl'], {
            isJxl: (p) => p.endsWith('.jxl'),
        });
        expect(report.diffs.map((d) => [d.name, d.type, d.cls])).toEqual([
            ['b.jpg', 'jpeg', 'accepted'],
            ['c.jxl', 'jxl', 'defect'],
        ]);
        expect(report.verdict).toBe('fail');
    });

    // B15: the measure re-hashes on both routes with read-backs, so it runs only where it can accept, and only once
    // both passes are done (the parity order stays worker, then main).
    it('measures the pixels of each differing JPEG or lossy WebP after both passes, and nothing else', async () => {
        const events = [];
        const info = {
            'a.jpg': jpegInfo,
            'b.jpg': jpegInfo,
            'c.jxl': { type: 'png', format: null, icc: false },
            'd.png': { type: 'png', format: null, icc: false },
            'e.webp': { type: 'webp', format: 'I420', icc: false },
            'f.webp': { type: 'webp', format: 'BGRA', icc: false },
            'g.jpg': jpegInfo,
        };
        const name = (p) => p.split('/').pop();
        const pool = routePool({
            worker: async (p) => {
                events.push('worker');
                return { hash: H0, route: 'worker', info: info[name(p)] };
            },
            main: async (p) => {
                events.push('main');
                if (name(p) === 'g.jpg') {
                    return { hash: null, route: 'none', error: 'timeout' };
                }
                return { hash: name(p) === 'a.jpg' ? H0 : flip(2) };
            },
            compare: async () => {
                events.push('pixels');
                return { workerHash: H0, mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 };
            },
        });
        const paths = Object.keys(info).map((n) => `/f/${n}`);
        const report = await runHashParity(pool, paths, { isJxl: (p) => p.endsWith('.jxl') });
        expect(pool.comparePixels.mock.calls.map((c) => c[0])).toEqual(['/f/b.jpg', '/f/e.webp']);
        expect(events.indexOf('pixels')).toBeGreaterThan(events.lastIndexOf('main'));
        expect(report.diffs.map((d) => [d.name, d.cls, d.maxPixel])).toEqual([
            ['b.jpg', 'accepted', 1],
            ['c.jxl', 'defect', null],
            ['d.png', 'defect', null],
            ['e.webp', 'accepted', 1],
            ['f.webp', 'defect', null],
        ]);
        expect(report.outcome).toBe('done');
    });

    it('the measure reports its own phase, after the main pass', async () => {
        const pool = routePool({
            worker: workerOk,
            main: async (p) => ({ hash: p.endsWith('a.jpg') ? H0 : flip(2) }),
            compare: async () => ({ workerHash: H0, mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 }),
        });
        const onProgress = vi.fn();
        await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg', '/f/c.jpg'], { onProgress });
        const pixelCalls = onProgress.mock.calls.filter((c) => c[0] === 'Parity: pixel check');
        expect(pixelCalls).toEqual([
            ['Parity: pixel check', 0, 2],
            ['Parity: pixel check', 1, 2],
            ['Parity: pixel check', 2, 2],
        ]);
        const phases = onProgress.mock.calls.map((c) => c[0]);
        expect(phases.indexOf('Parity: pixel check')).toBeGreaterThan(phases.lastIndexOf('Parity: main-thread route'));
    });

    it('with no difference to measure, reports no pixel phase', async () => {
        const pool = routePool({ worker: workerOk, main: mainOk, compare: async () => ({}) });
        const onProgress = vi.fn();
        await runHashParity(pool, ['/f/a.jpg'], { onProgress });
        expect(onProgress.mock.calls.filter((c) => c[0] === 'Parity: pixel check')).toEqual([]);
        expect(pool.comparePixels).not.toHaveBeenCalled();
    });

    // A whole folder on a wrong route differs everywhere, and fails on the 0.5% cap whatever the measure says: it
    // measures only as many files as the report lists, not every image again with the app frozen.
    it('a run already over the 0.5% cap measures only as many files as the report lists', async () => {
        const pool = routePool({
            worker: workerOk,
            main: async () => ({ hash: flip(2) }),
            compare: async () => ({ workerHash: H0, mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 }),
        });
        const paths = Array.from({ length: 250 }, (_, i) => `/f/d${i}.jpg`);
        const report = await runHashParity(pool, paths, {});
        expect(pool.comparePixels).toHaveBeenCalledTimes(MAX_PARITY_DETAIL_LINES);
        expect(report.diffs.slice(0, MAX_PARITY_DETAIL_LINES).every((d) => d.cls === 'accepted')).toBe(true);
        expect(report.diffs.slice(MAX_PARITY_DETAIL_LINES).map((d) => [d.cls, d.note])).toEqual(
            Array(50).fill(['defect', 'not measured: over the 0.5% cap'])
        );
        expect(report.verdict).toBe('fail');
    });

    it('a run within the 0.5% cap measures every candidate, past the report limit too', async () => {
        const n = MAX_PARITY_DETAIL_LINES + 1;
        const pool = routePool({
            worker: workerOk,
            main: async (p) => ({ hash: Number(p.match(/\d+/)[0]) < n ? flip(2) : H0 }),
            compare: async () => ({ workerHash: H0, mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 }),
        });
        // 201 differing in 40,200 compared: exactly 0.5%.
        const paths = Array.from({ length: 40_200 }, (_, i) => `/f/d${i}.jpg`);
        const report = await runHashParity(pool, paths, {});
        expect(pool.comparePixels).toHaveBeenCalledTimes(n);
        expect(report.rate).toBe(0.005);
        expect(report.verdict).toBe('pass');
    });

    it("a measure whose hashes are not the passes' does not accept", async () => {
        const pool = routePool({
            worker: workerOk,
            main: async () => ({ hash: flip(2) }),
            compare: async () => ({ workerHash: H0, mainHash: flip(4), maxPixelDiff: 1, bytesDiffer: 3 }),
        });
        const report = await runHashParity(pool, ['/f/a.jpg'], {});
        expect(report.diffs[0]).toMatchObject({ cls: 'defect', maxPixel: 1, note: 'not reproduced' });
        expect(report.verdict).toBe('fail');
    });

    it("a measure whose worker hash is not the worker pass's does not accept", async () => {
        const pool = routePool({
            worker: workerOk,
            main: async () => ({ hash: flip(2) }),
            compare: async () => ({ workerHash: flip(4), mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 }),
        });
        const report = await runHashParity(pool, ['/f/a.jpg'], {});
        expect(report.diffs[0]).toMatchObject({ cls: 'defect', maxPixel: 1, note: 'not reproduced' });
        expect(report.verdict).toBe('fail');
    });

    it('a measure that rejects makes a defect with its reason, and the run still reports', async () => {
        const pool = routePool({
            worker: workerOk,
            main: async () => ({ hash: flip(2) }),
            compare: async () => {
                throw new Error('Read-back sizes 262144 and 4');
            },
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg'], {});
        expect(pool.comparePixels).toHaveBeenCalledTimes(2);
        expect(report.outcome).toBe('done');
        expect(report.diffs.map((d) => [d.cls, d.note])).toEqual([
            ['defect', 'Read-back sizes 262144 and 4'],
            ['defect', 'Read-back sizes 262144 and 4'],
        ]);
    });

    it('an abort during the main pass measures no pixels', async () => {
        const controller = new AbortController();
        const pool = routePool({
            worker: workerOk,
            main: async (p) => {
                if (p.endsWith('b.jpg')) {
                    controller.abort();
                }
                return { hash: flip(2) };
            },
            compare: async () => ({ workerHash: H0, mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 }),
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg'], { signal: controller.signal });
        expect(report.outcome).toBe('cancelled');
        expect(pool.comparePixels).not.toHaveBeenCalled();
        // a.jpg differed before the abort: its line says why it has no measure.
        expect(report.diffs).toEqual([expect.objectContaining({ name: 'a.jpg', cls: 'defect', maxPixel: null })]);
        expect(report.diffs[0].note).toBe('not measured: cancelled');
    });

    it('an abort during the measure stops it, and the run is cancelled', async () => {
        const controller = new AbortController();
        const pool = routePool({
            worker: workerOk,
            main: async () => ({ hash: flip(2) }),
            compare: async () => {
                controller.abort();
                return { workerHash: H0, mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 };
            },
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg', '/f/c.jpg'], { signal: controller.signal });
        expect(pool.comparePixels).toHaveBeenCalledTimes(1);
        expect(report.outcome).toBe('cancelled');
        expect(report.verdict).toBe('incomplete');
        // The measure the abort cut short, and the two never started, each say why they have none.
        expect(report.diffs.map((d) => [d.name, d.note])).toEqual([
            ['a.jpg', 'not measured: cancelled'],
            ['b.jpg', 'not measured: cancelled'],
            ['c.jpg', 'not measured: cancelled'],
        ]);
    });

    it('an abort seen after a measure completes keeps that measure and notes the rest', async () => {
        const controller = new AbortController();
        const pool = routePool({
            worker: workerOk,
            main: async () => ({ hash: flip(2) }),
            compare: async () => ({ workerHash: H0, mainHash: flip(2), maxPixelDiff: 1, bytesDiffer: 3 }),
        });
        const onProgress = (phase, current) => {
            if (phase === HashParity.PHASE_PIXELS && current === 1) {
                controller.abort();
            }
        };
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg', '/f/c.jpg'], {
            signal: controller.signal,
            onProgress,
        });
        expect(pool.comparePixels).toHaveBeenCalledTimes(1);
        expect(report.outcome).toBe('cancelled');
        expect(report.diffs.map((d) => [d.name, d.cls, d.note])).toEqual([
            ['a.jpg', 'accepted', null],
            ['b.jpg', 'defect', 'not measured: cancelled'],
            ['c.jpg', 'defect', 'not measured: cancelled'],
        ]);
    });

    it('an abort ends a measure that does not answer at once, not after its timeouts', async () => {
        const controller = new AbortController();
        const pool = routePool({
            worker: workerOk,
            main: async () => ({ hash: flip(2) }),
            compare: () => {
                setTimeout(() => controller.abort(), 0);
                return new Promise(() => {}); // an <img> whose load and error never fire, and a silent worker
            },
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg'], { signal: controller.signal });
        expect(pool.comparePixels).toHaveBeenCalledTimes(1);
        expect(report.outcome).toBe('cancelled');
        expect(report.diffs.map((d) => d.note)).toEqual(['not measured: cancelled', 'not measured: cancelled']);
    }, 1000);

    it('excludes videos and counts them', async () => {
        const pool = routePool({ worker: workerOk, main: mainOk });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/v.mp4', '/f/b.jpg'], { videos: 2 });
        for (const call of pool.hashFiles.mock.calls) {
            expect(call[0]).toEqual(['/f/a.jpg', '/f/b.jpg']);
        }
        expect(report.videos).toBe(3); // two the caller left out, one found here
        expect(report.images).toBe(2);
    });

    it('records the canary, and does not enforce it', async () => {
        const pool = routePool({ worker: workerOk, main: mainOk, canary: { ok: false, detail: 'pixels differ' } });
        const report = await runHashParity(pool, ['/f/a.jpg'], {});
        expect(report.canary).toBe('fail');
        expect(report.canaryDetail).toBe('pixels differ');
        expect(pool.hashFiles).toHaveBeenCalledTimes(2);
        expect(report.compared).toBe(1);
        expect(report.outcome).toBe('done');
    });

    it('records each route failure', async () => {
        const pool = routePool({
            worker: async (p) =>
                p.endsWith('a.jpg') ? { hash: null, route: 'none', error: 'decode failed' } : workerOk(),
            main: async (p) => (p.endsWith('b.jpg') ? { hash: null, route: 'none', error: 'timeout' } : mainOk()),
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg', '/f/c.jpg'], {});
        expect(report.workerFailures).toEqual([{ name: 'a.jpg', error: 'decode failed' }]);
        expect(report.mainFailures).toEqual([{ name: 'b.jpg', error: 'timeout' }]);
        expect(report.compared).toBe(1);
    });

    it('an abort during the main pass returns the partial report, cancelled', async () => {
        const controller = new AbortController();
        const pool = routePool({
            worker: workerOk,
            main: async (p) => {
                if (p.endsWith('b.jpg')) {
                    controller.abort(); // b's main hash is in flight: never yielded
                }
                return mainOk();
            },
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg', '/f/c.jpg'], {
            signal: controller.signal,
        });
        expect(report.outcome).toBe('cancelled');
        // R-F1: the smoke's pass criterion is `verdict=pass`, so a partial count must never carry it.
        expect(report.verdict).toBe('incomplete');
        expect(report).toMatchObject({ images: 3, compared: 1, identical: 1, workerFailures: [], mainFailures: [] });
    });

    it('an abort during the worker pass returns cancelled without starting the main pass', async () => {
        const controller = new AbortController();
        const pool = routePool({
            worker: async (p) => {
                if (p.endsWith('b.jpg')) {
                    controller.abort();
                }
                return workerOk();
            },
            main: mainOk,
        });
        const report = await runHashParity(pool, ['/f/a.jpg', '/f/b.jpg', '/f/c.jpg'], {
            signal: controller.signal,
        });
        expect(report.outcome).toBe('cancelled');
        expect(pool.hashFiles).toHaveBeenCalledTimes(1);
        expect(report.verdict).toBe('incomplete');
        expect(report).toMatchObject({ images: 1, compared: 0, workerFailures: [], mainFailures: [] });
    });
});
