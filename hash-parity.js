// hash-parity.js
// The in-app hash parity diagnostic (G2 PR 2, spec § 9.1, D4/D5, B5/B6). Launched with MV_HASH_PARITY=1, main loads
// the page with ?hashParity=1, and every similarity sort hashes every image through both routes (the worker route
// first, then the main-thread route), sorts nothing, writes no cache, and writes a D4-classified report to the perf
// log. Pure: the pool, the signal and the progress sink are injected, and nothing here touches a document.
import { ABORTED, isVideoPath, untilAborted } from './hash-pool.js';
import { isYuvFormat } from './hash-worker.js';
import { countDifferences } from './perceptual-hash.js';

// D4: more than 0.5% of the compared images differing fails the verdict, whatever the classes.
export const PARITY_MAX_RATE = 0.005;
// D4's accepted exception, measured (B15): F4's ±1 colour rounding, so no read-back byte more than 1 level off.
export const PARITY_MAX_PIXEL_DIFF = 1;
// A whole folder on a wrong route differs everywhere: the perf log gets the first lines and a count of the rest.
export const MAX_PARITY_DETAIL_LINES = 200;

export const PHASE_WORKER = 'Parity: background route';
export const PHASE_MAIN = 'Parity: main-thread route';
export const PHASE_PIXELS = 'Parity: pixel check';

// The page's query, read once by the renderer (F15: the flag travels as a query, so no preload change).
export function readParityFlag(search) {
    return new URLSearchParams(search).get('hashParity') === '1';
}

const fileName = (path) => String(path).split(/[\\/]/).pop();
const hasHash = (side) => !!side && typeof side.hash === 'string';
// The types F4's rounding can reach: a JPEG, or a WebP decoded to a YUV frame (lossy). Only these are measured.
const isRoundingType = (type, format) => type === 'jpeg' || (type === 'webp' && isYuvFormat(format));

/**
 * D4's classes, as code (B6, B15). Each row: `{ name, kind, worker: { hash, info } | { error }, main: { hash } |
 * { error }, pixels? }`; `kind` is 'jxl' for a JXL path, else the worker's sniffed `info.type`; `pixels` is the
 * differing file's measure, `{ maxDiff, reproduced }` or `{ error }`. A route that never ran for a row (a cancelled
 * run) is left `undefined`: that row is neither compared nor listed as a failure.
 */
export function classifyParity(rows) {
    let compared = 0;
    let identical = 0;
    let diff1 = 0;
    let diff2plus = 0;
    const diffs = [];
    const workerFailures = [];
    const mainFailures = [];
    for (const row of rows) {
        const workerOk = hasHash(row.worker);
        const mainOk = hasHash(row.main);
        if (row.worker && !workerOk) {
            workerFailures.push({ name: row.name, error: String(row.worker.error) });
        }
        if (row.main && !mainOk) {
            mainFailures.push({ name: row.name, error: String(row.main.error) });
        }
        if (!workerOk || !mainOk) {
            continue;
        }
        compared++;
        const bits = countDifferences(row.worker.hash, row.main.hash);
        if (bits === 0) {
            identical++;
            continue;
        }
        if (bits === 1) {
            diff1++;
        } else {
            diff2plus++;
        }
        const type = row.kind ?? null;
        const format = row.worker.info?.format ?? null;
        // The accepted exception (B15): F4's ±1 colour rounding, on a JPEG or a lossy (YUV-decoded) WebP, measured on
        // the file's pixels, whatever the bit count: with no block mean tied with the median's, every hash has 127 bits
        // set, so the smallest change it can make is the two blocks at the median trading places, 2 bits.
        const px = row.pixels;
        const maxPixel = typeof px?.maxDiff === 'number' ? px.maxDiff : null;
        const accepted =
            isRoundingType(type, format) &&
            px?.reproduced === true &&
            maxPixel !== null &&
            maxPixel <= PARITY_MAX_PIXEL_DIFF;
        diffs.push({
            name: row.name,
            bits,
            cls: accepted ? 'accepted' : 'defect',
            type,
            format,
            icc: !!row.worker.info?.icc,
            maxPixel,
            note: px?.error ?? (px && px.reproduced === false ? 'not reproduced' : null),
        });
    }
    const rate = compared > 0 ? (diff1 + diff2plus) / compared : 0;
    // R-T6a: a pass needs at least one comparison, so a run whose worker (or main) route never produced a hash fails.
    const verdict =
        compared > 0 && diffs.every((d) => d.cls === 'accepted') && rate <= PARITY_MAX_RATE ? 'pass' : 'fail';
    return {
        images: rows.length,
        compared,
        identical,
        diff1,
        diff2plus,
        rate,
        verdict,
        diffs,
        workerFailures,
        mainFailures,
    };
}

