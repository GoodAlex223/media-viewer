# AI image sorting the app could run locally

**Date:** 2026-10-22 · **Status:** research spike with a throwaway prototype
([`prototypes/ai-sorting/`](../../prototypes/ai-sorting/README.md)); nothing in the app changed.

The question: what is the most capable AI sorting this app could run on the user's own machine, and does the best
candidate beat what the app does today? Six parallel research surveys covered newer image embeddings, aesthetic
scoring, vision-language tagging, face and near-duplicate grouping, learning from likes and skips, and running
models inside Electron (105 candidates, 240 distinct sources, then 164 fact-checks). A prototype measured the
strongest candidates against the app's current pipeline on public-domain photos, reusing the app's own learner,
sort and hash code. A fresh-context verifier then re-derived the numbers and re-opened the sources (see
*Verification record*).

## Summary

1. **The biggest win needs no new model.** The AI sort's learner wastes the CLIP vectors it already has: 64
   hand-crafted features (0 to 1 each) sit unscaled beside 512 CLIP numbers (about 0.044 each), and with a few
   epochs of plain SGD the hand-crafted part dominates (the same learner does far better on CLIP alone, and the 64
   features alone are weak). On tastes defined by subject, z-scoring the inputs with the training files' own
   statistics lifts held-out ROC AUC by +0.10 to +0.20 at today's cost, winning 93-100% of paired trials; a
   converged L2 logistic regression on standardised inputs reaches +0.10 to +0.21 (95-100%), ranking at 0.70-0.96
   where the app reaches 0.57-0.86. On the quality taste of item 6 the same fix helps only together with CLIP's
   fp32 file (+0.03 to +0.10; on today's q8 vectors -0.01 to -0.03).
2. **Skips help a weak learner and can hurt a good one.** The better learner alone doubles the likes found per 60
   files shown in a like-or-skip simulation (16.8 to 33.9). Skips as weak dislikes add about 2-3 more when every
   skip is a real dislike, but when the user also passes a fifth of the files they would have liked, they cost the
   converged learner 2-4 likes. Passive skips should stay out of training; the app's existing confirm-then-dislike
   path (F) already captures their reliable part.
3. **Near-duplicates: DINOv2.** DINOv2-small with registers (Apache-2.0, 88 MB fp32) found every edited copy at rank
   1 and 99.6% of copy pairs at a threshold that admits 1 unrelated pair in 1,000; CLIP finds 76-80%, the app's hash
   38% (at rank 1 the hash found 16% of mirrored copies and none of the bordered, captioned ones).
4. **The default similarity sort ignores content.** The hash puts same-subject photos next to each other 10.5% of
   the time (chance is about 6%); every faithful embedding gets 71-77%.
5. **The app's q8 CLIP file erases most of the learnable quality signal.** It moves its vectors (median cosine 0.915
   with the fp32 file). That barely matters for grouping by subject, but on a taste for reviewer-promoted Quality
   Images the same learner reaches AUC 0.66 at 20+20 labels on the fp32 file and 0.55 on q8, and strict copy
   detection drops from 0.80 to 0.76. The q8 exports of SigLIP 2 and DINOv2 are broken outright (median cosine 0.785
   and 0.805, down to 0.005), which made SigLIP 2 look worse than CLIP until it was re-run in fp32, and the CLIP q8
   file crashed the process on DirectML.
6. **Quality taste is learnable from faithful vectors, slowly.** With fp32 CLIP and 20+20 labels the like model told
   Quality Images from ordinary photos of the same subject at AUC 0.66-0.68 with the converged learner (0.65-0.66
   with today's learner on standardised inputs); a generic "best shot" score is weak (the free LAION aesthetic head:
   0.57).
7. **SigLIP 2 is the best embedding upgrade for search and harder collections.** In fp32 it lifts text search from
   mAP 0.850 (today's CLIP) to 0.936 and catches more copies (85-94% vs 76-80%). On the easy photo subjects every
   faithful encoder lands within 0.04 of the others; on the artwork-heavy second set SigLIP 2 B/16 beats CLIP on
   every measure (subject P@1 0.686 vs 0.631, like-model AUC +0.01 to +0.03). It learns the quality taste less well
   than fp32 CLIP (0.57-0.62 vs 0.66-0.68). The B/32-256 variant matches B/16 on search at 1-2x today's CPU cost
   (48-75 ms per image in Electron's main process against 25-80 ms for today's q8 CLIP, over two timing passes) and
   20-27 ms on the RTX 3050 Ti through DirectML; B/16 costs 131-199 ms and 28-36 ms.
8. **Inference blocks Electron's main process today.** onnxruntime-node runs synchronously on the JavaScript thread,
   so each CLIP call freezes the process that serves every image and IPC call for its own duration (p99 56-66 ms
   over a CLIP run, 164-211 ms for SigLIP 2 B/16), and loading the library and model freezes it once for 0.4-1.0 s.
   In a `utilityProcess` the main thread's p99 stayed at about 20 ms, its idle level.

**Recommendation, in order:** standardise the like model's inputs with the training files' own statistics, then
fit it to convergence (small, no download); add duplicate grouping on DINOv2-small; move inference into a
`utilityProcess` and switch CLIP to its fp32 file (DirectML on Windows); when text search is wanted, replace CLIP
B/32 with SigLIP 2 B/32-256 in fp32 (never its q8 file); keep passive skips out of training. Decisions that need you
are under *Open questions*.

## Ranking

Licence is a gate (non-commercial, research-only and custom licences are excluded or flagged); the rest are ordered
by measured gain for the cost. "Measured" means by this prototype; "cited" means from the surveys' sources. Speeds
are per image, batch 1, on this laptop under its normal background load, as the range over two timing passes;
"Electron" is the main process on the CPU.

| # | Upgrade | Improves | Evidence | Speed | Size / memory | Licence | Effort | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | Standardise the like model's inputs (training files' statistics); then fit it to convergence (L2 logistic, C = 1) | AI sort | measured on subject tastes: AUC +0.10 to +0.20 (inputs only), +0.10 to +0.21 (converged fit); on the quality taste only with row 4 | today's SGD: 5-6 ms per fit at 500 labels (832 dims); a converged fit needs a primal solver (estimate: under 1 s) | 0 | own code | S | **do first** |
| 2 | Duplicate grouping on DINOv2-S/14 with registers, fp32 | new "group copies" view | measured: 99.6% of copy pairs at 0.1% false pairs; R@1 1.000 | 93-99 ms in Electron; DirectML no faster (84-92 ms) | 88 MB; 0.24 GB peak RSS | Apache-2.0 | M | **do** |
| 3 | Inference in a `utilityProcess`; DirectML adapter 0 on Windows | UI responsiveness, speed | measured: per-image (p99 56-211 ms) and load (0.4-1.0 s) stalls leave the main thread; its p99 stays about 20 ms | CLIP B/32 fp32: 20-30 ms on DirectML | 0 | MIT runtime; DirectML redistributable | M | **do before adding a model** |
| 4 | Switch CLIP from its q8 file to fp32 | quality-based tastes, strict copy detection | measured: quality taste +0.05 to +0.12 AUC; copies at 0.1% false pairs 0.804 vs 0.762; subject tasks within 0.03 | Node CPU 43-75 ms vs 30-58 ms; DirectML 20-30 ms (q8 crashes there) | 352 MB vs 89 MB; 0.50-0.74 GB peak RSS | MIT | S | **do with 3** |
| 5 | SigLIP 2 B/32-256 fp32 replacing CLIP B/32, with its q8 text tower for search | text search, tags, harder collections | measured: search mAP 0.936 vs 0.850; copies 0.854 vs 0.762; quality taste weaker than fp32 CLIP | 48-75 ms Electron, 20-27 ms DirectML | 378 MB (+283 MB text); 0.53-0.92 GB peak RSS | Apache-2.0 | M-L | **do when search is wanted** |
| 6 | SigLIP 2 B/16 fp32 instead of B/32-256 | as 5, slightly stronger on hard collections | measured: copies 0.935; artwork set +0.05 subject P@1 over CLIP | 131-199 ms Electron, 28-36 ms DirectML | 372 MB (+283 MB text); 0.54-0.70 GB | Apache-2.0 | M-L | GPU machines |
| 7 | Text search and tags on today's CLIP (its 64 MB text tower) | search by words | measured: tag accuracy 0.896, mAP 0.850 | one text encode per query | +64 MB | MIT | S-M | cheapest search |
| 8 | Passive skips as weak dislikes (weight 0.3) | AI sort | measured: +2-3 likes per 60 shown with clean skips; -2 to -4 for a converged learner when the user passes 20% of the files they would have liked | none | 0 | own code | S | **not by default** |
| 9 | LAION aesthetic v1 head as a cold-start prior | AI sort with few labels | measured: AUC 0.57 on the quality set | 0 ms (512 multiply-adds) | 3 KB | MIT | S | optional, weak |
| 10 | Face grouping: face-api FaceRecognitionNet (bundled) or YuNet + SFace | group by person | cited: LFW 99.38% / 99.40% | cited: about 5 ms per face (SFace) | 0 / 39 MB | MIT and CC0 / MIT and Apache-2.0 | M | later, measure first |
| 11 | RAM++ tagger | richer tags | cited: OpenImages-common mAP 86.4 (released Swin-L) | cited: about 0.7 s on CPU | 873 MB int8 | Apache-2.0 | L | not now |
| 12 | Small VLM captions (Florence-2, Qwen3.5-0.8B) | captions, question filters | cited: no tagging mAP published | Florence-2 about 1-3 s on CPU (cited); others 1-5 s (estimated) | 275-1,300 MB | MIT / Apache-2.0 | M-L | background only |
| - | **Excluded on licence:** MobileCLIP/MobileCLIP2 and AIMv2 (Apple, research-only); MetaCLIP 2 and jina-clip-v2 (CC BY-NC); InsightFace weights (non-commercial); TOPIQ, CLIP-IQA+ and other pyiqa weights (non-commercial); DINOv3 (custom licence; also not better here: subject P@1 0.845, and its run failed on DirectML) | | | | | | | |
| - | **Excluded on size:** LMM quality scorers (Q-Align, DeQA-Score and ArtiMuse at 7-8B parameters; Q-ReAlign Mini at 0.8B; no transformers.js path) | | | | | | | |

## Recommendation

Do these in order; each step stands on its own, and step 1 needs no new model. Effort is in the plan's story-point
scale, as a rough guide.

1. **Fix how the like model learns (S, about 1 SP, then about 2 SP).** First, in `ml-worker.js`: z-score every
   feature with the training files' own mean and standard deviation, store both with the weights, apply them when
   scoring, and bump `TRAINING_CONFIG_VERSION` so cached models rebuild. That alone measured +0.10 to +0.20 AUC at
   today's fit cost (5-6 ms at 500 labels and 832 dimensions) on subject tastes; on the quality taste it helps only
   together with step 3's fp32 file (+0.03 to +0.08; -0.02 to -0.03 on today's q8 vectors). Keep the 64 hand-crafted features: their metadata half may matter on real
   folders even though it carries nothing here. Second, replace the few SGD epochs with an L2 logistic regression
   fitted to convergence (C = 1; +0.10 to +0.21 measured). The prototype's exact dual solver (`logisticFit` in
   `bench.js`) is fine up to about a hundred labels (15 ms at 60) but grows to 0.4 s at 200 and 6 s at 500
   (`fit-timing.js`), so the app needs a primal solver such as L-BFGS, whose cost grows with labels x dimensions
   (estimate: well under a second for a few thousand labels). Optional later: blend in 3-nearest-neighbour scoring,
   the best learner here once each class has 10 or more examples.
