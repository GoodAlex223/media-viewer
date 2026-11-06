'use strict';
// Does moving inference off Electron's main process keep it responsive? Runs the same embedding job twice and
// records the MAIN process's event-loop delay each time: first in the main process (what the app does today), then
// in a utilityProcess (utility-embed.js) while main only waits for its reply.
// Usage (from the repo root): npx electron <this file> <modelKey> <dataDir> <modelsDir> <outDir> [limit]

const path = require('path');
const { app, utilityProcess } = require('electron');
const { monitorEventLoopDelay } = require('perf_hooks');
const { writeJson } = require('./common');
const { embedAll } = require('./embed');

const [key, dataDir, modelsDir, outDir, limit = '53'] = process.argv.slice(2);

app.setPath('userData', path.join(path.resolve(outDir), 'electron-profile'));
app.disableHardwareAcceleration();

async function measure(label, work) {
    const delay = monitorEventLoopDelay({ resolution: 5 });
    delay.enable();
    const t0 = performance.now();
    const result = await work();
    const wallMs = Math.round(performance.now() - t0);
    delay.disable();
    return {
        label,
        wallMs,
        inferMedianMs: result.inferMedianMs,
        mainLoopDelayMs: {
            p50: +(delay.percentile(50) / 1e6).toFixed(1),
            p99: +(delay.percentile(99) / 1e6).toFixed(1),
            max: +(delay.max / 1e6).toFixed(1),
        },
    };
}

function inUtilityProcess() {
    return new Promise((resolve, reject) => {
        const child = utilityProcess.fork(path.join(__dirname, 'utility-embed.js'), [], {
            stdio: 'inherit',
            env: { ...process.env, MV_KEY: key, MV_DATA: dataDir, MV_MODELS: modelsDir, MV_LIMIT: limit },
        });
        child.on('message', (message) => {
            if (message.error) {
                reject(new Error(message.error));
            } else {
                resolve(message);
            }
            child.kill();
        });
        child.on('exit', (code) => {
            if (code) {
                reject(new Error(`utility process exited with ${code}`));
            }
        });
    });
}

app.whenReady().then(async () => {
    try {
        const inMain = await measure('main process (today)', async () => {
            const r = await embedAll({ key, dataDir, modelsDir, limit: Number(limit), log: () => {} });
            return { inferMedianMs: r.timing.inferMedianMs };
        });
        const inUtility = await measure('utilityProcess', inUtilityProcess);
        const result = {
            key,
            images: Number(limit),
            runtime: `electron ${process.versions.electron}`,
            inMain,
            inUtility,
        };
        writeJson(path.join(outDir, 'utility', `${key}.json`), result);
        console.log(JSON.stringify(result));
        app.exit(0);
    } catch (error) {
        console.error(error);
        app.exit(1);
    }
});