/** The perf-log lines for one report: the summary, then at most MAX_PARITY_DETAIL_LINES detail lines. */
export function formatParityLines(report, { folder }) {
    const r = report;
    const summary =
        `Hash parity: outcome=${r.outcome} verdict=${r.verdict} images=${r.images} compared=${r.compared} ` +
        `identical=${r.identical} diff1=${r.diff1} diff2plus=${r.diff2plus} rate=${(r.rate * 100).toFixed(2)}% ` +
        `workerFailed=${r.workerFailures.length} mainFailed=${r.mainFailures.length} videos=${r.videos} ` +
        `canary=${r.canary} | worker=${Math.round(r.workerMs)}ms (pool ${r.poolSize}) | ` +
        `main=${Math.round(r.mainMs)}ms | order=worker,main | folder=${folder}`;
    // R-F2: a failed canary says why, first; it counts toward the cap like any other detail line.
    const details = [
        ...(r.canary === 'fail' && r.canaryDetail ? [`Hash parity canary: ${r.canaryDetail}`] : []),
        ...r.diffs.map(
            (d) =>
                `Hash parity diff: ${d.name} bits=${d.bits} class=${d.cls} type=${d.type} ` +
                `format=${d.format ?? '-'} icc=${d.icc ? 'yes' : 'no'} maxPixel=${d.maxPixel ?? '-'}` +
                (d.note ? ` note=${d.note}` : '')
        ),
        ...r.workerFailures.map((f) => `Hash parity worker-failed: ${f.name} error=${f.error}`),
        ...r.mainFailures.map((f) => `Hash parity main-failed: ${f.name} error=${f.error}`),
    ];
    const lines = [summary, ...details.slice(0, MAX_PARITY_DETAIL_LINES)];
    if (details.length > MAX_PARITY_DETAIL_LINES) {
        lines.push(`Hash parity: ${details.length - MAX_PARITY_DETAIL_LINES} more lines not written`);
    }
    return lines;
}

/**
 * The two passes (B5): the canary (recorded, not enforced), every image on the worker route, then every image on the
 * main-thread route, each timed. Then each differing JPEG or lossy WebP is measured on its pixels (B15), one at a
 * time, outside the timed passes. An abort ends the run with the partial report, `outcome: 'cancelled'` and
 * `verdict: 'incomplete'`; it never throws for an abort. `videos` is the count of videos the caller left out; any
 * video still in `paths` is left out here and counted too (E16). The caller owns the pool and terminates it.
 */
