// hash-parity.js
// The in-app hash parity diagnostic (G2 PR 2, spec § 9.1, D4/D5, B5/B6). Launched with MV_HASH_PARITY=1, main loads
// the page with ?hashParity=1, and every similarity sort hashes every image through both routes (the worker route
// first, then the main-thread route), sorts nothing, writes no cache, and writes a D4-classified report to the perf
// log. Pure: the pool, the signal and the progress sink are injected, and nothing here touches a document.
import { isVideoPath } from './hash-pool.js';
import { isYuvFormat } from './hash-worker.js';

// D4: more than 0.5% of the compared images differing fails the verdict, whatever the classes.
export const PARITY_MAX_RATE = 0.005;
// A whole folder on a wrong route differs everywhere: the perf log gets the first lines and a count of the rest.
export const MAX_PARITY_DETAIL_LINES = 200;

export const PHASE_WORKER = 'Parity: background route';
export const PHASE_MAIN = 'Parity: main-thread route';

// The page's query, read once by the renderer (F15: the flag travels as a query, so no preload change).
export function readParityFlag(search) {
    return new URLSearchParams(search).get('hashParity') === '1';
}

const fileName = (path) => String(path).split(/[\\/]/).pop();
const hasHash = (side) => !!side && typeof side.hash === 'string';

// Differing bit positions; a length mismatch counts every missing position as differing.
function hammingBits(a, b) {
    const n = Math.max(a.length, b.length);
    let bits = 0;
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) {
            bits++;
        }
    }
    return bits;
}

/**
 * D4's classes, as code (B6). Each row: `{ name, kind, worker: { hash, info } | { error }, main: { hash } | { error } }`;
 * `kind` is 'jxl' for a JXL path, else the worker's sniffed `info.type`. A route that never ran for a row (a cancelled
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
        const bits = hammingBits(row.worker.hash, row.main.hash);
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
        // The accepted exception: F4's ±1 colour rounding, on a JPEG or on a lossy (YUV-decoded) WebP.
        const accepted = bits === 1 && (type === 'jpeg' || (type === 'webp' && isYuvFormat(format)));
        diffs.push({
            name: row.name,
            bits,
            cls: accepted ? 'accepted' : 'defect',
            type,
            format,
            icc: !!row.worker.info?.icc,
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
                `format=${d.format ?? '-'} icc=${d.icc ? 'yes' : 'no'}`
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
 * main-thread route, each timed. An abort ends the run with the partial report, `outcome: 'cancelled'` and
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
        .map((p) => {
            const w = workerResults.get(p);
            return {
                name: fileName(p),
                kind: isJxl(p) ? 'jxl' : (w?.info?.type ?? null),
                worker: side(w, true),
                main: side(mainResults.get(p), false),
            };
        });

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