2. **Group near-duplicates (M, about 3-5 SP).** Compute a second embedding, DINOv2-small with registers in fp32
   (Apache-2.0, 88 MB, about 90-100 ms per image on the CPU; never its q8 file), in the background extraction pass,
   and offer "group copies" as connected groups above one cosine threshold, found with the VP-tree that
   `sorting-worker.js` already has. Tune the threshold on real folders; here the level that admits 1 unrelated pair in
   1,000 caught 99.6% of copies. A zero-download first version can threshold the CLIP vectors already cached (76% of
   copies).
3. **Move inference into a `utilityProcess` and switch CLIP to its fp32 file (M, about 3-4 SP).** Do this before
   adding any second model: it moves both the per-image stalls and the 0.4-1.0 s load stalls off the main process
   (section 8), isolates native crashes (the CLIP q8 file crashed the process on DirectML) and lets a model unload
   for real. In the same change, load CLIP's fp32 file instead of q8 (bump `FEATURE_CACHE_VERSION` so vectors are
   re-extracted): it keeps the quality signal q8 loses (+0.05 to +0.12 AUC on the quality taste) at about 1.3-1.5x
   the CPU time in Node (one Electron pass even measured it faster), or 20-30 ms on DirectML. On Windows offer DirectML (adapter 0 was the RTX here) with fp32 files; note that
   DirectML is in sustained engineering, with new feature work moved to Windows ML, though it ships inside
   onnxruntime-node and worked here.
4. **Replace CLIP B/32 with SigLIP 2 B/32-256 when text search is wanted (M-L, about 5-8 SP).** Its fp32 vision file
   costs 1-2x today's CPU time (48-75 ms per image in Electron) and 20-27 ms on DirectML; its q8 text tower (283 MB,
   faithful) gives search at mAP 0.936. Do not ship its q8 vision file (cosine 0.71 with fp32); bnb4 (64 MB) is
   faithful but slower on the CPU. It learns the quality taste less well than fp32 CLIP, so weigh search against that
   if quality is what the user rates. The 512 to 768 dimension change touches 27 lines in 7 files (`ml-model.js`,
   `ml-worker.js`, `ml-training.js`, `feature-cache-store.js`, `feature-cache-transport.js`, `main.js`,
   `media-viewer.js`) plus about 107 lines in 14 test files, bumps `ML_MODEL_VERSION` and `FEATURE_CACHE_VERSION`, and
   re-extracts every folder once. Peak memory rises from 0.15-0.24 GB to 0.5-0.9 GB while the model is loaded, which
   the utility process can release when idle. SigLIP 2 B/16 is the choice on a GPU machine.
5. **Keep passive skips out of training (no change).** With the improved learner, skips as weak dislikes help only
   when skips are nearly always real dislikes; when the user passes a fifth of the files they would have liked they cost 2-4 likes per 60
   shown. The existing F path, where the user confirms before skips become dislikes, already captures their reliable
   part. If skips are ever tried, use weight 0.3 or less with a strongly regularised learner, behind a setting.

**Do not build now:** a generic "best shot first" sort (the free LAION head is weak at 0.57; the strong quality
models are non-commercial or several GB), DINOv3 (custom licence, not better here), MobileCLIP 2 / AIMv2
(research-only), small VLM captions for sorting (seconds per image), and face grouping before it is measured on
identity-labelled data.

**BACKLOG candidates** (Claude-surfaced, so 🟤 under the intake rules; not filed, see *Open questions*): one entry
for each of steps 1-4, each citing this report.

## What the app does today

| Sort | How it works now | Code |
|---|---|---|
| Similarity sort (default) | 256-bit block-mean hash of a 256x256 stretch, Hamming distance, VP-tree nearest-neighbour chain | `perceptual-hash.js`, `sorting-worker.js`; `sortAlgorithm` defaults to `'vptree'` in `media-viewer.js` |
| Similarity sort (CLIP) | a greedy walk of a minimum spanning tree built over a k-nearest-neighbour graph of cosine distances between CLIP vectors, chosen as "CLIP (Semantic)" | `sorting-worker.js` `sortMediaBySimilarityClip` |
| AI sort | `OnlineLogisticRegression`: plain SGD (lr 0.1, decay 1e-4, L2 0.001, 3-10 epochs) over 576 numbers per file = 64 hand-crafted features (colour, edges, sharpness, file metadata, 3 face numbers) + the 512-dim CLIP vector, with no scaling between the two parts | `ml-model.js`, `ml-worker.js`, `feature-extractor.js` |
| CLIP | `Xenova/clip-vit-base-patch32`, q8 (89 MB), in the Electron main process through `@huggingface/transformers` 4.0.1 on onnxruntime-node 1.24.3, CPU | `main.js` `loadClipModel` and the `extractClipEmbedding` handler |
| Skips | tracked while the AI order is on screen; used by "dislike skipped" (F) and by the chip's re-sort, which parks them first; they train the model only once bulk-disliked | `like-or-skip.js` |
| Faces | face-api TinyFaceDetector, detection only, feeding 3 of the 64 features | `face-detector.js` |

## How this was done

**Research.** A six-way parallel survey (embeddings, aesthetic scoring, vision-language tagging, faces and
near-duplicates, learning from likes and skips, running models inside Electron), each judging candidates on sort
quality, local speed, size, licence and integration effort with a source for every number: 105 candidates, 240
distinct sources (254 citations). Two fact-checkers then re-opened the shortlisted candidates' licences, Hugging Face file listings and key
numbers (164 checks; see *Verification record*).

**Prototype.** `prototypes/ai-sorting/` (throwaway, not wired into the app). It reuses the app's own code wherever it
measures the app: `ml-model.js` (the like model, driven as `ml-worker.js` `trainFromHistorical` drives it, except
that the shuffle seed is fixed at 1 where the app derives one from the training fingerprint; other seeds moved the
app-today cells by at most 0.01 in an independent check), `feature-extractor.js`,
`perceptual-hash.js` and `sorting-worker.js` (the real sort functions), and the app's runtime
(`@huggingface/transformers` 4.0.1, onnxruntime-node 1.24.3, `sharp`, Electron 39.1.2). The baseline CLIP file is
the one in the app's own model cache, byte-for-byte the hub file.

