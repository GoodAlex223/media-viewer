'use strict';
// Runs embed.js inside Electron's main process (no window): the runtime main.js's CLIP handlers use.
// Usage (from the repo root): npx electron <this file> <modelKey> <dataDir> <modelsDir> <outDir> [cpu|dml] [limit]

const path = require('path');
const { app } = require('electron');
const { writeJson } = require('./common');
const { embedAll } = require('./embed');

const [key, dataDir, modelsDir, outDir, device = 'cpu', limit] = process.argv.slice(2);

// Chromium writes profile files at startup; keep them out of %APPDATA%\Electron, which the E2E suite uses.
app.setPath('userData', path.join(path.resolve(outDir), 'electron-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    try {
        const result = await embedAll({ key, dataDir, modelsDir, device, limit: limit ? Number(limit) : Infinity });
        writeJson(path.join(outDir, 'emb', `${key}.electron${device === 'cpu' ? '' : `.${device}`}.json`), result);
        const { vectors: _vectors, ...summary } = result;
        console.log(JSON.stringify(summary));
        app.exit(0);
    } catch (error) {
        console.error(error);
        app.exit(1);
    }
});
