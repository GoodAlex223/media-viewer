# AI sorting prototype (throwaway)

Research spike of 2026-10-22, written up in [docs/research/2026-10-22-ai-sorting.md](../../docs/research/2026-10-22-ai-sorting.md).
Nothing here is part of the app: no app file imports it, it ships nothing, and it can be deleted whole.
It reuses the app's own code where it measures the app (`ml-model.js`, `feature-extractor.js`,
`perceptual-hash.js`, `sorting-worker.js`) and the app's own runtime (`@huggingface/transformers` 4.0.1 on
onnxruntime-node 1.24.3, `sharp`, Electron), so it adds no dependency.

## Data and network rules

- Images: Wikimedia Commons JPEGs whose structured data says licence CC0 (P275 = Q6938433), a camera
  (P4082 "captured with"), no museum collection (P195), and whose file metadata says `cc0` or `pd`;
  500-px thumbnails only, fetched one at a time with a generic User-Agent. Without the camera and collection
  filters the "depicts" query returns mostly museum reproductions (a teapot "depicting" a flower).
  The image files stay outside the repo; `data/*.json` here are the manifests of the run in the report
  (title, page, licence, artist, SHA-256), so a run can be checked or repeated.
- Models: public, ungated Hugging Face ONNX exports, downloaded by `download-model.js` with a generic
  User-Agent and no token, size-checked against the hub listing, then loaded offline
  (`env.allowRemoteModels = false`). The scripts delete `HF_TOKEN` / `HF_ACCESS_TOKEN` from their own
  environment. The LAION aesthetic head (MIT) comes from github.com/LAION-AI/aesthetic-predictor.
- Nothing is uploaded anywhere.

## Committed here

- `data/manifest.json`, `data/quality.json`: the photo set and quality set of the report's run (file, subject,
  Commons title and page, licence, photographer, thumbnail URL, SHA-256); `data/mixed-manifest.json`: the
  artwork-heavy robustness set. `restore-data.js` re-downloads exactly these files.
- `results/`: the run's tables (`metrics.md`, `paired.md`, `report-tables.md` = every table in the report),
  timing records of both passes and of the DirectML adapter comparison (`adapter0-emb.json`, `adapter1-emb.json`),
  the utilityProcess runs, zero-shot results, fidelity checks and fit timings; `results/mixed/` the same for the
  robustness set. Embedding vectors are not committed (`embed.js` recomputes them).

## Run

From the repo root, in bash. First the images: either restore the report's exact set, or draw a fresh sample.

```
P=prototypes/ai-sorting; D=../ai-sorting-scratch   # D: any folder outside the repo
node $P/restore-data.js $P/data/manifest.json $D/data $P/data/quality.json   # the report's images, SHA-256 checked
node $P/fetch-commons.js $D/data 25    # or: a fresh sample, 16 subjects x up to 25 CC0 photos
node $P/fetch-quality.js $D/data 8     #     and Quality Images vs ordinary photos, per subject
```

Then:

```
node $P/make-variants.js $D/data 5                       # 6 edited copies of 5 photos per subject
node $P/baseline-features.js $D/data $D/results           # blockhash + 64-dim features (app code)
node $P/download-model.js $D/models Xenova/clip-vit-base-patch32 onnx/vision_model_quantized.onnx
node $P/embed.js clip-b32-q8 $D/data $D/models $D/results [cpu|dml]   # one run per model key in models.js
node $P/zeroshot.js clip-b32 clip-b32-q8 q8 $D/data $D/models $D/results   # family, image run, text dtype
BENCH_SETS=clip-b32-q8,siglip2-b16-224-fp32 node $P/bench.js $D/data $D/results 40 $D/models   # -> metrics.json/.md
node $P/analyze.js $D/results                            # -> paired.md, paired.json
node $P/report-tables.js $D/results [mixedResultsDir]    # the report's tables
MV_TIMING_OUT=timing node $P/run-timing.js $D/data $D/models $D/results clip-b32-q8 siglip2-b32-256-fp32
npx electron $P/electron-utility-bench.js clip-b32-q8 $D/data $D/models $D/results 53
```

`BENCH_SETS` limits the slow few-shot sections to some encoders (the similarity sections always use every
encoder run). Other scripts: `compare-runs.js` (cosine between two runs of one model: quantisation fidelity),
`fit-timing.js` (learner fit times), `export-results.js` (the committed `results/` copy), `contact-sheet.js` (a
thumbnail grid per subject, to eyeball labels), `electron-bench.js` and `utility-embed.js` (used by the timing and
utilityProcess runs).

The aesthetic head (`bench.js` section E2) is a 3 KB PyTorch zip; fetch and extract it once:

```
mkdir -p $D/models/laion-aesthetic
curl -sL -A "Mozilla/5.0 (compatible; research-bot/1.0)" -o $D/models/laion-aesthetic/sa_0_4_vit_b_32_linear.pth \
  https://github.com/LAION-AI/aesthetic-predictor/raw/main/sa_0_4_vit_b_32_linear.pth
python -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
  $D/models/laion-aesthetic/sa_0_4_vit_b_32_linear.pth $D/models/laion-aesthetic/extracted
```

`aesthetic.js` reads its two raw float32 storages and never unpickles anything.
`MV_DML_DEVICE=<n>` pins a DirectML adapter (0 is the default adapter).

`models.js` lists every encoder the scripts know (key, repo, ONNX file, output used as the embedding).
`clip-b32-q8` is exactly what the app runs today (`main.js`: `Xenova/clip-vit-base-patch32`, q8,
`image_embeds`, L2-normalised).

## What it measures

| Script / section | Question | Metric |
|---|---|---|
| bench A | Do nearest neighbours share the subject? | P@1, P@10, mAP over the 16 subjects (originals only) |
| bench B | Does the app's own similarity sort keep subjects together? | share of adjacent pairs with the same subject, from `sorting-worker.js` unchanged |
| bench C | Are edited copies found? | R@1, mAP, pair AUC, and copies found at a threshold that admits 0.1% of unrelated pairs |
| bench D | How well does the like model rank after n likes + n dislikes? | held-out ROC AUC and P@10, synthetic tastes (2 or 5 liked subjects of 16) |
| bench E | Should skips train the model? | likes found in 60 shown files and held-out AUC in a like-or-skip simulation, with 0% or 20% of liked files passed |
| bench E2 | Can the like model learn quality rather than subject? | held-out AUC, liked = Commons Quality Image; also the LAION aesthetic head with no labels |
| bench F | Speed and size | model MB, load time, median inference, peak RSS, JS-thread stall |
| zeroshot | Tags and text search with no training | tag accuracy over 16 prompts, text-search mAP and P@10 |
| electron-utility-bench | Does a utilityProcess keep Electron's main process responsive? | main-process event-loop delay, in-process vs utilityProcess |

Learners in D, E, E2, all fed the same trials: the app's `OnlineLogisticRegression` driven as `ml-worker.js`
`trainFromHistorical` does (raw features; again on folder-standardised features; and again on features standardised
with the training files' own statistics), with the shuffle seed fixed at 1 where the app derives it from the
training fingerprint; kernel ridge on standardised features with a leave-one-out lambda; L2 logistic regression
(C = 1) solved exactly by Newton steps in the dual; centroid; and 3-nearest-neighbour. The skip simulation (E) runs
the app's learner, ridge and logistic. `analyze.js` compares each with the app-today cell trial by trial.
