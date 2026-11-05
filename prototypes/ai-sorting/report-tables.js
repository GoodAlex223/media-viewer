'use strict';
// Generates the measurement tables quoted in docs/research/2026-10-22-ai-sorting.md straight from the result files,
// so no number in the report is typed by hand.
//
// Usage: node report-tables.js <resultsDir> [mixedResultsDir]   -> prints markdown

const fs = require('fs');
const path = require('path');
const C = require('./common');

const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
const signed = (x, d = 3) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(d) : 'n/a');

const LABEL = {
    phash: 'block-mean hash (app default)',
    'clip-b32-q8': 'CLIP B/32 q8 (app today)',
    'clip-b32-fp32': 'CLIP B/32 fp32',
    'clip-b32-bnb4': 'CLIP B/32 bnb4',
    'clip-b16-fp32': 'CLIP B/16 fp32',
    'siglip2-b16-224-fp32': 'SigLIP 2 B/16 fp32',
    'siglip2-b16-224-fp16': 'SigLIP 2 B/16 fp16',
    'siglip2-b16-224-bnb4': 'SigLIP 2 B/16 bnb4',
    'siglip2-b16-224-q8': 'SigLIP 2 B/16 q8',
    'siglip2-b32-256-fp32': 'SigLIP 2 B/32-256 fp32',
    'dinov2reg-s-fp32': 'DINOv2-S reg fp32',
    'dinov2reg-s-q8': 'DINOv2-S reg q8',
    'dinov2-s-fp32': 'DINOv2-S fp32',
    'dinov3-s16-fp32': 'DINOv3-S/16 fp32',
};
const label = (k) => LABEL[k] || k;

function similarityTable(metrics, keys) {
    const lines = [
        "| encoder | subject P@1 | subject P@10 | same subject next to each other in the app's sort | copies: R@1 | copies found at 0.1% false pairs |",
        '|---|---|---|---|---|---|',
    ];
    for (const k of keys) {
        const m = metrics.similarity[k];
        if (!m) {
            continue;
        }
        const sort = m.sort['clip sort (app)'] ?? m.sort['hash vptree (app default)'];
        lines.push(
            `| ${label(k)} | ${f3(m.neighbours.p1)} | ${f3(m.neighbours.p10)} | ${f3(sort)} | ${f3(m.nearDup.r1)} | ${f3(m.nearDup.tprAtFpr001)} |`
        );
    }
    return lines.join('\n');
}

function editTable(metrics, keys) {
    const transforms = Object.keys(metrics.similarity.phash.nearDup.r1ByTransform);
    const lines = [`| encoder | ${transforms.join(' | ')} |`, `|---|${transforms.map(() => '---').join('|')}|`];
    for (const k of keys) {
        const m = metrics.similarity[k];
        if (m) {
            lines.push(`| ${label(k)} | ${transforms.map((t) => f2(m.nearDup.r1ByTransform[t])).join(' | ')} |`);
        }
    }
    return lines.join('\n');
}

function preferenceTable(metrics, rows) {
    const settings = [];
    for (const liked of [2, 5]) {
        for (const n of [3, 10, 30]) {
            settings.push({ liked, n });
        }
    }
    const head = settings.map((s) => `${s.liked}/16, ${s.n}+${s.n}`);
    const lines = [`| features | learner | ${head.join(' | ')} |`, `|---|---|${settings.map(() => '---').join('|')}|`];
    for (const [features, learner, note] of rows) {
        const cells = settings.map(({ liked, n }) => {
            const r = metrics.preference.find(
                (p) => p.liked === liked && p.n === n && p.features === features && p.learner === learner
            );
            return r ? f3(r.aucCI.mean) : 'n/a';
        });
        lines.push(
            `| ${features.replace(/^f64\+/, '64 + ').replace(/^f64$/, '64 hand-crafted')}${note ? ` ${note}` : ''} | ${learner} | ${cells.join(' | ')} |`
        );
    }
    return lines.join('\n');
}

function skipTable(metrics, rows) {
    const lines = [
        '| features | learner | skips | likes in 60 shown, 0% passed | likes, 20% passed | held-out AUC, 0% / 20% |',
        '|---|---|---|---|---|---|',
    ];
    for (const [features, learner] of rows) {
        for (const strategy of ['ignore skips (app today)', 'skips as dislikes', 'skips as weak dislikes (0.3)']) {
            const a = metrics.skips.find(
                (s) => s.features === features && s.learner === learner && s.strategy === strategy && s.missRate === 0
            );
            const b = metrics.skips.find(
                (s) => s.features === features && s.learner === learner && s.strategy === strategy && s.missRate === 0.2
            );
            if (a && b) {
                lines.push(
                    `| ${features.replace(/^f64\+/, '64 + ')} | ${learner} | ${strategy.replace(' (app today)', '')} | ${f1(a.likesCI.mean)} | ${f1(b.likesCI.mean)} | ${f3(a.aucCI.mean)} / ${f3(b.aucCI.mean)} |`
                );
            }
        }
    }
    return lines.join('\n');
}

