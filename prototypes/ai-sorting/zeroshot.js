'use strict';
// Zero-shot tagging and text search with an encoder's own text tower: no training, prompts only.
// Each subject's prompt ("a photo of a cat.") is embedded once; every original is tagged with its nearest prompt
// (accuracy), and each prompt ranks all originals (text search: AP and P@10). Image vectors come from embed.js.
//
// Usage: node zeroshot.js <family> <imageKey> <textDtype> <dataDir> <modelsDir> <resultsDir>
//   e.g. zeroshot.js siglip2-b16-224 siglip2-b16-224-fp32 fp32 D/data D/models D/results

const path = require('path');
const C = require('./common');

delete process.env.HF_TOKEN;
delete process.env.HF_ACCESS_TOKEN;

const TEXT_MODELS = {
    'clip-b32': {
        repo: 'Xenova/clip-vit-base-patch32',
        cls: 'CLIPTextModelWithProjection',
        out: 'text_embeds',
        tokenizer: { padding: true, truncation: true },
    },
    'siglip2-b16-224': {
        repo: 'onnx-community/siglip2-base-patch16-224-ONNX',
        cls: 'SiglipTextModel',
        out: 'pooler_output',
        tokenizer: { padding: 'max_length', truncation: true, max_length: 64 },
    },
    'siglip2-b32-256': {
        repo: 'onnx-community/siglip2-base-patch32-256-ONNX',
        cls: 'SiglipTextModel',
        out: 'pooler_output',
        tokenizer: { padding: 'max_length', truncation: true, max_length: 64 },
    },
    'mobileclip-s2': {
        repo: 'Xenova/mobileclip_s2',
        cls: 'CLIPTextModelWithProjection',
        out: 'text_embeds',
        tokenizer: { padding: 'max_length', truncation: true, max_length: 77 },
    },
};

function prompt(subject) {
    if (subject === 'food') {
        return 'a photo of food.';
    }
    return `a photo of ${/^[aeiou]/.test(subject) ? 'an' : 'a'} ${subject}.`;
}

async function main() {
    const [family, imageKey, textDtype, dataDir, modelsDir, resultsDir] = process.argv
        .slice(2)
        .map((a, i) => (i < 3 ? a : path.resolve(a)));
    const spec = TEXT_MODELS[family];
    const key = `${imageKey}+text-${textDtype}`;
    const T = C.repoRequire('@huggingface/transformers');
    T.env.allowRemoteModels = false;
    T.env.localModelPath = modelsDir + path.sep;

    const items = C.listImages(dataDir).filter((it) => it.set === 'main');
    const subjects = [...new Set(items.map((it) => it.category))];
    const t0 = performance.now();
    const tokenizer = await T.AutoTokenizer.from_pretrained(spec.repo);
    const textModel = await T[spec.cls].from_pretrained(spec.repo, { dtype: textDtype });
    const loadMs = performance.now() - t0;
    const inputs = tokenizer(subjects.map(prompt), spec.tokenizer);
    const t1 = performance.now();
    const output = await textModel(inputs);
    const encodeMs = performance.now() - t1;
    const tensor = output[spec.out];
    const width = tensor.dims[tensor.dims.length - 1];
    const textVecs = subjects.map((_, s) =>
        C.l2normalize(Float32Array.from(tensor.data.slice(s * width, (s + 1) * width)))
    );

    const emb = C.readJson(path.join(resultsDir, 'emb', `${imageKey}.json`));
    const imageVecs = items.map((it) => C.decodeVector(emb.vectors[it.id]));
    if (imageVecs[0].length !== width) {
        throw new Error(`image dim ${imageVecs[0].length} != text dim ${width}`);
    }

    // Tagging accuracy: nearest prompt.
    let correct = 0;
    const confusion = {};
    imageVecs.forEach((v, i) => {
        let best = -Infinity;
        let bestSubject = null;
        textVecs.forEach((t, s) => {
            const sim = C.dot(v, t);
            if (sim > best) {
                best = sim;
                bestSubject = subjects[s];
            }
        });
        if (bestSubject === items[i].category) {
            correct++;
        } else {
            const pair = `${items[i].category}->${bestSubject}`;
            confusion[pair] = (confusion[pair] || 0) + 1;
        }
    });

    // Text search: each prompt ranks every original.
    const perSubject = {};
    subjects.forEach((subject, s) => {
        const ranked = imageVecs
            .map((v, i) => [C.dot(v, textVecs[s]), items[i].category === subject ? 1 : 0])
            .sort((a, b) => b[0] - a[0]);
        const rel = ranked.map((r) => r[1]);
        perSubject[subject] = {
            ap: C.averagePrecision(
                rel,
                rel.reduce((a, b) => a + b, 0)
            ),
            p10: C.mean(rel.slice(0, 10)),
        };
    });
    const result = {
        key,
        repo: spec.repo,
        prompts: subjects.map(prompt),
        images: items.length,
        tagAccuracy: correct / items.length,
        searchMap: C.mean(Object.values(perSubject).map((r) => r.ap)),
        searchP10: C.mean(Object.values(perSubject).map((r) => r.p10)),
        perSubject,
        topConfusions: Object.entries(confusion)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8),
        textLoadMs: Math.round(loadMs),
        textEncodeMsFor16Prompts: Math.round(encodeMs),
    };
    C.writeJson(path.join(resultsDir, 'zeroshot', `${key}.json`), result);
    console.log(
        JSON.stringify({
            key,
            tagAccuracy: result.tagAccuracy,
            searchMap: result.searchMap,
            searchP10: result.searchP10,
            topConfusions: result.topConfusions,
        })
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