**Data.** Only public-domain images, downloaded, never uploaded:
- 393 photos in 16 subjects (cat, dog, horse, bird, insect, flower, food, car, train, aircraft, ship, church,
  lighthouse, bridge, mountain, waterfall; 25 each except aircraft 19 and lighthouse 24) by about 250 photographers,
  from Wikimedia Commons [commons]: structured data "depicts" the subject, licence CC0, a camera recorded ("captured with"),
  not a museum-collection object, and the file's own licence metadata `cc0` (389) or `pd` (4); at most two photos
  per photographer per subject; 500-px thumbnails (one is 480 px). A few artwork reproductions still slipped
  through (at least 3). Without the camera and collection filters the same query
  returned mostly museum reproductions (a teapot "depicting" a flower); that first download became the robustness
  set of section 9.
- 480 edited copies, six of each of five photos per subject (crop to 80%, half size at JPEG quality 20, colour
  shift, mirror, 8-degree tilt, black border with a caption band): the near-duplicate test.
- A quality set of 120 photos in 13 subjects: per subject, CC0 photos that Commons reviewers promoted to Quality
  Images and the same number of ordinary CC0 photos of that subject (bird and aircraft had no CC0 Quality Images
  outside museum collections; lighthouse's three were already in the main set).

**Hardware.** AMD Ryzen 7 6800H (8 cores, 16 threads), 15 GB RAM, NVIDIA RTX 3050 Ti Laptop (4 GB) and AMD Radeon
680M, Windows 11, Node 22.17.1, Electron 39.1.2. During the measurements another Claude session was running tests
in the same checkout and two unrelated Python processes used about 1.4 cores, so the timing table shows two
passes taken at different times.

## Measurements

All numbers below come from `prototypes/ai-sorting/` on 393 CC0 photos in 16 subjects, 480 edited copies of 80 of
them, and 120 quality-set photos (60 Quality Images, 60 ordinary), on the laptop described under *How this was
done*. Few-shot results are means over 40 random trials; every learner and encoder meets the same trials, so the
differences are paired. The tables were generated from the run's full result files by `report-tables.js`;
`prototypes/ai-sorting/results/` keeps them (`report-tables.md`) with the raw timing, zero-shot and utility-process
records. Embedding vectors are not committed: `restore-data.js` re-downloads the exact images and the scripts
regenerate the rest.

### 1. The like model learns badly from good features

The AI sort's learner, not CLIP, is the weak link. Fed the same CLIP vectors, a properly fitted linear model ranks
held-out files far better, in every taste and label count tested. The likely cause is in the code: the 64
hand-crafted features (each 0 to 1) sit unscaled beside 512 CLIP numbers of about 0.044 each, so a few epochs of
plain SGD with a fixed step are dominated by the hand-crafted part. The table fits that reading: the same learner
on CLIP alone (second row) does far better, and the 64 features on their own are weak for subject tastes (last row,
0.53-0.69).

Held-out ROC AUC, "2/16, 3+3" = 2 liked subjects of 16, 3 likes and 3 dislikes to learn from. "standardised" means
each feature z-scored with the mean and standard deviation of the 393 photos being ranked; "train-standardised"
uses the training files' own statistics, which `ml-worker.js` can compute without the folder:

| features | learner | 2/16, 3+3 | 2/16, 10+10 | 2/16, 30+30 | 5/16, 3+3 | 5/16, 10+10 | 5/16, 30+30 |
|---|---|---|---|---|---|---|---|
| 64 + clip-b32-q8 (app today) | app logistic (raw) | 0.656 | 0.725 | 0.862 | 0.574 | 0.640 | 0.715 |
| clip-b32-q8 | app logistic (raw) | 0.796 | 0.897 | 0.965 | 0.673 | 0.798 | 0.859 |
| 64 + clip-b32-q8 | app logistic (standardised) | 0.766 | 0.879 | 0.918 | 0.673 | 0.791 | 0.893 |
| 64 + clip-b32-q8 | app logistic (train-standardised) | 0.786 | 0.921 | 0.963 | 0.670 | 0.808 | 0.901 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 0.820 | 0.926 | 0.963 | 0.698 | 0.840 | 0.925 |
| clip-b32-q8 | logistic (standardised, C=1) | 0.824 | 0.932 | 0.964 | 0.701 | 0.848 | 0.929 |
| clip-b32-q8 | kNN-3 | 0.818 | 0.954 | 0.986 | 0.694 | 0.877 | 0.961 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0.826 | 0.933 | 0.966 | 0.698 | 0.850 | 0.928 |
| clip-b16-fp32 | logistic (standardised, C=1) | 0.821 | 0.926 | 0.960 | 0.700 | 0.850 | 0.934 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.825 | 0.936 | 0.971 | 0.697 | 0.845 | 0.934 |
| siglip2-b16-224-fp32 | kNN-3 | 0.822 | 0.958 | 0.987 | 0.693 | 0.879 | 0.961 |
| siglip2-b16-224-bnb4 | logistic (standardised, C=1) | 0.831 | 0.937 | 0.968 | 0.700 | 0.850 | 0.937 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0.753 | 0.857 | 0.908 | 0.649 | 0.776 | 0.856 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0.821 | 0.934 | 0.967 | 0.700 | 0.846 | 0.931 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0.776 | 0.893 | 0.947 | 0.662 | 0.804 | 0.893 |
| 64 hand-crafted | app logistic (raw) | 0.571 | 0.597 | 0.694 | 0.526 | 0.559 | 0.591 |

Paired difference against the app today (share of the 40 trials won):

| features | learner | 2/16, 3+3 | 2/16, 10+10 | 2/16, 30+30 | 5/16, 3+3 | 5/16, 10+10 | 5/16, 30+30 |
|---|---|---|---|---|---|---|---|
| 64 + clip-b32-q8 | app logistic (standardised) | +0.109 (90%) | +0.153 (98%) | +0.056 (80%) | +0.099 (95%) | +0.151 (100%) | +0.179 (100%) |
| 64 + clip-b32-q8 | app logistic (train-standardised) | +0.130 (98%) | +0.196 (100%) | +0.101 (100%) | +0.096 (93%) | +0.167 (100%) | +0.186 (100%) |
| clip-b32-q8 | app logistic (raw) | +0.140 (93%) | +0.172 (100%) | +0.103 (100%) | +0.099 (95%) | +0.158 (98%) | +0.144 (100%) |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | +0.164 (100%) | +0.201 (100%) | +0.101 (95%) | +0.124 (98%) | +0.200 (100%) | +0.210 (100%) |
| clip-b32-q8 | kNN-3 | +0.162 (98%) | +0.229 (100%) | +0.124 (100%) | +0.120 (98%) | +0.236 (100%) | +0.246 (100%) |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | +0.169 (98%) | +0.211 (100%) | +0.109 (100%) | +0.123 (93%) | +0.205 (100%) | +0.220 (100%) |

Any of the cheap fixes is worth most of the gap: standardise the inputs of the existing learner (+0.06 to +0.18
with the folder's statistics, +0.10 to +0.20 with the training files' own), or leave the 64 features out (+0.10 to
+0.17). A converged L2 logistic regression on standardised inputs (C = 1) adds the rest (+0.10 to +0.21), and
3-nearest-neighbour scoring is best once there are 10 or more labels per class. With a good learner the encoder
matters little on these subject tastes: SigLIP 2, CLIP B/16 and CLIP B/32 land within about 0.01 of each other.
Shrinkage LDA, the preference survey's second pick, was not run separately; the ridge learner in the skip simulation
is its least-squares relative.

These are subject tastes. On the quality taste (section 6) the same fixes do not help on today's q8 vectors
(-0.01 to -0.03 against the app) and do help on the fp32 file (+0.03 to +0.10).

### 2. Skips: they help a weak learner and can hurt a good one

In the like-or-skip simulation the user sees the top 10 of the AI order six times, likes the files of the liked
subjects and skips the rest; "20% passed" means the user also skips a fifth of the files they would have liked.

| features | learner | skips | likes in 60 shown, 0% passed | likes, 20% passed | held-out AUC, 0% / 20% |
|---|---|---|---|---|---|
| 64 + clip-b32-q8 | app logistic (raw) | ignore skips | 16.8 | 13.4 | 0.624 / 0.625 |
| 64 + clip-b32-q8 | app logistic (raw) | skips as dislikes | 25.3 | 19.1 | 0.788 / 0.760 |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | ignore skips | 33.9 | 27.0 | 0.897 / 0.897 |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | skips as dislikes | 36.8 | 26.9 | 0.934 / 0.909 |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | skips as weak dislikes (0.3) | 37.0 | 28.8 | 0.942 / 0.932 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | ignore skips | 33.4 | 26.6 | 0.892 / 0.890 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | skips as dislikes | 35.7 | 22.8 | 0.930 / 0.827 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | skips as weak dislikes (0.3) | 36.6 | 24.8 | 0.934 / 0.861 |
| clip-b32-fp32 | logistic (standardised, C=1) | ignore skips | 34.0 | 27.3 | 0.899 / 0.899 |
| clip-b32-fp32 | logistic (standardised, C=1) | skips as dislikes | 36.5 | 22.1 | 0.936 / 0.823 |
| clip-b32-fp32 | logistic (standardised, C=1) | skips as weak dislikes (0.3) | 37.2 | 23.8 | 0.943 / 0.856 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | ignore skips | 34.8 | 27.9 | 0.920 / 0.911 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | skips as dislikes | 35.9 | 22.1 | 0.944 / 0.813 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | skips as weak dislikes (0.3) | 37.0 | 23.8 | 0.954 / 0.835 |

Gain from weak skips (weight 0.3) over ignoring skips, paired, in likes per 60 files shown:

| features | learner | liked files passed | likes gained (95% CI) | trials won |
|---|---|---|---|---|
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 0% | +2.3 (+1.1 to +3.5) | 70% |
| clip-b32-fp32 | ridge (standardised, LOO lambda) | 20% | +0.8 (-0.2 to +1.8) | 48% |
| clip-b32-fp32 | logistic (standardised, C=1) | 0% | +3.3 (+1.7 to +4.8) | 60% |
| clip-b32-fp32 | logistic (standardised, C=1) | 20% | -3.5 (-5.2 to -1.9) | 20% |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | 0% | +3.0 (+1.4 to +4.7) | 65% |
| 64 + clip-b32-q8 | ridge (standardised, LOO lambda) | 20% | +1.7 (+0.4 to +3.1) | 48% |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 0% | +3.3 (+1.5 to +5.0) | 65% |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 20% | -1.9 (-3.6 to -0.1) | 33% |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 0% | +2.7 (+1.4 to +4.0) | 57% |
| siglip2-b16-224-fp32 | ridge (standardised, LOO lambda) | 20% | +0.8 (-0.2 to +1.8) | 38% |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0% | +2.2 (+0.7 to +3.7) | 48% |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 20% | -4.1 (-6.0 to -2.2) | 23% |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 0% | +3.4 (+1.9 to +4.8) | 73% |
| siglip2-b32-256-fp32 | ridge (standardised, LOO lambda) | 20% | +1.1 (-0.3 to +2.4) | 48% |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0% | +2.8 (+1.2 to +4.5) | 63% |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 20% | -4.0 (-5.8 to -2.3) | 20% |

A better learner alone doubles the likes found per 60 files shown. With the current learner, counting skips as
dislikes adds about 8 likes, and still about 6 when the user passes a fifth of the files they would have liked: any extra negatives help a learner
that underfits.
With a converged learner the picture turns. Weak skips add 2.2-3.4 likes when every skip is a real dislike, but when the user
also passes a fifth of the files they would have liked they cost the logistic learner 2-4 likes (held-out
AUC down 0.03-0.08), while the ridge learner, with its leave-one-out regularisation, still gains +0.8 to +1.7
(intervals including zero for the fp32 encoders).
Skips are weak evidence (click-derived preferences agree with explicit judgements about 81% of the time
[joachims]); the recommendation rests on the asymmetry measured here, a small gain when skips are clean against a
larger loss when they are not. Passive skips should stay out of training, and the app's existing path (the user
confirms, then F moves the skips to the dislike folder) already captures their reliable part.

