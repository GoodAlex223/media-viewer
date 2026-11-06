'use strict';
// Paired comparisons for the report: every learner and feature set in bench.js meets the same trials (same tastes,
// same training files), so each alternative is compared with the app-today cell trial by trial.
// Prints mean difference, its 95% interval and the share of trials the alternative wins.
//
// Usage: node analyze.js <resultsDir>   -> <resultsDir>/paired.md and paired.json

const path = require('path');
const fs = require('fs');
const C = require('./common');

const APP = { features: 'f64+clip-b32-q8', learner: 'app logistic (raw)' };

function paired(a, b) {
    const d = a.map((x, i) => x - b[i]).filter((x) => Number.isFinite(x));
    const m = C.mean(d);
    const sd = Math.sqrt(C.mean(d.map((x) => (x - m) ** 2)) * (d.length / Math.max(1, d.length - 1)));
    return {
        diff: m,
        half: (1.96 * sd) / Math.sqrt(d.length),
        wins: d.filter((x) => x > 0).length / d.length,
        trials: d.length,
    };
}

function num(x, digits = 3) {
    return Number.isFinite(x) ? x.toFixed(digits) : 'n/a';
}

function fmt(x, digits = 3) {
    return Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(digits) : 'n/a';
}

function main() {
    const resultsDir = path.resolve(process.argv[2]);
    const metrics = C.readJson(path.join(resultsDir, 'metrics.json'));
    const out = { preference: [], quality: [], skips: [] };
    const lines = ['# Paired comparisons against the app today (f64+clip-b32-q8, app logistic)\n'];

    lines.push(`## Few-shot like model, held-out AUC difference (${metrics.trials} trials each)\n`);
    lines.push('| taste | n | features | learner | mean AUC | diff vs app | 95% CI | trials won |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const liked of [2, 5]) {
        for (const n of [3, 10, 30]) {
            const rows = metrics.preference.filter((r) => r.liked === liked && r.n === n);
            const base = rows.find((r) => r.features === APP.features && r.learner === APP.learner);
            for (const r of rows) {
                if (r === base) {
                    continue;
                }
                const p = paired(r.aucPerTrial, base.aucPerTrial);
                out.preference.push({
                    liked,
                    n,
                    features: r.features,
                    learner: r.learner,
                    mean: r.aucCI.mean,
                    base: base.aucCI.mean,
                    ...p,
                });
            }
            const best = out.preference
                .filter((r) => r.liked === liked && r.n === n)
                .sort((a, b) => b.diff - a.diff)
                .slice(0, 6);
            lines.push(
                `| ${liked}/16 | ${n} | ${APP.features} | ${APP.learner} (app today) | ${num(base.aucCI.mean)} | | | |`
            );
            for (const r of best) {
                lines.push(
                    `| ${liked}/16 | ${n} | ${r.features} | ${r.learner} | ${num(r.mean)} | ${fmt(r.diff)} | ${fmt(r.diff - r.half)} to ${fmt(r.diff + r.half)} | ${(100 * r.wins).toFixed(0)}% |`
                );
            }
        }
    }

    if (metrics.qualityTaste && metrics.qualityTaste.length) {
        lines.push('\n## Quality taste, held-out AUC difference\n');
        lines.push('| n | features | learner | mean AUC | diff vs app | 95% CI | trials won |');
        lines.push('|---|---|---|---|---|---|---|');
        for (const n of [5, 10, 20]) {
            const rows = metrics.qualityTaste.filter((r) => r.n === n);
            const base = rows.find((r) => r.features === APP.features && r.learner === APP.learner);
            if (!base) {
                continue;
            }
            const all = rows
                .filter((r) => r !== base)
                .map((r) => ({ ...r, ...paired(r.aucPerTrial, base.aucPerTrial) }))
                .sort((a, b) => b.diff - a.diff);
            out.quality.push(
                ...all.map((r) => ({
                    n,
                    features: r.features,
                    learner: r.learner,
                    mean: r.aucCI.mean,
                    diff: r.diff,
                    half: r.half,
                    wins: r.wins,
                }))
            );
            lines.push(`| ${n} | ${APP.features} | ${APP.learner} (app today) | ${num(base.aucCI.mean)} | | | |`);
            for (const r of all.slice(0, 6)) {
                lines.push(
                    `| ${n} | ${r.features} | ${r.learner} | ${num(r.aucCI.mean)} | ${fmt(r.diff)} | ${fmt(r.diff - r.half)} to ${fmt(r.diff + r.half)} | ${(100 * r.wins).toFixed(0)}% |`
                );
            }
        }
    }

    lines.push(
        '\n## Like-or-skip: likes found in 60 shown, difference vs ignoring skips (same features, learner, miss rate)\n'
    );
    lines.push(
        '| features | learner | liked files passed | strategy | likes found | diff vs ignore | 95% CI | held-out AUC diff |'
    );
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const r of metrics.skips) {
        if (r.strategy.startsWith('ignore')) {
            continue;
        }
        const base = metrics.skips.find(
            (b) =>
                b.features === r.features &&
                b.learner === r.learner &&
                b.missRate === r.missRate &&
                b.strategy.startsWith('ignore')
        );
        const p = paired(r.likesIn60Shown, base.likesIn60Shown);
        const q = paired(r.heldOutAuc, base.heldOutAuc);
        out.skips.push({
            features: r.features,
            learner: r.learner,
            missRate: r.missRate,
            strategy: r.strategy,
            likes: C.mean(r.likesIn60Shown),
            ...p,
            aucDiff: q.diff,
            aucHalf: q.half,
        });
        lines.push(
            `| ${r.features} | ${r.learner} | ${r.missRate * 100}% | ${r.strategy} | ${num(C.mean(r.likesIn60Shown), 1)} | ${fmt(p.diff, 1)} | ${fmt(p.diff - p.half, 1)} to ${fmt(p.diff + p.half, 1)} | ${fmt(q.diff)} +/- ${num(q.half)} |`
        );
    }
    fs.writeFileSync(path.join(resultsDir, 'paired.md'), lines.join('\n') + '\n');
    C.writeJson(path.join(resultsDir, 'paired.json'), out);
    console.log(
        `wrote paired.md (${out.preference.length} preference, ${out.quality.length} quality, ${out.skips.length} skip comparisons)`
    );
}

main();
