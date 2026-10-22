'use strict';
// The utilityProcess side of electron-utility-bench.js: embeds, then reports to the parent and waits to be killed.

const { embedAll } = require('./embed');

const { MV_KEY, MV_DATA, MV_MODELS, MV_LIMIT } = process.env;

embedAll({ key: MV_KEY, dataDir: MV_DATA, modelsDir: MV_MODELS, limit: Number(MV_LIMIT), log: () => {} })
    .then((r) => process.parentPort.postMessage({ inferMedianMs: r.timing.inferMedianMs, n: r.n }))
    .catch((error) => process.parentPort.postMessage({ error: String(error && error.stack ? error.stack : error) }));