### 3. The default similarity sort does not group by content

| encoder | subject P@1 | subject P@10 | same subject next to each other in the app's sort | copies: R@1 | copies found at 0.1% false pairs |
|---|---|---|---|---|---|
| block-mean hash (app default) | 0.109 | 0.093 | 0.105 | 0.656 | 0.383 |
| CLIP B/32 q8 (app today) | 0.852 | 0.720 | 0.765 | 0.887 | 0.762 |
| CLIP B/32 fp32 | 0.863 | 0.714 | 0.737 | 0.885 | 0.804 |
| CLIP B/32 bnb4 | 0.850 | 0.713 | 0.750 | 0.892 | 0.785 |
| CLIP B/16 fp32 | 0.875 | 0.718 | 0.763 | 0.912 | 0.790 |
| SigLIP 2 B/16 fp32 | 0.870 | 0.740 | 0.753 | 0.952 | 0.935 |
| SigLIP 2 B/16 bnb4 | 0.863 | 0.754 | 0.755 | 0.927 | 0.863 |
| SigLIP 2 B/16 q8 | 0.695 | 0.541 | 0.635 | 0.894 | 0.717 |
| SigLIP 2 B/32-256 fp32 | 0.873 | 0.735 | 0.750 | 0.952 | 0.854 |
| DINOv2-S reg fp32 | 0.878 | 0.697 | 0.753 | 1.000 | 0.996 |
| DINOv2-S reg q8 | 0.784 | 0.642 | 0.691 | 0.988 | 0.921 |
| DINOv2-S fp32 | 0.885 | 0.705 | 0.747 | 1.000 | 0.994 |
| DINOv3-S/16 fp32 | 0.845 | 0.646 | 0.714 | 1.000 | 1.000 |

The app's default sort chains the block-mean hash with a VP-tree: 10.5% of neighbouring files share a subject,
against about 6% by chance (its MST option: 10.7%). The embeddings were ordered by the app's own CLIP sort (a walk of
a minimum spanning tree over a nearest-neighbour graph) and every faithful one does about seven times better; on this
coarse 16-subject task they land within a few points of each other (subject P@1 0.845-0.885). The q8 files of
SigLIP 2 and DINOv2 lose 0.09-0.18 of that P@1 (section 5).

### 4. Near-duplicates: DINOv2 finds every edited copy

Copies found at rank 1, by edit. A rank-1 hit means the nearest other image is the original or another edit of the
same photo; counting the original alone, the rates are lower (0.28 for the hash, 0.36 for CLIP and SigLIP 2, 0.49
for DINOv2 in an independent recount), while "copies found at 0.1% false pairs" in section 3 already counts
original-copy pairs only.

| encoder | crop | jpeg | color | flip | tilt | overlay |
|---|---|---|---|---|---|---|
| block-mean hash (app default) | 0.93 | 1.00 | 1.00 | 0.16 | 0.85 | 0.00 |
| CLIP B/32 q8 (app today) | 1.00 | 0.89 | 1.00 | 1.00 | 1.00 | 0.44 |
| CLIP B/32 fp32 | 1.00 | 0.91 | 1.00 | 1.00 | 0.99 | 0.41 |
| CLIP B/32 bnb4 | 1.00 | 0.93 | 1.00 | 1.00 | 1.00 | 0.42 |
| CLIP B/16 fp32 | 1.00 | 0.91 | 1.00 | 1.00 | 1.00 | 0.56 |
| SigLIP 2 B/16 fp32 | 1.00 | 0.99 | 1.00 | 1.00 | 1.00 | 0.72 |
| SigLIP 2 B/16 bnb4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.56 |
| SigLIP 2 B/16 q8 | 1.00 | 0.56 | 1.00 | 1.00 | 1.00 | 0.80 |
| SigLIP 2 B/32-256 fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.71 |
| DINOv2-S reg fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| DINOv2-S reg q8 | 0.99 | 0.94 | 1.00 | 1.00 | 1.00 | 1.00 |
| DINOv2-S fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| DINOv3-S/16 fp32 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

The hash fails on mirrors and on the bordered, captioned copy, as the literature predicts [mckeown]; CLIP B/32
misses the caption copy more than half the time. DINOv2-small with registers in fp32 (Apache-2.0) found every copy at
rank 1, and at one global threshold that admits 1 unrelated pair in 1,000 it still caught 99.6% of copy pairs,
against 76-80% for CLIP and 38% for the hash. SigLIP 2 sits between (85-94%).

### 5. Quantised model files: the app's q8 file erases most of the learnable quality signal

Cosine between a quantised file's embedding and the fp32 file's embedding of the same image, over all 993 images:

| file | compared with | images | cosine median | 10th percentile | minimum |
|---|---|---|---|---|---|
| clip-b32-q8 (q8, cpu) | clip-b32-fp32 (fp32, cpu) | 993 | 0.915 | 0.864 | 0.685 |
| clip-b32-bnb4 (bnb4, cpu) | clip-b32-fp32 (fp32, cpu) | 993 | 0.969 | 0.951 | 0.845 |
| siglip2-b16-224-q8 (q8, cpu) | siglip2-b16-224-fp32 (fp32, cpu) | 993 | 0.785 | 0.663 | 0.542 |
| siglip2-b16-224-bnb4 (bnb4, cpu) | siglip2-b16-224-fp32 (fp32, cpu) | 993 | 0.968 | 0.951 | 0.889 |
| dinov2reg-s-q8 (q8, cpu) | dinov2reg-s-fp32 (fp32, cpu) | 993 | 0.805 | 0.449 | 0.005 |

