'use strict';
// Dedicated timing runs, one encoder at a time in a fresh process each: Node CPU, Node DirectML, and Electron's
// main process on CPU, over the first 103 images (3 warm-up + 100 timed). Writes <resultsDir>/timing/emb/*.json.
//
// Usage: node run-timing.js <dataDir> <modelsDir> <resultsDir> <modelKey>...

const path = require('path');
const { spawnSync } = require('child_process');
const { REPO } = require('./common');

const [dataDir, modelsDir, resultsDir, ...keys] = process.argv.slice(2).map((a, i) => (i < 3 ? path.resolve(a) : a));
// MV_TIMING_OUT names the output folder, so a repeat pass does not overwrite the first (default: timing).
const outDir = path.join(resultsDir, process.env.MV_TIMING_OUT || 'timing');
const electron = path.join(
    REPO,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron'
);
const env = { ...process.env, MV_REPO: REPO };
delete env.ELECTRON_RUN_AS_NODE;

for (const key of keys) {
    const runs = [
        [
            'node cpu',
            process.execPath,
            [path.join(__dirname, 'embed.js'), key, dataDir, modelsDir, outDir, 'cpu', '103'],
        ],
        [
            'node dml',
            process.execPath,
            [path.join(__dirname, 'embed.js'), key, dataDir, modelsDir, outDir, 'dml', '103'],
        ],
        [
            'electron cpu',
            electron,
            [path.join(__dirname, 'electron-bench.js'), key, dataDir, modelsDir, outDir, 'cpu', '103'],
        ],
    ];
    for (const [label, cmd, args] of runs) {
        const res = spawnSync(cmd, args, { env, encoding: 'utf8', timeout: 15 * 60 * 1000 });
        const last = (res.stdout || '').trim().split('\n').pop() || '';
        let summary = last;
        try {
            const j = JSON.parse(last);
            summary = `infer ${j.timing.inferMedianMs} ms, total ${j.timing.totalMedianMs} ms, load ${j.loadMs} ms, stall p99 ${j.eventLoopDelayMs.p99} ms`;
        } catch {
            summary = `FAILED (exit ${res.status}): ${(res.stderr || '').trim().split('\n').slice(-2).join(' | ')}`;
        }
        console.log(`${key} [${label}] ${summary}`);
    }
}