function qualityTable(metrics, rows) {
    const lines = ['| features | learner | 5+5 | 10+10 | 20+20 |', '|---|---|---|---|---|'];
    for (const [features, learner] of rows) {
        const cells = [5, 10, 20].map((n) => {
            const r = metrics.qualityTaste.find((p) => p.n === n && p.features === features && p.learner === learner);
            return r ? `${f3(r.aucCI.mean)} ± ${f3(r.aucCI.half)}` : 'n/a';
        });
        lines.push(
            `| ${features.replace(/^f64\+/, '64 + ').replace(/^f64$/, '64 hand-crafted')} | ${learner} | ${cells.join(' | ')} |`
        );
    }
    return lines.join('\n');
}

function zeroShotTable(dir) {
    const zdir = path.join(dir, 'zeroshot');
    if (!fs.existsSync(zdir)) {
        return '';
    }
    const lines = [
        '| image + text tower | tag accuracy (16 prompts) | text search mAP | text search P@10 |',
        '|---|---|---|---|',
    ];
    for (const f of fs.readdirSync(zdir).sort()) {
        const z = C.readJson(path.join(zdir, f));
        lines.push(`| ${z.key} | ${f3(z.tagAccuracy)} | ${f3(z.searchMap)} | ${f3(z.searchP10)} |`);
    }
    return lines.join('\n');
}

// Timing records of one pass, keyed by encoder and place (cpu = Node CPU, dml = Node DirectML, electron = main
// process CPU). A pass is a folder of embed.js / electron-bench.js outputs (run-timing.js).
function timingPass(dir) {
    const by = new Map();
    if (!fs.existsSync(dir)) {
        return by;
    }
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const { vectors: _v, ...r } = C.readJson(path.join(dir, f));
        const where = r.host.runtime.startsWith('electron') ? 'electron' : r.device;
        if (!by.has(r.key)) {
            by.set(r.key, {});
        }
        by.get(r.key)[where] = r;
    }
    return by;
}

function speedTable(resultsDir) {
    const passes = ['timing', 'timing2'].map((p) => timingPass(path.join(resultsDir, p, 'emb')));
    const keys = [...new Set(passes.flatMap((p) => [...p.keys()]))].sort();
    const both = (fn) => passes.map((p, i) => fn(p, i)).join(' / ');
    const cell = (key, where, pick) =>
        both((p) => {
            const r = p.get(key) && p.get(key)[where];
            if (!p.has(key)) {
                return '-';
            }
            return r ? pick(r) : 'failed';
        });
    const lines = [
        '| encoder | file MB | CPU infer ms (Node) | CPU decode+prep+infer ms | Electron main, CPU infer ms | DirectML infer ms (RTX 3050 Ti) | Electron main-thread stall p99 ms | peak RSS MB (Node CPU) |',
        '|---|---|---|---|---|---|---|---|',
    ];
    for (const key of keys) {
        const any = passes.map((p) => p.get(key)).find(Boolean);
        const first = Object.values(any)[0];
        lines.push(
            `| ${label(key)} | ${first.modelMB} | ${cell(key, 'cpu', (r) => r.timing.inferMedianMs)} | ${cell(key, 'cpu', (r) => r.timing.totalMedianMs)} | ${cell(key, 'electron', (r) => r.timing.inferMedianMs)} | ${cell(key, 'dml', (r) => r.timing.inferMedianMs)} | ${cell(key, 'electron', (r) => r.eventLoopDelayMs.p99)} | ${cell(key, 'cpu', (r) => r.rssPeakMB)} |`
        );
    }
    return lines.join('\n');
}

function utilityTable(dirs) {
    const lines = [
        '| encoder | pass | where inference runs | main-thread event-loop delay p50 / p99 / max ms | median inference ms |',
        '|---|---|---|---|---|',
    ];
    dirs.forEach((dir, i) => {
        const udir = path.join(dir, 'utility');
        if (!fs.existsSync(udir)) {
            return;
        }
        for (const f of fs.readdirSync(udir).sort()) {
            const u = C.readJson(path.join(udir, f));
            for (const run of [u.inMain, u.inUtility]) {
                const d = run.mainLoopDelayMs;
                lines.push(
                    `| ${label(u.key)} | ${i + 1} | ${run.label} | ${d.p50} / ${d.p99} / ${d.max} | ${run.inferMedianMs} |`
                );
            }
        }
    });
    return lines.join('\n');
}