The community "q8" exports (dynamic int8, the dtype the app uses) move the vectors much more than the 4-bit
weight-only "bnb4" files, which are also smaller. For CLIP B/32 the q8 damage barely shows when grouping by subject
(fp32 and q8 within about 0.03 in sections 1 and 3, either way), but it shows elsewhere: at strict copy thresholds
(0.762 against 0.804) and above all on the quality taste of section 6, where the same learner loses most of what it
can learn from the fp32 file:

| comparison (logistic, C=1) | 5+5 | 10+10 | 20+20 |
|---|---|---|---|
| CLIP B/32 fp32 minus CLIP B/32 q8 (app today) | +0.053 ± 0.009 (98%) | +0.081 ± 0.010 (100%) | +0.117 ± 0.012 (100%) |
| CLIP B/32 bnb4 minus CLIP B/32 q8 (app today) | +0.038 ± 0.008 (93%) | +0.049 ± 0.012 (93%) | +0.090 ± 0.014 (100%) |
| SigLIP 2 B/16 fp32 minus SigLIP 2 B/16 q8 | +0.013 ± 0.016 (57%) | +0.026 ± 0.015 (68%) | +0.034 ± 0.016 (73%) |

For SigLIP 2 and DINOv2 the q8 files are unusable outright, and the same held for SigLIP 2 B/32-256 (cosine 0.71 over
103 images, against 0.96 for its bnb4 file). Any model change must ship fp32 (or fp16 on a GPU) or bnb4 files and
check fidelity first. The trade-off is speed: on this CPU the bnb4 files ran slower than fp32 (section 8).

### 6. Quality taste: learnable from faithful vectors, slowly

Liked = Commons Quality Image, disliked = an ordinary photo of the same subject (held-out ROC AUC, mean ± 95% CI):

| features | learner | 5+5 | 10+10 | 20+20 |
|---|---|---|---|---|
| 64 + clip-b32-q8 | app logistic (raw) | 0.527 ± 0.016 | 0.556 ± 0.016 | 0.572 ± 0.015 |
| 64 hand-crafted | logistic (standardised, C=1) | 0.545 ± 0.018 | 0.563 ± 0.017 | 0.581 ± 0.017 |
| clip-b32-q8 | logistic (standardised, C=1) | 0.503 ± 0.014 | 0.520 ± 0.013 | 0.546 ± 0.015 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0.557 ± 0.017 | 0.602 ± 0.016 | 0.663 ± 0.018 |
| 64 + clip-b32-fp32 | logistic (standardised, C=1) | 0.561 ± 0.016 | 0.609 ± 0.017 | 0.667 ± 0.018 |
| clip-b32-bnb4 | logistic (standardised, C=1) | 0.541 ± 0.015 | 0.569 ± 0.018 | 0.637 ± 0.020 |
| clip-b16-fp32 | logistic (standardised, C=1) | 0.583 ± 0.018 | 0.632 ± 0.018 | 0.675 ± 0.015 |
| 64 + clip-b16-fp32 | logistic (standardised, C=1) | 0.585 ± 0.017 | 0.637 ± 0.018 | 0.681 ± 0.015 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.530 ± 0.015 | 0.557 ± 0.016 | 0.600 ± 0.013 |
| siglip2-b32-256-fp32 | logistic (standardised, C=1) | 0.522 ± 0.014 | 0.542 ± 0.016 | 0.573 ± 0.012 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0.499 ± 0.014 | 0.522 ± 0.015 | 0.530 ± 0.015 |
| clip-b32-q8 | LAION aesthetic v1 head, no labels | 0.574 ± 0.004 | 0.573 ± 0.006 | 0.571 ± 0.013 |
| clip-b32-q8 | ridge + aesthetic prior | 0.541 ± 0.009 | 0.543 ± 0.008 | 0.542 ± 0.014 |

With few labels every setup is close to chance, but with fp32 CLIP vectors the converged learner climbs steadily:
0.66-0.68 at 20+20 labels for CLIP B/32 and B/16, against 0.55 on the app's q8 vectors and 0.57 for the app's
learner today. SigLIP 2 and DINOv2 learn this taste less well (0.53-0.62). The free LAION head (MIT, 3 KB, on the CLIP
vector the app already has) gives a weak label-free 0.57. Quality Images are judged at full resolution (focus,
noise, exposure) while the benchmark sees 500-px thumbnails, so real folders may do better; a generic "best shot
first" score would need a dedicated quality model, and the strong ones are non-commercial or several GB.

### 7. Zero-shot tags and text search

Each subject's prompt ("a photo of a cat.") tags the 393 photos (accuracy) and ranks them (text search):

| image + text tower | tag accuracy (16 prompts) | text search mAP | text search P@10 |
|---|---|---|---|
| clip-b32-fp32+text-fp32 | 0.911 | 0.884 | 0.956 |
| clip-b32-q8+text-q8 | 0.896 | 0.850 | 0.956 |
| siglip2-b16-224-fp32+text-fp32 | 0.926 | 0.937 | 0.994 |
| siglip2-b16-224-fp32+text-q8 | 0.934 | 0.936 | 0.988 |
| siglip2-b16-224-q8+text-q8 | 0.776 | 0.803 | 0.919 |
| siglip2-b32-256-fp32+text-q8 | 0.924 | 0.936 | 0.988 |

SigLIP 2's q8 text tower is faithful (0.934 vs 0.926 tag accuracy with the fp32 one); only its q8 vision file is
broken. SigLIP 2 B/32-256 matches B/16 here.

### 8. Speed, size and Electron's main process

Dedicated timing runs: one encoder per fresh process, 100 photos after 3 warm-up images, batch 1, default thread
settings, two passes about 20 minutes apart (pass 1 / pass 2). "DirectML" is the runtime's default adapter 0, which
on this laptop is the RTX 3050 Ti: nvidia-smi showed it busy, and pinning adapter 1 (the Radeon 680M) through
`session_options.executionProviders`, which transformers.js passes through [tjs-session], ran SigLIP 2 fp32 at
75.7 ms against 31.5 ms on adapter 0 (60 timed photos each; `results/adapter0-emb.json` and `adapter1-emb.json` in the prototype). The laptop had normal
background load (two unrelated Python processes using about 1.4 cores, editors, the other session), and the passes
differ by up to 3x for the same file (CLIP q8 in Electron: 80 ms, then 25 ms), so compare rows within a pass
rather than absolute times.

| encoder | file MB | CPU infer ms (Node) | CPU decode+prep+infer ms | Electron main, CPU infer ms | DirectML infer ms (RTX 3050 Ti) | Electron main-thread stall p99 ms | peak RSS MB (Node CPU) |
|---|---|---|---|---|---|---|---|
| CLIP B/16 fp32 | 345.1 | 150.5 / 123.5 | 185.9 / 153.6 | 121.7 / 119.6 | 26.9 / 24.2 | 178.8 / 169.2 | 848 / 499 |
| CLIP B/32 bnb4 | 58.3 | 134.4 / 89.2 | 190.2 / 126.6 | 118.7 / 63 | 481.4 / 224.4 | 243.4 / 115.5 | 207 / 216 |
| CLIP B/32 fp32 | 351.7 | 74.8 / 43.3 | 115.5 / 74.2 | 62.1 / 40.9 | 29.8 / 20.1 | 107 / 69.9 | 735 / 499 |
| CLIP B/32 q8 (app today) | 89.1 | 57.6 / 29.8 | 102.6 / 58.2 | 80.2 / 25.1 | failed / failed | 184 / 52.1 | 152 / 243 |
| DINOv2-S reg fp32 | 88.5 | 101 / 88.6 | 133.9 / 114.6 | 98.6 / 92.5 | 91.5 / 83.9 | 131.4 / 125.9 | 239 / 240 |
| DINOv2-S reg q8 | 24.4 | 89.1 / 85.8 | 117.3 / 113.9 | 84.2 / 100.9 | 96.7 / 92.6 | 120.1 / 212.7 | 177 / 187 |
| DINOv3-S/16 fp32 | 86.5 | 56.3 / 54.9 | 83.1 / 81.1 | 57.8 / 56.9 | failed / failed | 99 / 115.1 | 230 / 234 |
| SigLIP 2 B/16 bnb4 | 57.6 | 250.5 / 166.2 | 279.1 / 190.6 | 222.3 / 166 | 632.4 / 434.4 | 345 / 233.4 | 214 / 222 |
| SigLIP 2 B/16 fp16 | 186 | failed / failed | failed / failed | failed / failed | 32 / 23.5 | failed / failed | failed / failed |
| SigLIP 2 B/16 fp32 | 371.8 | 227.2 / 126 | 285.4 / 151.8 | 198.6 / 131.4 | 36.1 / 27.8 | 395.1 / 209.5 | 697 / 541 |
| SigLIP 2 B/32-256 fp32 | 378.5 | 54.9 / 50.8 | 85.2 / 79.7 | 75.1 / 47.8 | 26.8 / 19.5 | 132.6 / 101.2 | 918 / 531 |

