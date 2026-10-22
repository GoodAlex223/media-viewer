'use strict';
// Embeds every benchmark image with one encoder, offline, and records per-image timings.
// Decoding goes through RawImage.read (sharp), the route main.js's extractClipEmbedding uses; the embedding is
// the model's output tensor L2-normalised, as the app does for CLIP.
//
// Usage: node embed.js <modelKey> <dataDir> <modelsDir> <outDir> [cpu|dml] [limit]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { monitorEventLoopDelay } = require('perf_hooks');
const { repoRequire, listImages, l2normalize, encodeVector, writeJson, median, quantile } = require('./common');
const { MODELS } = require('./models');

// Offline by construction; also never send a token if one happens to be set in this shell.
delete process.env.HF_TOKEN;
delete process.env.HF_ACCESS_TOKEN;

async function embedAll({ key, dataDir, modelsDir, device = 'cpu', limit = Infinity, log = console.log }) {
    const model = MODELS[key];
    if (!model) {
        throw new Error(`unknown model ${key}`);
    }
    const T = repoRequire('@huggingface/transformers');
    T.env.allowRemoteModels = false;
    T.env.allowLocalModels = true;
    T.env.localModelPath = modelsDir.endsWith(path.sep) ? modelsDir : modelsDir + path.sep;

    const onnxPath = path.join(modelsDir, model.repo, model.file);
    let modelBytes = fs.statSync(onnxPath).size;
    if (fs.existsSync(`${onnxPath}_data`)) {
        modelBytes += fs.statSync(`${onnxPath}_data`).size;
    }

    const rssBefore = process.memoryUsage().rss;
    const t0 = performance.now();
    const processor = await T.AutoProcessor.from_pretrained(model.repo);
    // DirectML's deviceId 0 is the default DXGI adapter (on a hybrid laptop, often the integrated GPU);
    // MV_DML_DEVICE pins another one. transformers.js keeps session_options.executionProviders when given.
    const dmlDevice = device === 'dml' && process.env.MV_DML_DEVICE ? Number(process.env.MV_DML_DEVICE) : null;
    const encoder = await T[model.cls].from_pretrained(model.repo, {
        dtype: model.dtype,
        device,
        ...(dmlDevice === null
            ? {}
            : { session_options: { executionProviders: [{ name: 'dml', deviceId: dmlDevice }] } }),
    });
    const loadMs = performance.now() - t0;
    const rssLoaded = process.memoryUsage().rss;

    const images = listImages(dataDir).slice(0, limit);
    // onnxruntime-node's run() calls the native session synchronously (inside setImmediate), so inference holds the
    // JS thread; in the app that thread is Electron's main process. The event-loop delay histogram shows how long.
    const loopDelay = monitorEventLoopDelay({ resolution: 5 });
    loopDelay.enable();
    const vectors = {};
    const decodeMs = [];
    const prepMs = [];
    const inferMs = [];
    let dim = 0;
    for (let i = 0; i < images.length; i++) {
        const a = performance.now();
        const image = await T.RawImage.read(images[i].file);
        const b = performance.now();
        const inputs = await processor(image);
        const c = performance.now();
        const output = await encoder(inputs);
        const d = performance.now();
        let values;
        if (model.out === 'cls') {
            // DINO exports return only the (already layer-normed) token sequence; Hugging Face's pooler for
            // these models is its first (CLS) token.
            const hidden = output.last_hidden_state;
            const width = hidden.dims[hidden.dims.length - 1];
            values = Float32Array.from(hidden.data.slice(0, width));
        } else {
            const tensor = output[model.out];
            if (!tensor) {
                throw new Error(`${key}: no output "${model.out}" (have ${Object.keys(output).join(', ')})`);
            }
            values = Float32Array.from(tensor.data);
        }
        const vec = l2normalize(values);
        dim = vec.length;
        vectors[images[i].id] = encodeVector(vec);
        decodeMs.push(b - a);
        prepMs.push(c - b);
        inferMs.push(d - c);
        if ((i + 1) % 100 === 0) {
            log(`${key} [${device}] ${i + 1}/${images.length}`);
        }
    }
    loopDelay.disable();
    const rssPeak = process.memoryUsage().rss;
    if (typeof encoder.dispose === 'function') {
        await encoder.dispose();
    }

    // The first three images warm the session up; the timing summary leaves them out.
    const warm = (xs) => xs.slice(3);
    const total = decodeMs.map((x, i) => x + prepMs[i] + inferMs[i]);
    return {
        key,
        repo: model.repo,
        file: model.file,
        dtype: model.dtype,
        device,
        dmlDevice,
        dim,
        n: images.length,
        modelMB: +(modelBytes / 1e6).toFixed(1),
        loadMs: Math.round(loadMs),
        rssDeltaLoadMB: Math.round((rssLoaded - rssBefore) / 1e6),
        rssPeakMB: Math.round(rssPeak / 1e6),
        timing: {
            inferMedianMs: +median(warm(inferMs)).toFixed(1),
            inferP90Ms: +quantile(warm(inferMs), 0.9).toFixed(1),
            prepMedianMs: +median(warm(prepMs)).toFixed(1),
            decodeMedianMs: +median(warm(decodeMs)).toFixed(1),
            totalMedianMs: +median(warm(total)).toFixed(1),
            totalSeconds: +(total.reduce((x, y) => x + y, 0) / 1000).toFixed(1),
        },
        eventLoopDelayMs: {
            p50: +(loopDelay.percentile(50) / 1e6).toFixed(1),
            p99: +(loopDelay.percentile(99) / 1e6).toFixed(1),
            max: +(loopDelay.max / 1e6).toFixed(1),
        },
        host: {
            cpus: os.cpus().length,
            cpu: os.cpus()[0].model,
            runtime: process.versions.electron ? `electron ${process.versions.electron}` : `node ${process.version}`,
        },
        vectors,
    };
}

async function main() {
    const [key, dataDir, modelsDir, outDir, device = 'cpu', limit] = process.argv.slice(2);
    const result = await embedAll({ key, dataDir, modelsDir, device, limit: limit ? Number(limit) : Infinity });
    const suffix = device === 'cpu' ? '' : `.${device}`;
    writeJson(path.join(outDir, 'emb', `${key}${suffix}.json`), result);
    const { vectors: _vectors, ...summary } = result;
    console.log(JSON.stringify(summary));
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { embedAll };
