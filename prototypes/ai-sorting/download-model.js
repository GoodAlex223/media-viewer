'use strict';
// Downloads only the files one model variant needs from the Hugging Face hub (public, ungated repos only),
// with a generic User-Agent and no token, then checks each file's size against the hub's own listing.
// The embedder then loads them offline (transformers.js env.allowRemoteModels = false).
//
// Usage: node download-model.js <modelsDir> <repo> <onnxFile> [<onnxFile>...]
//   e.g. node download-model.js models onnx-community/dinov2-small onnx/model_quantized.onnx

const fs = require('fs');
const path = require('path');
const { UA } = require('./common');

async function main() {
    const [modelsDir, repo, ...onnxFiles] = process.argv.slice(2);
    if (!modelsDir || !repo || onnxFiles.length === 0) {
        throw new Error('usage: download-model.js <modelsDir> <repo> <onnxFile>...');
    }
    const listing = await (
        await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`, { headers: { 'User-Agent': UA } })
    ).json();
    if (listing.gated) {
        throw new Error(`${repo} is gated; the prototype uses public models only`);
    }
    const sizes = new Map((listing.siblings || []).map((s) => [s.rfilename, s.size]));
    const wanted = ['config.json', 'preprocessor_config.json'].filter((f) => sizes.has(f));
    for (const f of onnxFiles) {
        wanted.push(f);
        if (f.endsWith('.onnx') && sizes.has(`${f}_data`)) {
            wanted.push(`${f}_data`); // external weights of a large or newer export
        }
    }
    for (const f of wanted) {
        if (!sizes.has(f)) {
            throw new Error(`${repo} has no ${f}`);
        }
        const dest = path.join(modelsDir, repo, f);
        if (fs.existsSync(dest) && fs.statSync(dest).size === sizes.get(f)) {
            console.log(`have ${repo}/${f}`);
            continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const res = await fetch(`https://huggingface.co/${repo}/resolve/main/${f}`, { headers: { 'User-Agent': UA } });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} for ${repo}/${f}`);
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length !== sizes.get(f)) {
            throw new Error(`${repo}/${f}: got ${bytes.length} bytes, hub lists ${sizes.get(f)}`);
        }
        fs.writeFileSync(dest, bytes);
        console.log(`got  ${repo}/${f} (${(bytes.length / 1e6).toFixed(1)} MB)`);
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