Failures, each seen in both passes: the CLIP q8 file crashed the process on DirectML (access violation); SigLIP 2's
fp16 file fails to load on the CPU (an ONNX Runtime graph-fusion error) but runs on DirectML; DINOv3 failed on
DirectML. DINOv2 gains little on DirectML (some of its operators probably fall back to the CPU), and the bnb4 files
are slow there (0.2-0.6 s). The large fp32 encoders (CLIP and SigLIP 2) peaked at 0.5-0.9 GB of memory, against
0.15-0.24 GB for today's q8 CLIP.

onnxruntime-node runs inference synchronously on the JavaScript thread ([ort-backend]), so today every CLIP call
stalls Electron's main process, which also serves every image over `app://` and all IPC. The same 53-photo job, run
in the main process and then in a `utilityProcess`, measured from the main process:

| encoder | pass | where inference runs | main-thread event-loop delay p50 / p99 / max ms | median inference ms |
|---|---|---|---|---|
| CLIP B/32 q8 (app today) | 1 | main process (today) | 6 / 66.2 / 421.3 | 29.3 |
| CLIP B/32 q8 (app today) | 1 | utilityProcess | 15.8 / 20.3 / 21.2 | 27.3 |
| SigLIP 2 B/16 fp32 | 1 | main process (today) | 5 / 163.7 / 975.7 | 126 |
| SigLIP 2 B/16 fp32 | 1 | utilityProcess | 15.6 / 25.3 / 848.3 | 131.5 |
| CLIP B/32 q8 (app today) | 2 | main process (today) | 5.6 / 55.6 / 424.1 | 28.9 |
| CLIP B/32 q8 (app today) | 2 | utilityProcess | 15.2 / 19.9 / 21.3 | 29.4 |
| SigLIP 2 B/16 fp32 | 2 | main process (today) | 5 / 211.3 / 1019.2 | 125.6 |
| SigLIP 2 B/16 fp32 | 2 | utilityProcess | 15.5 / 20.1 / 23.2 | 127.1 |

Each inference holds the main process for its own duration (p99 56-66 ms over the CLIP runs, 164-211 ms for SigLIP 2
B/16), and the maxima of 0.4-1.0 s come from loading the library and the model, which also blocks (an independent
probe split them: about 0.2 s to load transformers.js, 0.4-0.6 s to create the CLIP session, at most 64-107 ms per
inference). In the utility process the main thread's p99 stayed at about 20 ms in both passes; pass 1's SigLIP 2
utility run still showed one 848 ms spike that did not recur in pass 2 (maximum 23 ms). The p50 figures reflect
Windows' timer granularity, not load: an idle Electron main process on this machine shows the same p50 of about
15.6 ms.

### 9. Robustness: an artwork-heavy second set

The first download (CC0 "depicts" without the camera filter: mostly museum reproductions such as prints, ceramics
and drawings; 388 images and 480 copies) was kept as a second, harder test collection:

| encoder | subject P@1 | subject P@10 | same subject next to each other in the app's sort | copies: R@1 | copies found at 0.1% false pairs |
|---|---|---|---|---|---|
| block-mean hash (app default) | 0.095 | 0.089 | 0.101 | 0.675 | 0.398 |
| CLIP B/32 q8 (app today) | 0.631 | 0.475 | 0.530 | 0.869 | 0.702 |
| CLIP B/32 fp32 | 0.637 | 0.457 | 0.532 | 0.879 | 0.719 |
| SigLIP 2 B/16 fp32 | 0.686 | 0.491 | 0.576 | 0.908 | 0.792 |
| SigLIP 2 B/16 q8 | 0.505 | 0.345 | 0.416 | 0.810 | 0.558 |
| DINOv2-S reg fp32 | 0.657 | 0.510 | 0.581 | 1.000 | 0.965 |
| DINOv2-S reg q8 | 0.606 | 0.441 | 0.525 | 0.979 | 0.912 |

| features | learner | 2/16, 3+3 | 2/16, 10+10 | 2/16, 30+30 | 5/16, 3+3 | 5/16, 10+10 | 5/16, 30+30 |
|---|---|---|---|---|---|---|---|
| 64 + clip-b32-q8 (app today) | app logistic (raw) | 0.602 | 0.650 | 0.753 | 0.562 | 0.599 | 0.658 |
| clip-b32-q8 | app logistic (raw) | 0.724 | 0.790 | 0.878 | 0.624 | 0.699 | 0.785 |
| 64 + clip-b32-q8 | app logistic (standardised) | 0.689 | 0.778 | 0.849 | 0.604 | 0.698 | 0.812 |
| 64 + clip-b32-q8 | app logistic (train-standardised) | 0.703 | 0.799 | 0.897 | 0.593 | 0.698 | 0.818 |
| 64 + clip-b32-q8 | logistic (standardised, C=1) | 0.729 | 0.798 | 0.889 | 0.624 | 0.724 | 0.834 |
| clip-b32-q8 | logistic (standardised, C=1) | 0.736 | 0.804 | 0.891 | 0.628 | 0.727 | 0.836 |
| clip-b32-q8 | kNN-3 | 0.739 | 0.819 | 0.918 | 0.620 | 0.738 | 0.850 |
| clip-b32-fp32 | logistic (standardised, C=1) | 0.735 | 0.795 | 0.889 | 0.629 | 0.722 | 0.831 |
| siglip2-b16-224-fp32 | logistic (standardised, C=1) | 0.754 | 0.826 | 0.913 | 0.638 | 0.753 | 0.856 |
| siglip2-b16-224-fp32 | kNN-3 | 0.750 | 0.833 | 0.926 | 0.627 | 0.750 | 0.857 |
| siglip2-b16-224-q8 | logistic (standardised, C=1) | 0.679 | 0.733 | 0.818 | 0.603 | 0.668 | 0.756 |
| dinov2reg-s-fp32 | logistic (standardised, C=1) | 0.725 | 0.795 | 0.888 | 0.618 | 0.715 | 0.822 |
| 64 hand-crafted | app logistic (raw) | 0.550 | 0.571 | 0.623 | 0.537 | 0.553 | 0.565 |

The learner result holds: on today's CLIP vectors every proper learner beats the app by +0.06 to +0.19 (88-100% of
trials); the recommended first fix, today's learner on inputs standardised with the training files' statistics,
gains less here (+0.03 to +0.16, 73-100%). Here, where the subjects are harder to recognise, SigLIP 2 B/16 in fp32 beats CLIP on every measure:
subject P@1 0.686 against 0.631, copies 0.79 against 0.70, like-model AUC +0.01 to +0.03.

## What the research found (cited sources)

**Image embeddings.** Every modern contrastive encoder beats the app's CLIP ViT-B/32 (ImageNet zero-shot 63.3%,
38-dataset average 52.5 [openclip-results]). The best fit is **SigLIP 2 B/16**: 78.2% zero-shot at 224 px, 72.1%
ImageNet 10-shot, COCO text-to-image R@1 52.1 [siglip2], Apache-2.0 weights [siglip2-card], ready ONNX exports whose
q8 vision tower is 94.6 MB [siglip2-onnx], loading in the installed transformers.js 4.0.1 as `SiglipVisionModel`
(model_type `siglip`). SigLIP 2 B/32-256 (74.0% zero-shot, 66.6% 10-shot [siglip2]) is the speed-parity option.
For instance-level matching the self-supervised DINO family wins by a wide margin (Oxford-Hard mAP 43.2 for DINOv2
ViT-S/14 vs 19.7 for OpenCLIP ViT-G/14 [dinov2]); DINOv3 ViT-S/16 reaches 49.5 [dinov3-card] but ships under the
custom DINOv3 License [dinov3-licence], so DINOv2 with registers (Apache-2.0) is the clean choice. Excluded on
licence: MobileCLIP/MobileCLIP2 and AIMv2 (Apple research-only [mobileclip2-licence]), MetaCLIP 2 and jina-clip-v2 (CC BY-NC).
OpenAI CLIP B/16 is the only 512-dimension upgrade with a ready vision-only export, at about 2-4x the compute
(linear probe 80.2 vs 76.1 for B/32 [clip]); OpenCLIP's LAION-2B and DataComp B/32 and B/16 checkpoints are also
512-dimensional, but the one onnx-community export found (LAION-2B B/32) ships only a combined image-and-text model.