function main() {
    const [resultsDir, mixedDir] = process.argv.slice(2).map((p) => path.resolve(p));
    const metrics = C.readJson(path.join(resultsDir, 'metrics.json'));
    const paired = C.readJson(path.join(resultsDir, 'paired.json'));
    const simKeys = Object.keys(LABEL).filter((k) => metrics.similarity[k]);
    const out = [];
    out.push('### T1 similarity (photo set)\n', similarityTable(metrics, simKeys), '');
    out.push('### T2 copies found at rank 1, by edit\n', editTable(metrics, simKeys), '');
    const prefRows = [
        ['f64+clip-b32-q8', 'app logistic (raw)', '(app today)'],
        ['clip-b32-q8', 'app logistic (raw)', ''],
        ['f64+clip-b32-q8', 'app logistic (standardised)', ''],
        ['f64+clip-b32-q8', 'app logistic (train-standardised)', ''],
        ['f64+clip-b32-q8', 'logistic (standardised, C=1)', ''],
        ['clip-b32-q8', 'logistic (standardised, C=1)', ''],
        ['clip-b32-q8', 'kNN-3', ''],
        ['clip-b32-fp32', 'logistic (standardised, C=1)', ''],
        ['clip-b16-fp32', 'logistic (standardised, C=1)', ''],
        ['siglip2-b16-224-fp32', 'logistic (standardised, C=1)', ''],
        ['siglip2-b16-224-fp32', 'kNN-3', ''],
        ['siglip2-b16-224-bnb4', 'logistic (standardised, C=1)', ''],
        ['siglip2-b16-224-q8', 'logistic (standardised, C=1)', ''],
        ['siglip2-b32-256-fp32', 'logistic (standardised, C=1)', ''],
        ['dinov2reg-s-fp32', 'logistic (standardised, C=1)', ''],
        ['f64', 'app logistic (raw)', ''],
    ];
    out.push('### T3 like model, held-out ROC AUC (mean of 40 trials)\n', preferenceTable(metrics, prefRows), '');
    const settings = [];
    for (const liked of [2, 5]) {
        for (const n of [3, 10, 30]) {
            settings.push([liked, n]);
        }
    }
    const pairLines = [
        `| features | learner | ${settings.map(([l, n]) => `${l}/16, ${n}+${n}`).join(' | ')} |`,
        `|---|---|${settings.map(() => '---').join('|')}|`,
    ];
    for (const [features, learner] of [
        ['f64+clip-b32-q8', 'app logistic (standardised)'],
        ['f64+clip-b32-q8', 'app logistic (train-standardised)'],
        ['clip-b32-q8', 'app logistic (raw)'],
        ['f64+clip-b32-q8', 'logistic (standardised, C=1)'],
        ['clip-b32-q8', 'kNN-3'],
        ['siglip2-b16-224-fp32', 'logistic (standardised, C=1)'],
    ]) {
        const cells = settings.map(([liked, n]) => {
            const r = paired.preference.find(
                (p) => p.liked === liked && p.n === n && p.features === features && p.learner === learner
            );
            return r ? `${signed(r.diff)} (${Math.round(100 * r.wins)}%)` : 'n/a';
        });
        pairLines.push(`| ${features.replace(/^f64\+/, '64 + ')} | ${learner} | ${cells.join(' | ')} |`);
    }
    out.push('### T3b paired AUC difference against the app today (share of trials won)\n', pairLines.join('\n'), '');
    out.push(
        '### T4 like-or-skip simulation\n',
        skipTable(metrics, [
            ['f64+clip-b32-q8', 'app logistic (raw)'],
            ['f64+clip-b32-q8', 'ridge (standardised, LOO lambda)'],
            ['f64+clip-b32-q8', 'logistic (standardised, C=1)'],
            ['clip-b32-fp32', 'logistic (standardised, C=1)'],
            ['siglip2-b16-224-fp32', 'logistic (standardised, C=1)'],
        ]),
        ''
    );
    // Paired gain of weak skips over ignoring them (same trials), from analyze.js.
    const skipLines = [
        '| features | learner | liked files passed | likes gained (95% CI) | trials won |',
        '|---|---|---|---|---|',
    ];
    const skipFeatures = ['f64+clip-b32-q8', 'clip-b32-fp32', 'siglip2-b16-224-fp32', 'siglip2-b32-256-fp32'];
    const skipLearners = ['ridge (standardised, LOO lambda)', 'logistic (standardised, C=1)'];
    const weak = paired.skips.filter(
        (s) =>
            s.strategy === 'skips as weak dislikes (0.3)' &&
            skipFeatures.includes(s.features) &&
            skipLearners.includes(s.learner)
    );
    for (const r of weak) {
        skipLines.push(
            `| ${r.features.replace(/^f64\+/, '64 + ')} | ${r.learner} | ${r.missRate * 100}% | ${signed(r.diff, 1)} (${signed(r.diff - r.half, 1)} to ${signed(r.diff + r.half, 1)}) | ${Math.round(100 * r.wins)}% |`
        );
    }
    out.push('### T4b weak skips against ignoring skips, paired\n', skipLines.join('\n'), '');
    out.push(
        '### T5 quality taste\n',
        qualityTable(metrics, [
            ['f64+clip-b32-q8', 'app logistic (raw)'],
            ['f64', 'logistic (standardised, C=1)'],
            ['clip-b32-q8', 'logistic (standardised, C=1)'],
            ['clip-b32-fp32', 'logistic (standardised, C=1)'],
            ['f64+clip-b32-fp32', 'logistic (standardised, C=1)'],
            ['clip-b32-bnb4', 'logistic (standardised, C=1)'],
            ['clip-b16-fp32', 'logistic (standardised, C=1)'],
            ['f64+clip-b16-fp32', 'logistic (standardised, C=1)'],
            ['siglip2-b16-224-fp32', 'logistic (standardised, C=1)'],
            ['siglip2-b32-256-fp32', 'logistic (standardised, C=1)'],
            ['dinov2reg-s-fp32', 'logistic (standardised, C=1)'],
            ['clip-b32-q8', 'LAION aesthetic v1 head, no labels'],
            ['clip-b32-q8', 'ridge + aesthetic prior'],
        ]),
        ''
    );
    // The same learner on the fp32 and the q8 file of one model, trial by trial.
    const q8Lines = ['| comparison (logistic, C=1) | 5+5 | 10+10 | 20+20 |', '|---|---|---|---|'];
    for (const [a, b] of [
        ['clip-b32-fp32', 'clip-b32-q8'],
        ['clip-b32-bnb4', 'clip-b32-q8'],
        ['siglip2-b16-224-fp32', 'siglip2-b16-224-q8'],
    ]) {
        const cells = [5, 10, 20].map((n) => {
            const find = (f) =>
                metrics.qualityTaste.find(
                    (p) => p.n === n && p.features === f && p.learner === 'logistic (standardised, C=1)'
                );
            const ra = find(a);
            const rb = find(b);
            if (!ra || !rb) {
                return 'n/a';
            }
            const d = ra.aucPerTrial.map((x, i) => x - rb.aucPerTrial[i]);
            const m = C.mean(d);
            const sd = Math.sqrt(C.mean(d.map((x) => (x - m) ** 2)) * (d.length / (d.length - 1)));
            const won = d.filter((x) => x > 0).length / d.length;
            return `${signed(m)} ± ${f3((1.96 * sd) / Math.sqrt(d.length))} (${Math.round(100 * won)}%)`;
        });
        q8Lines.push(`| ${label(a)} minus ${label(b)} | ${cells.join(' | ')} |`);
    }
    out.push('### T5b quality taste: file A minus file B, paired (share of trials won)\n', q8Lines.join('\n'), '');
    out.push('### T6 zero-shot tags and text search\n', zeroShotTable(resultsDir), '');
    out.push('### T7 speed and size, pass 1 / pass 2\n', speedTable(resultsDir), '');
    out.push(
        '### T8 inference in Electron main vs a utilityProcess\n',
        utilityTable([resultsDir, path.join(resultsDir, 'run2')]),
        ''
    );
    const fidelityFile = path.join(resultsDir, 'fidelity.jsonl');
    if (fs.existsSync(fidelityFile)) {
        const rows = fs
            .readFileSync(fidelityFile, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l));
        const lines = [
            '| file | compared with | images | cosine median | 10th percentile | minimum |',
            '|---|---|---|---|---|---|',
        ];
        for (const r of rows) {
            lines.push(`| ${r.a} | ${r.b} | ${r.images} | ${f3(r.cosMedian)} | ${f3(r.cosP10)} | ${f3(r.cosMin)} |`);
        }
        out.push('### FIDELITY quantised vs fp32 embeddings (compare-runs.js)\n', lines.join('\n'), '');
    }
    if (mixedDir && fs.existsSync(path.join(mixedDir, 'metrics.json'))) {
        const mixed = C.readJson(path.join(mixedDir, 'metrics.json'));
        out.push(
            '### T9 robustness: artwork-heavy set\n',
            similarityTable(
                mixed,
                Object.keys(LABEL).filter((k) => mixed.similarity[k])
            ),
            '',
            preferenceTable(
                mixed,
                prefRows.filter(([f]) => mixed.preference.some((p) => p.features === f))
            ),
            ''
        );
    }
    console.log(out.join('\n'));
}

main();
