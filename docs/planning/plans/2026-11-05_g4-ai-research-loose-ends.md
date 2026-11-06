# G4 AI research loose ends - Implementation Plan

**Task Reference**: WEEKLY.md G4 (Oct 26–30, Cleanup Week #5, spilled); BACKLOG 🟤 [2026-10-25] "Open the AI-sorting research's own PR (`research/local-ai-sorting`, commit `96d9b22`)"; 🟤 [2026-10-27] "Run the AI-sorting research harness on the user's own like/dislike folders, committing only overall numbers"; 🟤 [2026-10-16] "Decide the parked source-CLIP reuse branch"
**Created**: 2026-11-05
**Status**: In Progress
**Last Updated**: 2026-11-05

---

## 1. Task Overview

**Goal**: Land the AI-sorting research on `main`, measure the like-model learner fix on the user's own folders with overall numbers only, and retire the parked branch.

**Context**: The v2 spec rests A1, P4a and P4c on a report that lived only on a branch. A1 (the learner fix) is gated on a real-data check (spec § 12.3, D28), because the research's tastes are synthetic. The parked branch has waited since 2026-10-16.

**Success Criteria**:
- [x] `96d9b22` is an ancestor of the branch, its files byte-identical, its `docs/README.md` row present (`74c5daa`)
- [x] Personal-data check of all 43 files and the commit message passed, with a control that fires
- [x] `real-folders.js` and its self-test committed before the first real run, so the pass mark below predates every number (`c61843b`)
- [x] Real run done; overall numbers only in the report; the outgoing diff grepped for names (`747bea4`)
- [x] Parked commit kept as a verified patch, then the branch deleted (user's condition: "if nothing will be lost"; deleted 2026-11-05 after the patch was confirmed on origin, 554 lines)
- [x] One PR open against `main` (#97)

---

## 2. Analysis

### Problem Restatement

The harness measures synthetic tastes on Commons photos, and its input is a manifest of subject labels, so it cannot take a real like folder and dislike folder as they are. The check needs a small driver that reuses the harness's learners on real labels and scores held-out files the way the app scores files.

### The user's context, which shaped the design

**Like and dislike folders are chosen per main folder, so each main folder is its own taste** (user, 2026-11-05). The app keeps only the current pair (`customLikeFolder`/`customDislikeFolder`), but `userData/ml-model-cache.json` records the pair behind each cached model. At the time of writing it holds three distinct pairs. Labels at planning, read with the paths masked:

| Context | Likes | Dislikes | Note |
|---|---|---|---|
| largest | 17,507 | 13,542 | near balance |
| lopsided | 14,776 | 185 | 98.8% likes |
| tiny | 4 | 22 | below the floor below |

So the check runs per context and never pools them: pooling would learn which main folder a file came from, not what the user likes.

### Approaches Considered

| Approach | Pros | Cons |
|----------|------|------|
| Re-embed the folders with the harness's `embed.js` | Could also compare fp32 | Strict decode rejects some files; no video or JXL path; over an hour on 31k files (estimate, from the report's per-image times); a model download |
| Read each folder's `.feature_cache.json` | The vectors the app really trains on, videos and JXL included; no download; the app's own reader (`readFeatureCacheFile`) | Today's q8 CLIP only, so no fp32 comparison |
| Pool all pairs | One number | Measures folder identity, against the user's stated use |

### Selected Approach

Read the caches, per context. fp32 is not measured here. P4a's move to fp32 is already decided (D29), so a re-check after it is the natural place.

### The measurement

- **Learners, all fed the same trials**: `app today` (raw SGD, `appLogisticFit`, matching `ml-worker.js` `trainFromHistorical`), `app + z-scoring` (A1's first step), `converged + z-scoring` (A1's second step: L2 logistic, C = 1, L-BFGS, because the prototype's exact dual solver takes 6 s at 500 labels). For context only: CLIP-only variants, kNN-3, and the converged fit with the file-metadata dims left out of training.
- **Held-out files are scored the way the app scores files.** Training vectors come from `computeFeatures` with real metadata; vectors scored at sort time come from background extraction, which posts no metadata (`media-viewer.js` `extract` message, `feature-worker.js` `metadata || {}`). So dims 42–47 and 54–61 of every held-out vector are replaced with the values `extractFeatures(image, {})` produces. The as-trained score is reported beside it as the control: the gap between them is what a plain cross-validation would have overstated.
- **Near-duplicates stay in one fold.** Files joined by CLIP cosine ≥ 0.95 share a fold (the first of 0.95, 0.97, 0.99 whose largest group is at most 5% of the files, chosen from group sizes alone). A one-repeat run with plain folds shows how much this mattered.
- **Numbers**: 5 folds × 2 repeats; held-out ROC AUC; likes among the first 60 shown; dislikes among the last 60; a learning curve at 3, 10, 30, 100 and 300 per side.
- **Privacy**: the script writes and prints numbers and context letters only. No file or folder name reaches its output, an error message included, so none reaches git or the chat. It refuses an output folder or pairs file inside any git repository.

### Pass mark (fixed before any numbers exist)

Set by Claude, approved by the user on 2026-11-05, then widened from one pair to several contexts when the user explained their use. Encoded in `verdict()` and committed before the first real run.

A context is **usable** with at least 30 labels per class after the stale filter. In a usable context, take the better of `app + z-scoring` and `converged + z-scoring`. It **passes** when, at all labels, against `app today`, on held-out files scored as the app scores them:

1. its mean paired AUC gain is at least +0.03;
2. the paired 95% CI of that gain is above zero;
3. likes in the first 60 do not drop, meaning the upper CI of the change is not below zero. This clause is skipped when likes are at least 90% of the labels, since any order then shows almost only likes.

Outcome across the usable contexts:

| Outcome | When | What happens |
|---|---|---|
| **Go** | all pass | A1 goes ahead |
| **Go, z-scoring only** | all pass, and z-scoring alone is within 0.01 AUC of the converged fit in each | A1 shrinks to the ~1 SP step |
| **Mixed** | some pass | reported for the user's ruling, no automatic outcome |
| **Wait** | none pass | A1 waits and is re-checked after P4a, not dropped: the report found the fix helps quality tastes only with fp32 vectors |
| **Void** | a shuffled-label control fails | the numbers are not used |
| **No verdict** | no usable context | as it says |

**Controls**: with labels shuffled, each main learner's mean AUC must land within `max(0.01, 3 × SE)` of 0.5, with SE from the class counts. The self-test plants a real signal, a metadata leak and duplicate files, and each must be detected.

### Assumptions

- The three pairs in the model cache stand in for the user's tastes. **This is a real limit on the verdict.** The cache keeps only the last 5 models (`MODEL_CACHE_LIMIT`), all 5 were saved on 2026-11-05, and 3 of them are the tiny pair, so older main folders are absent by recency, not by choice. With the tiny pair below the floor, the verdict rests on two tastes, one of them with only 185 dislikes. The report must say how many tastes it rests on. Other main folders' pairs could have been added: asked on 2026-11-05 whether any should be, the user ruled "no, finish with the current pairs".
- The cached vectors match what the app trains on, which the stale filter and a count cross-check against the model cache's summary (17,507 / 13,542 etc.) test.

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| A cache entry for a file since moved or changed | The app's rule: skipped when absent from the listing, or when size or mtime differs; counted, never named |
| An entry with no CLIP vector | Skipped and counted; cached models imply near-full coverage |
| 98.8% likes | First-60 clause skipped; AUC and last-60 dislikes still informative; CI is wider with 37 dislikes per fold |
| 4 likes | Below the floor: counts reported, no verdict contribution |
| A group holding likes and dislikes | Stays in one fold; its count is reported |
| Scan chaining into a giant group | The threshold ladder above |
| A failed read whose message names a path | Only `err.code` or `err.name` is printed; the self-test asserts it |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A file or folder name reaches git | High: only a history rewrite removes it | No per-file output by construction; self-test with sentinel names; grep of the outgoing diff before push |
| Numbers flatter the fix | High: A1 would ship on a false premise | As-scored primary; near-duplicates grouped; shuffled-label control; pass mark fixed first |
| The script has a bug that favours a learner | High | Self-test against the exact dual solver and planted signals |
| A long run on a low-memory laptop | Low | One thread; Float32 matrices (about 72 MB for the largest context) |

---

## 3. Implementation Plan

### Files Affected

| File | Action | Purpose |
|------|--------|---------|
| `docs/research/2026-10-22-ai-sorting.md` | Merge, then Modify | The report; gains a real-folder section with overall numbers |
| `prototypes/ai-sorting/**` | Merge | The harness, byte-identical to `96d9b22` |
| `prototypes/ai-sorting/real-folders.js` | Create | The driver |
| `prototypes/ai-sorting/real-folders.selftest.js` | Create | Its tests (`node --test`), outside the app's suite so the prototype stays deletable whole |
| `prototypes/ai-sorting/bench.js` | Modify | Export `standardiser` and `trainStandardisedFit` |
| `prototypes/ai-sorting/README.md` | Modify | How to run the real-folder check |
| `docs/archive/plans/2026-10-13_g3-departed-clips-parked.patch` | Create | The parked commit, kept |
| `docs/README.md` | Modify | The two rows that say the branch exists; this plan at closeout |

**Live-surface preflight:** `docs/README.md` rows for the G3 source-CLIP plan and spec assert the parked branch exists (in the table above). The v2 spec's "Its own PR is still to come" and "lives on `research/local-ai-sorting`" are in a frozen spec: a superseded note at closeout. BACKLOG entries close at closeout. `PROJECT.md` and `CLAUDE.md` name neither branch (grep at closeout).

### Dependencies

- `feature-cache-ledger.js` (`readFeatureCacheFile`, `listMediaEntries`), `media-formats.js`, `feature-extractor.js`, `ml-model.js`, `stream-json`: read-only reuse, no new dependency.

### Model and Effort

| | Choice | Why |
|---|---|---|
| SP | 3 → ~4.25 | The harness could not take real folders, so the real-data item is a small script with a solver and tests, not a run |
| Execution | Opus · this session, in place of WEEKLY's Sonnet · `medium` | The failure to fear is a plausible wrong number, not a compile error |
| Switch | none | One script, one session |
| Final review | `high`, in a separate chat (WEEKLY's standard review) | Public push; the app is untouched and the E2E gate should skip |

### Implementation Steps

1. [x] Personal-data check; merge `96d9b22` (`74c5daa`)
2. [x] Save the parked commit as a patch and verify it: patch ID equal, parent + patch = the commit's tree. Then one fixture path's folder name replaced by a placeholder, verified as the only difference
3. [x] Commit this plan, the patch and the index rows (`b965eff`)
4. [x] Self-test first, seen failing; then `real-folders.js`; self-test passing; commit before any real run (`c61843b`)
5. [x] Real run on the three contexts, in the job scratch folder (first attempt 2026-11-05, after `c61843b`, stopped by Claude Code for low memory; see the log. Restarted on the user's word, same evening; finished in 55 min. **Outcome: wait**)
6. [x] Overall numbers into the report, stating how many tastes the verdict rests on; replace the README's "Plan, about 20 minutes" with the measured time; re-run the outgoing name check; commit (`747bea4`; name check on it: the same 8 file names, 1 stem and 1 folder string as at `c61843b`, all coincidences by shape and surroundings)
7. [x] Push; delete `g3-departed-clips-parked` once the patch is on origin; open the PR; ask about deleting `research/local-ai-sorting` on origin; ask before any review in this chat (pushed with the user's "yes": ratchet at the ceiling, E2E skipped; parked branch deleted, it was local only; PR #97, 8 commits, head `5cf4b2c`; `research/local-ai-sorting` deleted on origin and locally on the user's "yes, delete it", its commit kept in #97; the user runs the review in a separate chat)

---

## 4. Implementation Log

### 2026-11-05 — PHASE: Planning

- Scan of the outgoing diff: one identity or path hit in 17,189 lines, a comment naming `%APPDATA%\Electron`. JSON path-like strings are the harness's relative image paths and model names. `host` records hold only CPU model, core count and Node version. The report names the laptop's CPU and GPU, needed to explain the timings; kept.
- The merge passed the whole pre-commit hook (2,636 unit tests), and `prototypes/` and `docs/research/` are byte-identical to `96d9b22`.
- Lint and format on a scratch copy of the prototype: ESLint 0 problems over 22 files, Prettier clean, so no ignore entry is needed.
- App code the harness reuses, `b7e07f9..main`: `ml-model.js`, `ml-worker.js`, `feature-extractor.js` and `sorting-worker.js` unchanged; `perceptual-hash.js` gained one export.
- Parked branch: of 314 meaningful added lines, 303 were verbatim in the archived plan, so "nothing lost" was not yet true. 11 were not: 6 comment lines, one test-mock line repeated 4 times and one test assertion. The patch closes that gap.

### 2026-11-05 — PHASE: Implementation

- **Deviations from the approved description, each told to the user**: the check runs per context rather than on one pair, after the user explained their use; pairs come from the model cache, so nobody types a path and no name reaches the chat; the patch was not in the description, and was added to meet the user's condition on the delete.
- **Measured, not inferred**: `extractFeatures` itself shows metadata changes exactly dims 42–47 and 54–61 and no pixel dim, which turns the spec's "inferred, not measured" into a measurement. The self-test pins it. The size of the effect on ranking comes from the real run.
- **Bugs the self-test caught in my first draft**: the fold balance mixed the two classes, so a like-only group avoided a fold for its dislike count (`likes 36,24,24,20,16`); the solver stopped on a relative-objective check before the gradient met its bound.
- **A mutant escaped its scratch copy**: with the repo refusal off, it wrote to the `--out` the test named, inside the worktree, because `MV_REPO` pointed there. Every later run then failed on that folder. It looked like a flake and failed every time. The folder's two files were read and deleted, and the mutation harness now cleans up after each mutant.
- **Outgoing name check** (counts only, planted controls fire), over every folder and file name in the three contexts, on the branch as of `c61843b`: 8 file names, 1 stem and 1 folder string matched, all coincidences by shape and surroundings (digit tails of Commons IDs, common words, a `README.md`, a single-letter folder string). No distinctive name. To re-run before the push, since the numbers commit is still to come.
- **Tools in the job scratch folder, not in git** (`$CLAUDE_JOB_DIR/tmp`): `pairs.json` (real paths, never commit), `real-folders/` (the run's output: `real-folders.md`, `.json`, or `.partial.json` while running), `outgoing-name-check.js` and `outgoing-name-hits.js`, `mutate.js`. That folder is deleted with the job, so the evidence was later copied to a durable place (see the last log entry).
- **First real run, stopped, not failed** (started 14:21 local, in the background):
  - The lopsided taste finished in about 5 minutes (partial file written 14:26). Its counts match the model cache (14,776 / 185), with nothing stale, pruned or missing CLIP.
  - The largest taste (31,049 files) ran about 46 minutes awake and finished the grouping, the 2 × 5 folds, the curve up to 300 per side and the shuffled-label control. The power log then shows a hibernation from 15:12:49 to 21:03:01.
  - Claude Code stopped the run at 21:03:24, 23 seconds after the wake, for low memory (1.2 GB free of 15.2 GB), with the plain-fold control and kNN still to run.
  - The script saves each finished taste but does not reuse it, so a restart measures the lopsided taste again. A resume flag would save 5 minutes, which isn't worth a change to code committed before the run.
  - "Plan, about 20 minutes" was low for the largest taste: the README gets the time measured on the rerun.
  - The restart waits for the user, per the rule on stopped background runs.
- **The real run** (restarted on the user's "yes, restart", 21:49:23 to 22:44:46, exit 0):
  - Counts match the model cache in all three contexts: 17,507 / 13,542; 14,776 / 185; 4 / 22. Nothing stale and no missing CLIP; 6 cache entries for files no longer in a dislike folder were skipped.
  - Both shuffled-label controls passed, so the outcome is not void. Reproducible: taste B matched the first run's saved result in all 345 non-timing values, and a planted 1e-9 change was caught.
  - **Outcome by the pass mark, applied as written: wait.** A: best candidate converged + z-scoring, +0.005 (CI +0.003 to +0.008), short of +0.03. B: both candidates far worse (-0.266, -0.356). C: too small. A1 waits and is re-checked after P4a, per § 2.
  - **What it found instead:** the train/score metadata mismatch is the larger loss. Today's model reaches 0.918 / 1.000 as trained and 0.724 / 0.707 as scored. Leaving metadata out of training gains +0.058 in A (CI +0.052 to +0.063, all folds) and +0.007 in B (CI spans zero), but it was not pre-registered, so it's a lead, not a result. Re-checked in code before writing it up: every writer of the source folder's feature cache leaves metadata out (worker `extract` posts pixels only, `media-viewer.js:10563`; priority extraction calls `extractFeatures(imageData)`, `:10062`; the only `computeFeatures` caller passes `useHostCache: false`, `:252`).
  - **Cost:** a converged fit takes about 50 s at about 25,000 labels (1,052 L-BFGS iterations), against 0.3 s for today's SGD.
  - Report section 10 holds the overall numbers, with dated notes where the original text asserts the fix (Summary 1, Ranking row 1, Recommendation 1, the 64-features caveat, *Left undone*, question 7). The README's time estimate is replaced with the measured 55 minutes.
- **A side agent's note, relayed by the user, confirmed:** my write-up implied the fp32 switch was what the fix lacked. P4a changes only the CLIP half; the 64 hand-crafted dims come from the renderer's extraction, which P4a leaves alone, so a re-check after P4a with the same candidates would likely fail again. The verdict and the pass mark are unchanged. The report, the § 6 rows and A1's closeout gate note now put a decided fix for the metadata gap before the re-check. Re-reading for the note also showed that the as-trained column already estimates the other fix (sort-time vectors carrying metadata): 0.918 in A against 0.782 without metadata, a lead, since it was a control.
- **Where the run's evidence lives, for the review** (a second side-agent note: the job's scratch folder is deleted with the job): `%APPDATA%\media_viewer\research\2026-11-05-real-folders\` on the user's machine, outside any repository. It holds `real-folders.md` and `.json` (section 10's source), both runs' console output, the first run's saved taste, `repro-check.js`, both name-check scripts (made to read their own folder), and a `README.txt`. Hashes were checked after the copy, and both scripts were re-run from the copy with unchanged results. Its `pairs.json` holds real paths: never commit or paste it.

### 2026-11-06 — PHASE: Review round 1 (issuecomment-6671026802: 8 issues, 3 held back)

- **Fixed in the script** (each test seen failing first; 42 of 42 pass): #1 only a folder read becomes a status, and an evaluation that throws fails the run (`measurePair`); #5 the repo refusal also checks the real path, so a junction no longer gets past; #6 a cache of another version is refused as `unreadable: CACHE_VERSION`, pinned to `media-viewer.js`'s constant by a test; #7 the flags are validated (integers, minimums 2/1/2, unknown flags refused, a fixed usage line that repeats no input). A `value === undefined` check was dropped as dead code: no input reaches it that the integer test or the required-flag check doesn't already refuse.
- **Mutation check, in a scratch copy:** 13 of 13 killed (9 new mutants, plus the 4 old ones whose code moved), with a 42-of-42 baseline before and after, and nothing left in the worktree.
- **#3 measured, not changed:** a probe reproduced the run's folds exactly (clamped AUC equal to the saved means, difference 0) and re-scored today's learner by raw margin. 0.0% of held-out scores reached the clamp, and AUC and likes in the first 60 were unchanged to four decimals in both tastes, so every gain stands, the +0.058 lead included. Grouping took 529 s at 31,049 files and 105 s at 14,961 in that probe, with the CPU shared with the mutation run.
- **#4 computed from the saved results:** the corrected intervals are 1.871× wider, and no AUC conclusion changes (report § 10 lists them). Round 2 found that "no conclusion changes" overreached: 6 of the 20 first-60 and last-60 intervals change side (see below).
- **#2, #3, #4 and #8 are preconditions** on the re-check row in § 6, so closeout carries them to BACKLOG. #2 changes the user-approved rule, so I asked: the user ruled yes ("Agree, yes", 2026-11-06), for the re-check. `verdict()` is not changed now: it encodes this run's fixed pass mark, and the re-check implements its rule with its other preconditions.
- **Provenance:** the report's numbers come from the script at `c61843b`. This round's script changes touch only paths that run never reached, which the README and report § 10 now say.
- The reviewer session's transcript holds no remark beyond the comment.

### 2026-11-06 — PHASE: Review round 2 (issuecomment-6671966111: 3 issues, 3 held back; round 1 accepted)

- **#1, the clamp check covered only today's learner.** Right: my probe re-scored `app today` and its CLIP-only variant, and `app + z-scoring` goes through the same `predict()`. The extended probe reproduced every saved mean exactly (AUC and likes in the first 60), then re-scored all three by margin. Today's learner: 0 held-out scores at the clamp (largest margin 7.5 in A, 5.6 in B). Z-scoring: 29,346 of 62,098 in A and 8,960 of 29,922 in B, with margins up to 79. By margin, z-scoring gets 0.666 in A (gain −0.058, not −0.078) and 0.325 in B (−0.383), and 51.3 likes in A's first 60, not 40.2. The outcome is unchanged: z-scoring was scored as shipped, and it stays far below +0.03 by margin too. Report § 10 and precondition (c) are corrected, and a new § 6 row records the A1 input (rank by margin).
- **#2, "every interval" was false outside AUC.** Confirmed by recomputing all 30 paired changes: 6 of the 20 first-60/last-60 intervals change side, including the one the report prints (A's converged first-60 +2.2 → −0.4 to +4.8). Report § 10 is now limited to the AUC gains and gives the corrected first-60 interval.
- **#3, an unreadable context still left the verdict to the others.** Fixed: `verdictInput` marks it unread, `verdict()` gives `no verdict` (a failed shuffled control still outranks it, as `void`), and the outcome line names the context. Too-small contexts stay excluded, since their counts are known. This adds a "no verdict" trigger for missing data and moves no threshold; this run never reached it. 3 new tests and an assertion, seen failing (45 pass); 6 of 6 mutants killed.
- **Held back:** all three agreed, no change. I withdraw round 1's "the n = 1 edge is closed": a curve size near a fold's class count can still leave one trial and print `n/a`, in a context-only row.

### 2026-11-06 — PHASE: Review round 3 (issuecomment-6675610212: 1 minor issue, 1 held back; round 2 accepted)

- **#1, "about half":** right, that holds for A's 47% only. Both report sentences now give 30% and 47% ("a third to a half"). A search for the claim across the branch's docs found no other copy; the § 6 row already had both figures.
- **Held back, the curve's z-scoring rows also score through `predict()`:** the reviewer asked for no action. I scoped the report's curve sentence instead: those rows were not re-scored by margin, so how much of their loss is ties is not known. Precondition (c) covers the re-check.

---

## 5. Key Discoveries

*Filled at completion.*

---

## 6. Future Improvements

### Enhancement Ideas

| Idea | Rationale | Effort | Priority |
|------|-----------|--------|----------|
| Close the train/score metadata gap (🟤, Claude-surfaced), **before the re-check below** | Measured here: today's model loses 0.19-0.29 AUC between training and sort-time vectors. Two candidate fixes, both leads: leave dims 42–47 and 54–61 out of training (0.782 in A, +0.058; B +0.007, CI spans zero), or pass metadata to background and priority extraction so sort-time vectors match (the as-trained column estimates it: 0.918 in A, 1.000 in B, with the open question whether folder-separating metadata ranks a main folder's files too). The user decides which; it needs its own pass mark | S-M | H |
| Re-run this check after the gap fix, on fp32 vectors once P4a lands | § 2's outcome table sends a wait to after P4a, but fp32 changes only the CLIP half and the measured loss is in the metadata dims, so after P4a alone it would likely fail again (a side agent's note, confirmed 2026-11-05). Pre-register the chosen gap fix as a candidate. **Preconditions before its pass mark is committed (PR #97 review):** (a) read the active model's vectors: D29 puts fp32 in an optional `clipVectors` field keyed by model id, with no version bump, so today's reader of `clipVector` would measure q8 again and nothing would show it (review #8); (b) "go, z-scoring only" requires z-scoring to pass clauses 1–3 on its own, not only to sit within 0.01 of the converged fit (review #2; **the user ruled yes on 2026-11-06**: "Agree, yes". It applies to the re-check; this run's pass mark in § 2 and `verdict()` stay as committed); (c) score every learner the way the shipped model will be scored: through `predict()` if A1 keeps its clamp at \|z\| > 20, else every learner by margin (review #3 and round 2 #1: today's learner never reached the clamp, but z-scoring tied 47% of A's held-out scores and 30% of B's); (d) clause 2 uses the Nadeau–Bengio corrected resampled t interval, about 1.9× wider at 5 × 2 folds (review #4) | S-M | M |
| A1 ranks by margin, not by the clamped sigmoid (🟤, input to A1) | Measured in review round 2: behind today's `predict()`, which returns exactly 1 or 0 past \|z\| > 20, a z-scored model put 47% (A) and 30% (B) of held-out scores at exactly 0 or 1, and A's likes in the first 60 fell to 40.2 where its margin order gives 51.3. Today's model never reaches the clamp (largest margin 7.5) | S | M |
| A converged fit's cost at real sizes (🟤, input to A1) | About 50 s per fit at 25,000 labels on one thread, against the report's estimate of under a second; A1 would need a cap, a warm start or a worker budget | S | M |
| Measure near-duplicate thresholds on these contexts for P4c | The group counts here are a first look at real copy rates | S | L |

### Technical Debt

| Item | Why It Exists | Impact | Remediation |
|------|---------------|--------|-------------|
| 173 `Liked_N`/`Disliked_N`-style names across 20 tracked files, tests included, against spec § 15's "never folder names" | Written before the rule, or as test fixtures | M: the rule and the tree disagree | The user rules: replace with placeholders, or narrow the rule. Frozen docs may take placeholder redactions (ruling of 2026-10-30) |
| The training/scoring vector mismatch (dims 42–47, 54–61) | Background and priority extraction post no metadata | H, measured: 0.918 → 0.724 (A), 1.000 → 0.707 (B) between training and sort-time vectors | The "close the gap" row above |

### Spawned Tasks

None yet.

---

## 7. Testing

### Test Plan

- [x] `node --test prototypes/ai-sorting/real-folders.selftest.js`: the cache filter, the as-scored transform against `extractFeatures`, L-BFGS against the exact dual solver, group folds, planted signal, planted leak, shuffled labels, each verdict outcome, the privacy sentinels, the repo refusal
- [x] Hooks on every commit
- [x] The real run's count cross-check against the model cache's summary (17,507 / 13,542; 14,776 / 185; 4 / 22): all three match

### Test Results

| Test | Result | Notes |
|------|--------|-------|
| Self-test | Pass, 31 of 31 | Seen failing first; re-run on the formatted commit |
| Mutation check, in a scratch copy | 21 of 21 killed | Baseline read before and after. Two survivors on the way each exposed a test gap, both closed: a fatal error whose message holds a path, and a fold-balance fixture with more likes only |
| Pre-commit hook on the merge | Pass, 2,636 unit tests | `prototypes/` and `docs/research/` byte-identical to `96d9b22` afterwards |
| Real run | Exit 0, 55 min; controls passed; outcome wait | Taste B reproduced in all 345 non-timing values across the two runs; the comparison caught a planted 1e-9 change |
| Self-test after review round 1 | Pass, 42 of 42 | 11 new tests, the 6 behaviour tests seen failing on the unfixed code |
| Mutation check, review round 1 | 13 of 13 killed | Baseline 42 of 42 before and after |
| Clamp probe (#3) | No held-out score at 0 or 1; AUC shift 0.0000 | Reproduced the saved means exactly before measuring |
| Self-test after review round 2 | Pass, 45 of 45 | 3 new tests and one assertion, seen failing first |
| Mutation check, review round 2 | 6 of 6 killed | Baseline 45 of 45 before and after |
| Clamp probe, extended (round 2 #1) | Today's learner 0 saturated; z-scoring 47% (A) / 30% (B) | Reproduced every saved AUC and first-60 mean exactly before measuring |

---

## 8. Review

- [x] Self-review complete (every report number checked against the run's output; the wording fixes of `747bea4` and `5cf4b2c`)
- [x] Review in a separate chat (asked first; the user ran it: round 1, issuecomment-6671026802)
- [x] Review comments addressed (round 1; the response comment names the fix commit)
- [ ] Approved

---

## 9. Closeout Artifacts

Run after the merge, on `main`.

| Artifact | Done / N/A + reason |
|----------|---------------------|
| `BACKLOG.md` — improvements extracted, routed by source | |
| `TODO.md` — actionable items, plus § Spawned Tasks rows for out-of-tree work | |
| `docs/archive/plans/` — plan moved here, original deleted | |
| `DONE.md` — entry with plan link, summary, key changes | |
| `WEEKLY.md` — Summary-Table Status an identifier; Daily-Schedule entry marked done; the user-in-the-loop line | |
| `BACKLOG.md` / `TODO.md` — the three entries closed, plus A1's gate note (wait; re-check after a decided fix for the metadata gap, not after P4a alone), in the closeout commit | |
| Deploy record | N/A: no deploy step (WEEKLY: Auto-deploy no) |
| Live docs — late findings corrected; the v2 spec's superseded note | |
| `docs/README.md` — plan indexed | |
| Memory — durable decisions and patterns captured | |

---

*Template version: 1.4*