**Aesthetic and quality scoring.** The large multimodal scorers lead the benchmarks (KonIQ SRCC 0.93-0.95, AVA
0.80-0.83) but are large (Q-Align, DeQA-Score and ArtiMuse 7-8B parameters; Q-ReAlign Mini 0.8B) with no
transformers.js path. Dedicated IQA networks (TOPIQ, MUSIQ, LIQE,
MANIQA, CLIP-IQA+) need ONNX conversions and the strongest are non-commercial (pyiqa: PolyForm-NC code, CC BY-NC-SA
weights [pyiqa]). The near-free option is a **linear head on the CLIP B/32 vector the app already computes**: LAION's
aesthetic predictor v1 (MIT, 3,047 bytes [laion-aes]); a linear probe on frozen CLIP B/32 reaches AVA SRCC 0.683
[hentschel]. Personal aesthetics on top of a generic prior is the published recipe (FLICKR-AES 10-shot SROCC
0.51-0.67 [piaa]).

**Vision-language tagging.** Zero-shot tags and text search from the encoder's own text tower cost one dot product
per tag per image once the image vector exists. RAM++ (Apache-2.0) tags better (OpenImages-common mAP 86.4 for the released Swin-L model,
against 73.6-76.6 for a CLIP zero-shot baseline [ram++]) but its int8 ONNX is 873 MB and runs about 0.7 s per image on CPU
[ram++-onnx]. Small VLMs caption and answer questions at seconds per image on CPU (Florence-2 about 1-3 s, cited;
Qwen3.5-0.8B and SmolVLM estimated at 1-5 s): background-queue material, not sorting.

**Faces and near-duplicates.** Licence-clean face grouping exists: the face-api FaceRecognitionNet the app already
bundles (LFW 99.38%; dlib-derived weights, CC0 [face-api]) or YuNet + SFace (MIT / Apache-2.0, LFW
99.40 [sface]); all InsightFace weights are non-commercial [insightface]. For near-duplicates, 256-bit perceptual hashes
survive re-encoding and resizing but fail under small crops, borders and mirrors [mckeown]; Immich groups duplicates
with a cosine threshold on the same OpenAI CLIP ViT-B/32 the app uses (maxDistance 0.01 [immich-config]).

**Learning from likes, dislikes and skips.** With frozen embeddings and 10-500 labels, convex learners fitted to
convergence match or beat trained adapters: GDA (closed-form Gaussian discriminant, ensembled with CLIP's zero-shot
text classifier, which a like model does not have) 76.05% vs 71.10% for a standard linear probe at 16 shots [gda]; zero-shot-initialised linear probes [zslp]. The app's learner is the weakest form of the right family:
plain SGD, three epochs once 13 or more samples, a fixed L2 of 0.001, and no scaling between the 64 hand-crafted
features (0-1 each) and the 512 CLIP numbers (about 0.044 each). Relative judgements inferred from behaviour agree
with explicit ones 80.8% of the time against 89.5% between two human judges [joachims], so skips are weak evidence:
low-weight negatives or "liked over skipped-above" pairs, not dislikes. Compare-mode ratings already train the model
as likes and dislikes; tournament picks are pairwise judgements the app collects and does not learn from (a
Bradley-Terry model could use them).

**Running models inside Electron.** onnxruntime-node runs every inference synchronously on the JavaScript thread
(`dist/backend.js`: `run()` calls the native session inside `setImmediate`), so today each CLIP call stalls the
Electron main process, which also serves every image and video over `app://` and handles all IPC. Microsoft's
Electron guide puts ONNX Runtime in a utility process [ms-electron-ort]. onnxruntime-node on Windows ships DirectML
(and, through transformers.js v4, a native WebGPU provider); DirectML's adapter 0 is "the default adapter", and
DirectML itself is in sustained engineering, with new feature work moved to Windows ML [dml-docs].

## What this does not show

- **Tastes are synthetic.** "Liked" means a subject (2 or 5 of 16) or a reviewer-promoted Quality Image. Real taste
  mixes subject, style, people and quality, so the absolute AUCs will not transfer. The direction of the learner
  result held on two very different collections (photos, and an artwork-heavy set), which is the part to trust.
- **Thumbnails.** Every image is a JPEG thumbnail about 500 px wide. Real folders hold multi-megapixel files, videos, GIFs and JXL, so
  decode costs are higher than measured here, and full-resolution quality cues (focus, noise) are invisible.
- **The 64 hand-crafted features are handicapped here.** Their file-metadata part (size, resolution, format,
  video) is nearly constant across thumbnails and their 3 face numbers are zero, so they carry less signal than in
  real folders. That is why the recommendation keeps them, standardised, instead of dropping them.
- **Balanced, small label sets.** n likes always meet n dislikes; real like and dislike folders are imbalanced.
- **One machine, under load.** Timings come from one laptop while another session ran tests in the same checkout.
  The dedicated timing runs were sequential, one encoder per process, but background load was not controlled.
- **Synthetic near-duplicates.** Six edit types on 80 photos; real bursts (consecutive shots of one scene) were not
  tested, and a grouping threshold must be tuned on real folders.
- **Label noise.** Subjects come from Commons "depicts" statements: a butterfly can sit under "flower", a portrait
  under "car". The noise is the same for every encoder.

## Left undone

- **Face grouping** was researched, not prototyped. The licence-clean path is the face-api FaceRecognitionNet the
  app already bundles, or YuNet + SFace. Measuring it needs identity-labelled public-domain faces, which this
  dataset lacks.
- **Pairwise learning** from tournament outcomes (Bradley-Terry) was not simulated: with binary synthetic tastes it
  would only re-encode the labels. Compare-mode ratings already train the model as likes and dislikes.
- **utilityProcess** was measured as a stall comparison, not built into the app.
- **SigLIP 2 fp16 on the CPU** fails to load (an ONNX Runtime graph-fusion error); not investigated further,
  since fp16 belongs on the GPU.
- **Real-folder validation** on the user's own like and dislike folders, by the ground rule of this task.
- **Videos** (keyframes) were not tested.

## Open questions (decisions for you; the assumption I took is named)

1. **Shared branch.** Another Claude session was committing G2 PR 2 work in this same checkout during this research.
   *Assumption taken:* everything was built outside the repo and copied in only for the final commit, which stages
   only `docs/research/2026-10-22-ai-sorting.md`, `prototypes/ai-sorting/` and the one `docs/README.md` row. The
   research commit therefore sits inside the G2 PR 2 branch history. Should it move to its own branch before that PR
   is reviewed? (I did not move it: you asked for this branch, and moving it means rewriting history.)
2. **Planning documents.** *Assumption taken:* no plan file, BACKLOG, TODO or DONE edits, because the other session
   owns those files on this branch right now. The recommendation above lists the entries to file; route them
   (they are Claude-surfaced, so 🟤 by the intake rules) when you next plan.
3. **"Public-domain samples."** *Assumption taken:* Wikimedia Commons files under CC0 (a public-domain dedication),
   re-checked against each file's own licence field. If you meant strictly expired-copyright or government works,
   the same scripts take a different licence statement (P6216 = public domain).
4. **DINOv3's custom licence.** It allows free use but adds trade-control and military-use clauses and a
   ship-the-licence condition on redistribution. *Assumption taken:* treated as not acceptable by default, so
   DINOv2 (Apache-2.0) is the recommended near-duplicate upgrade. Say if you are fine with the DINOv3 terms.
5. **What a skip means.** Using skips as training data would change the meaning of Next from "not now" to "probably
   not", and with the improved learner it cost 2-4 likes per 60 shown once the user passed a fifth of the files they would
   have liked.
   *Assumption taken:* recommend keeping passive skips out of training and relying on the existing confirm-then-F
   path. Say if you skip only what you dislike; then weak skips gained 2-3 likes.
6. **Download size, memory and GPU.** Switching CLIP to its fp32 file means 352 MB instead of 89 MB and 0.5-0.74 GB
   of memory while loaded instead of 0.15-0.24 GB. The SigLIP 2 B/32-256 vision file is 378 MB in fp32 (64 MB as
   bnb4, slower on the CPU), its text tower for search adds 283 MB, and it holds 0.5-0.9 GB while loaded. DirectML is
   a Windows-only path. Are one-time downloads of 0.3-0.7 GB acceptable, and is Windows-only GPU acceleration fine?
7. **Real-data check.** The benchmark's tastes are synthetic (liked subjects, reviewer-promoted quality). The
   decisive test is your own like and dislike folders, cross-validated locally with nothing uploaded. I did not
   touch them (your rule: repo or public-domain images only). Should a follow-up run the same harness on them?

## Sources

Load-bearing sources only; the surveys behind this report cited 254. Each was read with a generic User-Agent.

