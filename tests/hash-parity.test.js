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
/** A row both routes hashed; the main route's hash differs from the worker's by `bits`. */
const row = (name, bits = 0, info = jpegInfo, kind = info.type) => ({
    name,
    kind,
    worker: { hash: H0, info },
    main: { hash: flip(bits) },
});
const identicalRows = (n) => Array.from({ length: n }, (_, i) => row(`same${i}.jpg`));

describe('constants', () => {
    it('match the spec', () => {
        expect(PARITY_MAX_RATE).toBe(0.005);
        expect(MAX_PARITY_DETAIL_LINES).toBe(200);
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
            row('one.jpg', 1, { type: 'jpeg', format: 'I420', icc: true }),
        ]);
        expect(r.verdict).toBe('pass');
        expect(r.diff1).toBe(1);
        expect(r.diffs).toEqual([
            { name: 'one.jpg', bits: 1, cls: 'accepted', type: 'jpeg', format: 'I420', icc: true },
        ]);
        expect(r.diffs.filter((d) => d.cls === 'accepted')).toHaveLength(1);
        expect(r.rate).toBe(0.001);
    });

    it('a 1-bit PNG fails', () => {
        const r = classifyParity([...identicalRows(99), row('a.png', 1, { type: 'png', format: null, icc: false })]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ name: 'a.png', bits: 1, cls: 'defect', type: 'png', format: null });
    });

    it('a 2-bit JPEG fails', () => {
        const r = classifyParity([...identicalRows(999), row('two.jpg', 2)]);
        expect(r.verdict).toBe('fail');
        expect(r.diff2plus).toBe(1);
        expect(r.diff1).toBe(0);
        expect(r.diffs[0]).toMatchObject({ bits: 2, cls: 'defect' });
    });

    it('a 1-bit WebP fails as BGRA and passes as I420', () => {
        const bgra = classifyParity([...identicalRows(999), row('a.webp', 1, { type: 'webp', format: 'BGRA' })]);
        expect(bgra.verdict).toBe('fail');
        expect(bgra.diffs[0].cls).toBe('defect');
        const yuv = classifyParity([...identicalRows(999), row('a.webp', 1, { type: 'webp', format: 'I420' })]);
        expect(yuv.verdict).toBe('pass');
        expect(yuv.diffs[0].cls).toBe('accepted');
    });

    it('a 1-bit JXL fails', () => {
        // The worker sniffs a JXL's PNG frame bytes as png; the row's kind says what the file is.
        const r = classifyParity([...identicalRows(999), row('a.jxl', 1, { type: 'png', format: null }, 'jxl')]);
        expect(r.verdict).toBe('fail');
        expect(r.diffs[0]).toMatchObject({ name: 'a.jxl', type: 'jxl', cls: 'defect' });
    });

    it('5 one-bit JPEGs in 1,000 pass (0.50%, the boundary); 6 fail (0.60%)', () => {
        const ones = (n) => Array.from({ length: n }, (_, i) => row(`d${i}.jpg`, 1));
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
                row('one.jpg', 1, { type: 'jpeg', format: 'I420', icc: true }),
                row('a.png', 3, { type: 'png', format: null, icc: false }),
                { name: 'w.png', kind: null, worker: { error: 'decode failed' }, main: { hash: H0 } },
                { name: 'm.jpg', kind: 'jpeg', worker: { hash: H0, info: jpegInfo }, main: { error: 'timeout' } },
            ]),
        };
        expect(formatParityLines(report, { folder: 'C:\\pics' })).toEqual([
            'Hash parity: outcome=done verdict=fail images=5 compared=3 identical=1 diff1=1 diff2plus=1 rate=66.67% ' +
                'workerFailed=1 mainFailed=1 videos=2 canary=pass | worker=1234ms (pool 3) | main=5679ms | ' +
                'order=worker,main | folder=C:\\pics',
            'Hash parity diff: one.jpg bits=1 class=accepted type=jpeg format=I420 icc=yes',
            'Hash parity diff: a.png bits=3 class=defect type=png format=- icc=no',
            'Hash parity worker-failed: w.png error=decode failed',
            'Hash parity main-failed: m.jpg error=timeout',
        ]);
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
    function routePool({ worker, main, canary = { ok: true, detail: 'ok' }, size = 3 } = {}) {
        const pool = fakeHashPool(async () => H0, { size, canary });
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
        expect(phases.indexOf("Parity: today's route")).toBeGreaterThan(phases.lastIndexOf('Parity: background route'));
        expect(onProgress).toHaveBeenCalledWith('Parity: background route', 2, 2);
        expect(onProgress).toHaveBeenCalledWith("Parity: today's route", 2, 2);
    });

    it('classifies what the two passes returned, by file name and kind', async () => {
        const pool = routePool({
            worker: async (p) =>
                p.endsWith('.jxl')
                    ? { hash: H0, route: 'worker', info: { type: 'png', format: null, icc: false } }
                    : workerOk(),
            main: async (p) => ({ hash: p.endsWith('b.jpg') ? flip(1) : p.endsWith('.jxl') ? flip(1) : H0 }),
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
        expect(report).toMatchObject({ images: 1, compared: 0, workerFailures: [], mainFailures: [] });
    });
});
