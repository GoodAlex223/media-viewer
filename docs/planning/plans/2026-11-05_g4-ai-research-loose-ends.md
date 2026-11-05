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
- [ ] `real-folders.js` and its self-test committed before the first real run, so the pass mark below predates every number
- [ ] Real run done; overall numbers only in the report; the outgoing diff grepped for names
- [ ] Parked commit kept as a verified patch, then the branch deleted (user's condition: "if nothing will be lost")
- [ ] One PR open against `main`

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
5. [ ] Real run on the three contexts, in the job scratch folder (started 2026-11-05, after `c61843b`; in the background)
6. [ ] Overall numbers into the report, stating how many tastes the verdict rests on; replace the README's "Plan, about 20 minutes" with the measured time; re-run the outgoing name check; commit
7. [ ] Push; delete `g3-departed-clips-parked` once the patch is on origin; open the PR; ask about deleting `research/local-ai-sorting` on origin; ask before any review in this chat

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
- **Tools in the job scratch folder, not in git** (`$CLAUDE_JOB_DIR/tmp`): `pairs.json` (real paths, never commit), `real-folders/` (the run's output: `real-folders.md`, `.json`, or `.partial.json` while running), `outgoing-name-check.js` and `outgoing-name-hits.js`, `mutate.js`.

---

## 5. Key Discoveries

*Filled at completion.*

---

## 6. Future Improvements

### Enhancement Ideas

| Idea | Rationale | Effort | Priority |
|------|-----------|--------|----------|
| Re-run this check on fp32 vectors after P4a | The report found the learner fix helps quality tastes only with fp32; this run is q8 only | S | M |
| Measure near-duplicate thresholds on these contexts for P4c | The group counts here are a first look at real copy rates | S | L |

### Technical Debt

| Item | Why It Exists | Impact | Remediation |
|------|---------------|--------|-------------|
| 173 `Liked_N`/`Disliked_N`-style names across 20 tracked files, tests included, against spec § 15's "never folder names" | Written before the rule, or as test fixtures | M: the rule and the tree disagree | The user rules: replace with placeholders, or narrow the rule. Frozen docs may take placeholder redactions (ruling of 2026-10-30) |
| The training/scoring vector mismatch (dims 42–47, 54–61) | Background extraction posts no metadata | M: A1's "check first" item; confirmed in code, its size measured here | A1 decides, with this run's numbers |

### Spawned Tasks

None yet.

---

## 7. Testing

### Test Plan

- [x] `node --test prototypes/ai-sorting/real-folders.selftest.js`: the cache filter, the as-scored transform against `extractFeatures`, L-BFGS against the exact dual solver, group folds, planted signal, planted leak, shuffled labels, each verdict outcome, the privacy sentinels, the repo refusal
- [x] Hooks on every commit
- [ ] The real run's count cross-check against the model cache's summary (17,507 / 13,542; 14,776 / 185; 4 / 22)

### Test Results

| Test | Result | Notes |
|------|--------|-------|
| Self-test | Pass, 31 of 31 | Seen failing first; re-run on the formatted commit |
| Mutation check, in a scratch copy | 21 of 21 killed | Baseline read before and after. Two survivors on the way each exposed a test gap, both closed: a fatal error whose message holds a path, and a fold-balance fixture with more likes only |
| Pre-commit hook on the merge | Pass, 2,636 unit tests | `prototypes/` and `docs/research/` byte-identical to `96d9b22` afterwards |

---

## 8. Review

- [ ] Self-review complete
- [ ] Review in a separate chat (asked first)
- [ ] Review comments addressed
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
| `BACKLOG.md` / `TODO.md` — the three entries closed, plus A1's gate note, in the closeout commit | |
| Deploy record | N/A: no deploy step (WEEKLY: Auto-deploy no) |
| Live docs — late findings corrected; the v2 spec's superseded note | |
| `docs/README.md` — plan indexed | |
| Memory — durable decisions and patterns captured | |

---

*Template version: 1.4*