| Key | Source | Used for |
|---|---|---|
| openclip-results | [OpenCLIP results table](https://github.com/mlfoundations/open_clip/blob/main/docs/openclip_results.csv) | CLIP B/32 ImageNet zero-shot 63.3%, 38-dataset average 52.5 |
| clip | [Radford et al. 2021, CLIP](https://arxiv.org/abs/2103.00020) | linear-probe protocol (L-BFGS logistic regression, tuned C); B/16 80.2 vs B/32 76.1 linear probe |
| siglip2 | [Tschannen et al. 2025, SigLIP 2](https://arxiv.org/abs/2502.14786) | B/16-224: 78.2% zero-shot, 72.1% 10-shot, COCO T2I R@1 52.1; B/32-256: 74.0 / 66.6 |
| siglip2-card | [google/siglip2-base-patch16-224](https://huggingface.co/google/siglip2-base-patch16-224) | Apache-2.0 |
| siglip2-onnx | [onnx-community/siglip2-base-patch16-224-ONNX](https://huggingface.co/onnx-community/siglip2-base-patch16-224-ONNX) | q8 vision 94.6 MB, text 283.4 MB (hub API) |
| dinov2 | [Oquab et al. 2023, DINOv2](https://arxiv.org/abs/2304.07193) and [repo](https://github.com/facebookresearch/dinov2) | Oxford-Hard 43.2 (ViT-S/14) vs 19.7 (OpenCLIP ViT-G/14); Apache-2.0 |
| dinov3-card | [facebook/dinov3-vitb16-pretrain-lvd1689m](https://huggingface.co/facebook/dinov3-vitb16-pretrain-lvd1689m) | ViT-S/16 Oxford-Hard 49.5 |
| dinov3-licence | [DINOv3 License](https://github.com/facebookresearch/dinov3/blob/main/LICENSE.md) | custom terms |
| mobileclip2-licence | [apple/MobileCLIP2-S2 LICENSE](https://huggingface.co/apple/MobileCLIP2-S2/blob/main/LICENSE) | research-only |
| laion-aes | [LAION aesthetic predictor](https://github.com/LAION-AI/aesthetic-predictor) and [LICENSE](https://github.com/LAION-AI/aesthetic-predictor/blob/main/LICENSE) | v1 B/32 head, MIT, 3,047 bytes |
| hentschel | [Hentschel, Kobs, Hotho 2022, "CLIP knows image aesthetics"](https://pmc.ncbi.nlm.nih.gov/articles/PMC9732445/) | linear probe on CLIP B/32, AVA SRCC 0.683; zero-shot prompts 0.435-0.539 |
| piaa | [Few-shot personalised aesthetics, arXiv 2407.07176](https://arxiv.org/abs/2407.07176) | FLICKR-AES 10-shot SROCC 0.51-0.67 |
| pyiqa | [IQA-PyTorch weights](https://huggingface.co/chaofengc/IQA-PyTorch-Weights) | non-commercial weights for TOPIQ etc. |
| ram++ | [Huang et al. 2023, RAM++](https://arxiv.org/abs/2310.15200) | OpenImages-common mAP 86.6 (Swin-B) / 86.4 (released Swin-L) vs CLIP 73.6-76.6 |
| ram++-onnx | [ram-plus-onnx-int8](https://huggingface.co/anakhiu/ram-plus-onnx-int8) | 873 MB int8, ~0.7 s per image on CPU |
| face-api | [face-api.js](https://github.com/justadudewhohacks/face-api.js) and [dlib-models](https://github.com/davisking/dlib-models) | FaceRecognitionNet LFW 99.38%; dlib weights CC0 |
| sface | [OpenCV Zoo SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) | LFW 0.9940, Apache-2.0 |
| insightface | [InsightFace model zoo](https://github.com/deepinsight/insightface/tree/master/model_zoo) | weights non-commercial |
| mckeown | [McKeown & Buchanan 2023](https://arxiv.org/abs/2212.08035) | perceptual hashes break under crops, borders, mirrors |
| immich-config | [Immich config.dto.ts](https://github.com/immich-app/immich/blob/main/server/src/dtos/config.dto.ts) | duplicate detection on CLIP ViT-B/32, maxDistance 0.01 |
| gda | [Wang et al. 2024, GDA (ICLR)](https://arxiv.org/abs/2402.04087) | 16-shot 76.05% vs linear probe 71.10% |
| zslp | [Silva-Rodriguez et al. 2024, CLAP / ZS-LP](https://arxiv.org/abs/2312.12730) | prior-initialised linear probes vs adapters |
| joachims | [Joachims et al. 2005](https://www.sigir.org/wp-content/uploads/2017/06/p003.pdf) | clicks vs explicit judgements: 80.8% agreement vs 89.5% between judges |
| ms-electron-ort | [Microsoft: Windows ML in an Electron app](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-js-winml) | run ONNX Runtime in a utility process |
| dml-docs | [ONNX Runtime DirectML EP](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html) | device_id 0 = default adapter |
| ort-backend | `node_modules/onnxruntime-node/dist/backend.js` lines 113-117 (installed 1.24.3) | `run()` executes the native session inside `setImmediate` |
| tjs-session | `node_modules/@huggingface/transformers/src/models/session.js` line 92 (installed 4.0.1) | `session_options.executionProviders ??=`, so a deviceId can be pinned |
| commons | [Wikimedia Commons API](https://commons.wikimedia.org/w/api.php) | benchmark images; licence per file |

## Verification record

**Research claims.** After the six surveys, two fact-checking agents re-opened the shortlisted candidates' sources
(model cards, LICENSE files, Hugging Face file listings through the hub API, papers' tables): 164 checks, 148
confirmed, 15 corrected, 1 unverifiable. Corrections carried into this report: SigLIP 2 B/16's vision tower is
about 93M parameters with its pooling head (not 86M); RAM++'s 86.6 mAP is the paper's Swin-B model, the released
Swin-L scores 86.4; CLIP B/32 zero-shot aesthetic accuracy is 72.5% (fixed prompt), 73.7% (context-aware) and 75.6%
(ensembled); Immich's published CPU timings cannot serve as encoder cost ratios; SFace's LFW figures come from the
SFace model README. Unverifiable: Sculley (KDD 2010) on combined regression and ranking (the ACM page returned 403),
so this report does not rest on it.

**Measurements and report.** A fresh-context verifier, a separate agent that had not seen this work, checked the
draft before commit:
- It re-ran the scoring on copies of the results: `metrics.json` matched in every compared value (59,177 on the photo
  set, 28,883 on the robustness set) except the run time, and the analysis and the table generator reproduced their outputs byte for byte;
  every measurement-table line in the draft appeared verbatim in the generator's output.
- With its own code it recomputed subject P@1, copy R@1 and copies found at 0.1% false pairs for the hash, CLIP,
  SigLIP 2 and DINOv2, and the app learner's AUC driven through the real `ml-worker.js`; all matched (the hash to
  within tie-breaking). It re-ran the fidelity, zero-shot, timing and fit-timing checks, re-opened every row of the
  Sources table with a generic User-Agent, and checked the code claims against the repository.
- It reported 27 discrepancies, all corrected in this version. The material ones: the quality-taste result was
  understated (fp32 CLIP learns it to 0.66-0.68 and the app's q8 file erases most of that), which turned "keep q8 on
  the CPU" into "switch CLIP to fp32"; the dimension change touches 27 lines in 7 files including
  `feature-cache-transport.js`, not 23 in 6; the utility runs' 15-16 ms median wake-up is this machine's idle timer
  granularity, not busy-waiting threads, so a thread-cap recommendation built on it was dropped; and the 0.4-1.0 s
  main-thread maxima are library and model loading, not single inferences. Its probes also showed that standardising
  with the training files' statistics works and that the skip benefit was measured with only one learner, so
  `bench.js` gained the "train-standardised" learner and the logistic learner in the skip simulation; the second
  reversed the skip recommendation. The rest were precision and attribution fixes (DirectML adapter pinning, the
  adapter comparison re-measured with both records kept, ranges, GDA's zero-shot ensembling, compare-mode ratings
  already training the model, 512-dimension alternatives, 240 distinct sources among 254 citations, the photographer
  count, artwork reproductions left in the photo set, the lighthouse Quality Images, R@1's definition, the fit-timing
  dimensions, the shuffle seed, the VLM speed citations, DirectML's sustained-engineering status, wording).
- After the additions the scoring was re-run: all 1,132 previously verified result cells and the similarity results
  were unchanged.

**Second pass.** The same verifier then checked this version. The current `bench.js`, re-run on fresh copies,
reproduced both re-scored `metrics.json` files exactly apart from the run time; `analyze.js` and `report-tables.js`
reproduced their outputs byte for byte; and the 1,132 photo-set and 538 robustness-set rows of the first run were
unchanged. With its own code it recomputed the training-file standardisation cells, the fp32-minus-q8 quality pairs
and the logistic skip simulation (an independent primal solver that agrees with the prototype's dual solver to
1e-10); every cell matched. A probe confirmed that SigLIP 2's 1 s maxima are model loading. It found all 27
first-round items fixed; its remaining points (the subject-taste qualifier on the learner gains, how the 20% pass
rate was described, a source used beyond what it shows, the robustness range of the recommended fix, and small
leftovers) are corrected here.