export async function runHashParity(
    pool,
    paths,
    { signal = null, onProgress = () => {}, isJxl = () => false, videos = 0 } = {}
) {
    const images = paths.filter((p) => !isVideoPath(p));
    const videoCount = videos + (paths.length - images.length);
    const workerResults = new Map();
    const mainResults = new Map();
    let workerMs = 0;
    let mainMs = 0;

    const canary = await pool.checkCanary();
    let cancelled = !!signal?.aborted;

    const pass = async (route, phase, into) => {
        const total = images.length;
        let done = 0;
        onProgress(phase, done, total);
        const start = performance.now();
        for await (const r of pool.hashFiles(images, { signal, route })) {
            into.set(r.path, r);
            done++;
            onProgress(phase, done, total);
        }
        const ms = performance.now() - start;
        // An abort ends the pool's iteration without a throw: the pass says so here.
        if (signal?.aborted) {
            cancelled = true;
        }
        return ms;
    };

    if (!cancelled) {
        workerMs = await pass('worker', PHASE_WORKER, workerResults);
    }
    if (!cancelled) {
        mainMs = await pass('main', PHASE_MAIN, mainResults);
    }

    const kindOf = (p) => (isJxl(p) ? 'jxl' : (workerResults.get(p)?.info?.type ?? null));
    // B15: only where the measure can accept, a differing JPEG or lossy WebP; the measure must reproduce both hashes.
    // A run already over the 0.5% cap fails whatever the measure says (a whole folder on a wrong route differs
    // everywhere), so it measures only as many files as the report lists, not every image again with the app frozen.
    // A candidate left unmeasured says why, so its line can't read as a measured defect. A run already cancelled here
    // measures none.
    const pixels = new Map();
    const leaveUnmeasured = (list, why) => list.forEach((p) => pixels.set(p, { error: `not measured: ${why}` }));
    let compared = 0;
    let differing = 0;
    const candidates = [];
    for (const p of images) {
        const w = workerResults.get(p);
        const m = mainResults.get(p);
        if (!hasHash(w) || !hasHash(m)) {
            continue;
        }
        compared++;
        if (w.hash !== m.hash) {
            differing++;
            if (isRoundingType(kindOf(p), w.info?.format)) {
                candidates.push(p);
            }
        }
    }
    const overCap = compared > 0 && differing / compared > PARITY_MAX_RATE;
    const measured = cancelled ? [] : overCap ? candidates.slice(0, MAX_PARITY_DETAIL_LINES) : candidates;
    leaveUnmeasured(
        candidates.slice(measured.length),
        cancelled ? 'cancelled' : `over the ${PARITY_MAX_RATE * 100}% cap`
    );
    if (measured.length > 0) {
        onProgress(PHASE_PIXELS, 0, measured.length);
    }
    for (const [i, p] of measured.entries()) {
        const w = workerResults.get(p);
        const m = mainResults.get(p);
        try {
            // Raced with the signal, so a Cancel is seen at once, not after the measure's two 30 s bounds; the
            // caller's terminate then ends the call in flight.
            const c = await untilAborted(pool.comparePixels(p), signal);
            if (c === ABORTED) {
                cancelled = true;
                leaveUnmeasured(measured.slice(i), 'cancelled');
                break;
            }
            pixels.set(p, {
                maxDiff: c.maxPixelDiff,
                reproduced: c.workerHash === w.hash && c.mainHash === m.hash,
            });
        } catch (err) {
            pixels.set(p, { error: String(err?.message ?? err) });
        }
        onProgress(PHASE_PIXELS, i + 1, measured.length);
        if (signal?.aborted) {
            cancelled = true;
            leaveUnmeasured(measured.slice(i + 1), 'cancelled');
            break;
        }
    }

    const side = (r, withInfo) => {
        if (!r) {
            return undefined; // this route never reached the file (a cancelled run)
        }
        if (typeof r.hash !== 'string') {
            return { error: r.error ?? 'no hash' };
        }
        return withInfo ? { hash: r.hash, info: r.info } : { hash: r.hash };
    };
    const rows = images
        .filter((p) => workerResults.has(p) || mainResults.has(p))
        .map((p) => ({
            name: fileName(p),
            kind: kindOf(p),
            worker: side(workerResults.get(p), true),
            main: side(mainResults.get(p), false),
            ...(pixels.has(p) ? { pixels: pixels.get(p) } : {}),
        }));

    const classified = classifyParity(rows);
    return {
        outcome: cancelled ? 'cancelled' : 'done',
        canary: canary?.ok ? 'pass' : 'fail',
        canaryDetail: String(canary?.detail ?? ''),
        poolSize: pool.size,
        workerMs,
        mainMs,
        videos: videoCount,
        ...classified,
        // R-F1: a cancelled run compared only part of the folder, so it neither passes nor fails.
        verdict: cancelled ? 'incomplete' : classified.verdict,
    };
}
