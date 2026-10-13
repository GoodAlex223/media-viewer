# G3. Source-Folder CLIP Reuse on a Training-Cache Miss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G3 (🔵, 3 SP → ~4 SP); BACKLOG 🔵 [2026-10-04] "Explain and trim the retrain that runs after files are moved into the like folder outside the app", item (3) only
**Spec**: [2026-10-13-g3-source-clip-reuse-design.md](../../superpowers/specs/2026-10-13-g3-source-clip-reuse-design.md) (committed `f8e1c53`, user-approved 2026-10-13)
**Created**: 2026-10-13
**Status**: Planned — awaiting the user's review of this plan and their choice of execution method
**Last Updated**: 2026-10-13
**Branch**: `g3-source-vector-reuse` (from `main` @ `c2673c4`)
**Trial vehicle**: none (the group already carries a user dependency — Checkpoints A and B)

**Goal:** When a file whose CLIP vector the source folder already holds turns up in a training folder (an Explorer move or an in-app rating), the next AI-sort rebuild reuses that CLIP half instead of running CLIP again — proven by a before/after perf-log run on the user's real `Liked_2` → `Liked_3` folders.

**Architecture:** Instrumentation first: `MlTrainingManager` writes one perf-log line per `ensureTrainedModel` call and `handleSortByPrediction` one per sort — that build is the user's "before" run. Then the host gains a session-only `departedClips` map (fed by the source-cache load's prune and by `removeFileFromList`) and a read-only `_lookupSourceClip(file)`, injected into the manager as `lookupSourceClip`; `_collectFolderVectors` asks it before `extractClipEmbedding` on a miss. Only the CLIP half is reused — the 64-dim half is always computed with `computeFeatures` (spec § 2.2: source-folder 64-dim vectors lack file metadata).

**Tech Stack:** Electron 39 renderer (`media-viewer.js`, ES module, no bundler), pure-ESM `ml-training.js`, Vitest 4 (node environment, extract-method tests), Prettier 3, ESLint 9 flat config.

**Spec:** [docs/superpowers/specs/2026-10-13-g3-source-clip-reuse-design.md](../../superpowers/specs/2026-10-13-g3-source-clip-reuse-design.md) — executors read both.

## Global Constraints

- **D1 — CLIP half only.** The 64-dim half of a training row is always `computeFeatures(file.path, file)` (or a training-cache hit). Never copy a source-folder 64-dim vector into a training row.
- **D6 — CLIP on only.** `lookupSourceClip` is consulted only when `enableClipFeatures` (the value `ensureTrainedModel` passes into `_collectFolderVectors`) is true.
- **Isolation (CLAUDE.md § Cache Management, design doc 2026-09-10 § 4.1).** The manager never writes `featureCache`/`clipCache`/`featureMetadata`, and never writes `departedClips`. `_lookupSourceClip` writes nothing and returns a **copy** (`Float32Array.from`). `departedClips` is never read by `_saveFeatureCacheLocked`.
- **Match rule.** Reuse needs `name` equal, `size === file.size` and `mtimeMs === file.mtimeMs` exactly (the same identity every feature cache uses).
- **D4 — cap.** `departedClips` holds at most **5000** entries; the oldest is evicted; the first eviction of a session writes exactly `Departed CLIP vectors over 5000: evicting the oldest` to the perf log.
- **D5 — lifecycle.** `departedClips` is cleared in `loadFolder` beside `featureCache`/`clipCache`/`featureMetadata`; never persisted.
- **D3 — perf log only.** All diagnostics go through `logPerf` (`media-viewer-perf.log`); none through `logError` except the lookup-failure messages in § 6. Exact formats:
  - `ML training: source=<trained|session|model-cache|skipped|aborted|failed> total=Nms | scan=Nms | likes: load=Nms (disk N) misses=N clipReused=N noSourceCopy=N features=Nms clip=Nms save=Nms | dislikes: … | bulk=Nms | train=Nms | modelCacheWrite=Nms` (Task 1 has no `clipReused`/`noSourceCopy`; Task 3 adds them). Segments for phases that did not run are omitted.
  - `AI sort: outcome=<done|cancelled|failed|stopped> total=Nms | mlInit=Nms | clipLoad=Nms | sourceCacheLoad=Nms | training=Nms (<source>) | extract=Nms | sort=Nms | files=N` — phases that did not run are omitted.
  - `Source CLIP not reused for <name>: source size/mtime <s>/<m> vs training <s>/<m>`
- **Diagnostics never fail work.** A throwing `logPerf` or `now` is swallowed; a throwing or wrong-length lookup is a miss (extracted), logged via `logError`.
- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. Code below may wrap differently after formatting — expected.
- **ESLint**: `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; prefix unused with `_`). `curly: 'all'` is configured but switched off by `eslint-config-prettier`, applied last — so one-line `if (…) return …;` bodies are fine, and `ml-training.js` uses them throughout.
- **Extracted-method tests run in the global scope.** Every `this.*` a method touches must be on the mock ctx; class statics resolve through `globalThis.MediaViewer`; `window` must be stubbed when the code path touches it. That is why `DEPARTED_CLIP_LIMIT` is a local `const` inside `_rememberDepartedClip` (not a class static).
- **Every new test must fail against the code before its step lands** — record the failure in the Progress Log. Tests that pass by construction are labelled where they appear, with the mutation that makes them fail.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Never `--no-verify`. Pre-push runs the full E2E suite for any non-docs push.
- **Grep rule (CLAUDE.md § Best Practices)**: re-read every comment attached to code you change; grep code, tests and comments for any prose describing changed behavior.
- **Commits**: one per task; in subagent-driven mode the **controller** commits (memory: subagent commits vs the memory hook). Trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A source folder at a drive root (`D:\`) or with Windows separators** — expected: the live lookup builds `D:\a.jpg` / `C:\…\Liked_2\a.jpg`, the same key `load-folder` gives the file. Pinned in Task 2 (`builds the source path correctly for a Windows folder and a drive root`).
2. **A sort cancelled after a reused file was collected** — expected: nothing is persisted to the training cache and the line reads `source=aborted`. Pinned in Task 3 (`persists nothing when the sort is cancelled mid-collection, reused entries included`).
3. **Training throws mid-rebuild** (worker gone) — expected: the error still propagates to the sort, and exactly one `source=failed` line is written. Pinned in Task 1 (`writes source=failed and still rejects when training throws`).
4. **A name that is both departed (stale) and still live in the source folder (fresh)** — e.g. moved out, then a same-named copy put back — expected: the fresh live vector is used and no near-miss line is written. Pinned in Task 2 (`a stale departed entry gives way to a fresh live one`).
5. **The same file departs twice** (moved in-app, undone, edited, moved again) — expected: the newer entry replaces the older and counts as newest for eviction. Pinned in Task 2 (`re-remembering a name replaces the older entry and moves it last`).

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `ml-training.js` | Modify | `formatTrainingPerfLine` (export), `logPerf`/`now`/`lookupSourceClip` callbacks, `_now`, `_writeTrainingPerf`, `ensureTrainedModel` → wrapper + `_ensureTrainedModelImpl`, per-folder `stats` from `_collectFolderVectors`, `_reuseSourceClip`, the reuse branch |
| `media-viewer.js` | Modify | Constructor: `departedClips`, `_departedClipEvictionLogged`, injected `logPerf` + `lookupSourceClip`; `handleSortByPrediction` phase timing; new `_logSortPerf`; `_loadFeatureCacheLocked` departed staging; `removeFileFromList` retire; new `_rememberDepartedClip`, `_lookupSourceClip`; `loadFolder` clear |
| `tests/ml-training.test.js` | Modify | Perf-line tests (Task 1), reuse tests (Task 3) |
| `tests/media-viewer-utils.test.js` | Modify | `handleSortByPrediction` perf tests + `_logSortPerf` (Task 1); `departedClips`/`_rememberDepartedClip` on every `removeFileFromList` ctx (Task 2) |
| `tests/like-or-skip-glue.test.js` | Modify | Same two fields on every `removeFileFromList` ctx (Task 2) |
| `tests/source-clip-reuse.test.js` | Create | Host half: `_rememberDepartedClip`, both feeds, `_lookupSourceClip`, `loadFolder` clear (Task 2); the composition test (Task 3) |
| `CLAUDE.md` | Modify | § Testing ctx list, § Cache Management (Task 4) |
| `docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md` | Modify | Dated pointer note (Task 4) |

Live-surface preflight (plans README step 4): `PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_CONTEXT.md`, `README.md` were grepped 2026-10-13 for `MlTrainingManager`, `getBulkRatedContext`, `removeFileFromList`, `logPerf`, "training vector" — only `PROJECT.md:96` names `MlTrainingManager`, as "done", which stays true. `CLAUDE.md` is the one live surface to update.

## Planning-time refinements of the spec (no design change)

1. **`mlInit` phase.** The AI sort line also times the lazy worker init when it runs (the first sort after launch), so the total is explained. Spec § 7 lists phases "that ran"; this adds one.
2. **The lookup is awaited.** `_reuseSourceClip` does `await this.lookupSourceClip(file)`, so a sync or async host callback both work. The host's `_lookupSourceClip` is sync.
3. **A wrong-length lookup result is logged** (spec § 6's table says "rejected → extracted"; § 9 test 5 says "error logged"). Both are honored: rejected, extracted, and one `logError` line.
4. **`misses` is defined** as files that needed extraction work: absent from the training cache, or present without their CLIP half while CLIP is on (the `!hadHit || needsClip` branch).
5. **`ensureTrainedModel` source on abort.** The wrapper logs `aborted` only when the body returned `skipped` with the signal tripped; a body that finished training logs what it returned.

## Task Ordering

| Order | Task | Depends on | Execute with |
| --- | --- | --- | --- |
| 1 | Instrumentation (the "before" build) | — | Sonnet · `high` |
| A | **Checkpoint A — the user's before run** | Task 1 committed | the user |
| 2 | Host: `departedClips`, its feeds, `_lookupSourceClip` | Task 1 | Sonnet · `high` |
| 3 | Manager: reuse the source CLIP half + composition test | Tasks 1, 2 | Sonnet · `high` |
| B | **Checkpoint B — the user's after run** | Task 3 committed | the user |
| 4 | Docs: `CLAUDE.md`, the 2026-09-10 spec note | Task 3 | Sonnet · `medium` |
| — | Finish: suite, lint, push, PR, review | all | controller |

Tasks 2 and 3 may proceed while Checkpoint A is pending — the before run needs only Task 1's commit checked out. If the user runs it later, check out Task 1's SHA for the run (`git switch --detach <sha>`, then back).

---

## Task 1: Instrumentation — one perf line per rebuild and per sort

**Files:**
- Modify: `ml-training.js` (constructor ~L134-152; `_collectFolderVectors` ~L461-514; `ensureTrainedModel` ~L663-892)
- Modify: `media-viewer.js` (constructor's `new MlTrainingManager({…})` ~L195-242; `handleSortByPrediction` ~L9100-9302; new `_logSortPerf` right after it)
- Test: `tests/ml-training.test.js`, `tests/media-viewer-utils.test.js`

**Interfaces:**
- Produces: `export function formatTrainingPerfLine(perf)`; manager callbacks `o.logPerf(line)` and `o.now()`; `this._now()`; `_collectFolderVectors(...)` now returns `{ rows, clipMissing, failed, aborted, stats }` with `stats = { loadMs, diskCount, misses, featuresMs, clipMs, saveMs }`; `perf` record fields `source, start, totalMs, scanMs, likes, dislikes, bulkMs, trainMs, modelCacheWriteMs`; host `_logSortPerf(perf)` with `perf = { start, outcome, phases: [[name, ms, note?]] }`.

- [ ] **Step 1: Write the failing manager tests**

In `tests/ml-training.test.js`, add `formatTrainingPerfLine` to the import list at the top:

```js
import {
    DESCRIPTOR_KEYS,
    buildDescriptor,
    fingerprintDescriptor,
    seedFromFingerprint,
    formatTrainingPerfLine,
    MlTrainingManager,
} from '../ml-training.js';
```

Add a new top-level describe right after the `seedFromFingerprint` describe:

```js
// G3 spec § 7: the perf-log line for one ensureTrainedModel call.
describe('formatTrainingPerfLine (G3)', () => {
    it('rounds to whole milliseconds and leaves out phases that did not run', () => {
        expect(
            formatTrainingPerfLine({
                source: 'trained',
                totalMs: 1234.6,
                scanMs: 4.4,
                likes: { loadMs: 40.5, diskCount: 1200, misses: 5, featuresMs: 300.2, clipMs: 912.7, saveMs: 80 },
                trainMs: 150.49,
            })
        ).toBe(
            'ML training: source=trained total=1235ms | scan=4ms | likes: load=41ms (disk 1200) misses=5 features=300ms clip=913ms save=80ms | train=150ms'
        );
    });

    it('is just the head when nothing ran', () => {
        expect(formatTrainingPerfLine({ source: 'skipped', totalMs: 0 })).toBe('ML training: source=skipped total=0ms');
    });
});
```

Inside `describe('ensureTrainedModel', …)`, immediately before its closing `});` (after the `passes a fingerprint-derived seed…` test), add:

```js
    // G3 spec § 7: one perf-log line per call, on every return path, written from a finally.
    describe('perf line (G3)', () => {
        const perfOverrides = () => ({ logPerf: vi.fn(), now: () => 0 });

        it('writes one line for a rebuild, with every phase', async () => {
            const { m } = scenario({ managerOverrides: perfOverrides() });
            await m.ensureTrainedModel({});
            expect(m.logPerf.mock.calls).toEqual([
                [
                    'ML training: source=trained total=0ms | scan=0ms | likes: load=0ms (disk 0) misses=3 features=0ms clip=0ms save=0ms | dislikes: load=0ms (disk 0) misses=3 features=0ms clip=0ms save=0ms | bulk=0ms | train=0ms | modelCacheWrite=0ms',
                ],
            ]);
        });

        it('writes a short line for a session hit', async () => {
            const { m } = scenario({ managerOverrides: perfOverrides() });
            await m.ensureTrainedModel({});
            m.logPerf.mockClear();
            await m.ensureTrainedModel({});
            expect(m.logPerf.mock.calls).toEqual([['ML training: source=session total=0ms | scan=0ms']]);
        });

        it('writes source=skipped when no training folders are configured', async () => {
            const { m } = scenario({
                managerOverrides: { ...perfOverrides(), getConfig: vi.fn(() => ({ versions })) },
            });
            await m.ensureTrainedModel({});
            expect(m.logPerf.mock.calls).toEqual([['ML training: source=skipped total=0ms']]);
        });

        it('writes source=aborted when the sort was cancelled', async () => {
            const { m } = scenario({ managerOverrides: perfOverrides() });
            const controller = new AbortController();
            controller.abort();
            await m.ensureTrainedModel({ signal: controller.signal });
            expect(m.logPerf.mock.calls).toEqual([['ML training: source=aborted total=0ms']]);
        });

        it('writes source=failed and still rejects when training throws (Review Focus 3)', async () => {
            const { m } = scenario({
                managerOverrides: {
                    ...perfOverrides(),
                    trainModel: vi.fn(async () => {
                        throw new Error('worker gone');
                    }),
                },
            });
            await expect(m.ensureTrainedModel({})).rejects.toThrow('worker gone');
            expect(m.logPerf).toHaveBeenCalledTimes(1);
            expect(m.logPerf.mock.calls[0][0]).toMatch(
                /^ML training: source=failed total=0ms \| scan=0ms \| likes: .* \| dislikes: .* \| bulk=0ms$/
            );
        });

        it('never fails a rebuild when the sink or the clock throws', async () => {
            const { m } = scenario({
                managerOverrides: {
                    logPerf: vi.fn(() => {
                        throw new Error('sink');
                    }),
                    now: () => {
                        throw new Error('clock');
                    },
                },
            });
            const res = await m.ensureTrainedModel({});
            expect(res.source).toBe('trained');
        });
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ml-training.test.js`
Expected: FAIL — the `formatTrainingPerfLine` describe fails with `formatTrainingPerfLine is not a function`; the `perf line (G3)` tests fail because `m.logPerf` is never called (`expected [] to deeply equal [...]`). The `never fails…` test passes by construction before the change (nothing calls the sink or clock yet) — it pins Step 3's try/catch; mutation-check after Step 3 by removing the `try` in `_now` and watching it fail. Record the output in the Progress Log.

- [ ] **Step 3: Implement the manager instrumentation**

In `ml-training.js`, after the `round6` helper (before `export class MlTrainingManager`), add:

```js
const ms = (v) => `${Math.round(Number(v) || 0)}ms`;

/**
 * The perf-log line for one ensureTrainedModel call (G3 spec § 7), read back after a real run to see
 * where a rebuild's time went. Segments for phases that did not run are left out, so a session hit
 * reads `source=session total=…ms | scan=…ms`.
 */
export function formatTrainingPerfLine(perf) {
    const parts = [];
    if (perf.scanMs !== undefined) parts.push(`scan=${ms(perf.scanMs)}`);
    for (const label of ['likes', 'dislikes']) {
        const f = perf[label];
        if (!f) continue;
        parts.push(
            `${label}: load=${ms(f.loadMs)} (disk ${f.diskCount}) misses=${f.misses} ` +
                `features=${ms(f.featuresMs)} clip=${ms(f.clipMs)} save=${ms(f.saveMs)}`
        );
    }
    if (perf.bulkMs !== undefined) parts.push(`bulk=${ms(perf.bulkMs)}`);
    if (perf.trainMs !== undefined) parts.push(`train=${ms(perf.trainMs)}`);
    if (perf.modelCacheWriteMs !== undefined) parts.push(`modelCacheWrite=${ms(perf.modelCacheWriteMs)}`);
    const head = `ML training: source=${perf.source} total=${ms(perf.totalMs)}`;
    return parts.length > 0 ? `${head} | ${parts.join(' | ')}` : head;
}
```

In the constructor JSDoc, after the `@param {(msg: string, level: string) => void} o.notify` line, add:

```js
     * @param {(line: string) => void} [o.logPerf] Perf-log sink (`media-viewer-perf.log`) for the one line per
     *        ensureTrainedModel call (G3 spec § 7). Diagnostics only — a throwing sink is swallowed.
     * @param {() => number} [o.now] Millisecond clock for those timings; defaults to `performance.now`.
     *        Injectable so tests get fixed times. A throwing clock reads as 0.
```

In the constructor body, after `this.notify = o.notify || (() => {});`, add:

```js
        this.logPerf = o.logPerf || (() => {});
        this.now = o.now || (() => performance.now());
```

After `_combine` (before the `_collectFolderVectors` JSDoc), add:

```js
    // The injected clock, or 0 if it throws — diagnostics must never fail the rebuild they time.
    _now() {
        try {
            return this.now();
        } catch (_err) {
            return 0;
        }
    }

    // Writes the one perf line for an ensureTrainedModel call. Swallows every failure, sink included.
    _writeTrainingPerf(perf) {
        try {
            perf.totalMs = this._now() - perf.start;
            this.logPerf(formatTrainingPerfLine(perf));
        } catch (_err) {
            // Diagnostics only.
        }
    }
```

In `_collectFolderVectors`, replace the head of the method:

```js
    async _collectFolderVectors(folderPath, files, phase, loadPhase, enableClipFeatures, signal) {
        const { entries, diskCount, aborted } = await this._loadVectorCache(folderPath, files, signal, loadPhase);
        const rows = [];
        let clipMissing = 0;
        let failed = 0;
        let extracted = 0;
        if (aborted) return { rows, clipMissing, failed, aborted: true };

        for (let i = 0; i < files.length; i++) {
            if (signal?.aborted) return { rows, clipMissing, failed, aborted: true };
```

with:

```js
    async _collectFolderVectors(folderPath, files, phase, loadPhase, enableClipFeatures, signal) {
        // Per-folder timings and counts for the perf line (G3 spec § 7), returned on every path.
        const stats = { loadMs: 0, diskCount: 0, misses: 0, featuresMs: 0, clipMs: 0, saveMs: 0 };
        const tLoad = this._now();
        const { entries, diskCount, aborted } = await this._loadVectorCache(folderPath, files, signal, loadPhase);
        stats.loadMs = this._now() - tLoad;
        stats.diskCount = diskCount;
        const rows = [];
        let clipMissing = 0;
        let failed = 0;
        let extracted = 0;
        if (aborted) return { rows, clipMissing, failed, aborted: true, stats };

        for (let i = 0; i < files.length; i++) {
            if (signal?.aborted) return { rows, clipMissing, failed, aborted: true, stats };
```

Replace the extraction lines:

```js
            if (!hadHit || needsClip) {
                try {
                    const feature = hadHit ? hit.feature : await this.computeFeatures(file.path, file);
                    const clip = await this.extractClipEmbedding(file.path);
```

with:

```js
            if (!hadHit || needsClip) {
                stats.misses++;
                try {
                    const tFeatures = this._now();
                    const feature = hadHit ? hit.feature : await this.computeFeatures(file.path, file);
                    if (!hadHit) stats.featuresMs += this._now() - tFeatures;
                    const tClip = this._now();
                    const clip = await this.extractClipEmbedding(file.path);
                    stats.clipMs += this._now() - tClip;
```

Replace the tail:

```js
        if (extracted > 0 && !signal?.aborted) {
            await this._saveVectorCache(folderPath, entries, diskCount, files.length);
        }
        return { rows, clipMissing, failed, aborted: false };
    }
```

with:

```js
        if (extracted > 0 && !signal?.aborted) {
            const tSave = this._now();
            await this._saveVectorCache(folderPath, entries, diskCount, files.length);
            stats.saveMs = this._now() - tSave;
        }
        return { rows, clipMissing, failed, aborted: false, stats };
    }
```

Split `ensureTrainedModel`. Keep its existing JSDoc block where it is, and replace the line `    async ensureTrainedModel({ signal } = {}) {` with:

```js
    async ensureTrainedModel({ signal } = {}) {
        // G3 spec § 7: one perf-log line per call, on every return path. A throw still propagates; its
        // line reads source=failed.
        const perf = { source: 'failed', start: this._now() };
        try {
            const result = await this._ensureTrainedModelImpl({ signal }, perf);
            perf.source = result.source === 'skipped' && signal?.aborted ? 'aborted' : result.source;
            return result;
        } finally {
            this._writeTrainingPerf(perf);
        }
    }

    // The body of ensureTrainedModel (its JSDoc above). `perf` collects the phase timings the wrapper logs.
    async _ensureTrainedModelImpl({ signal } = {}, perf = {}) {
```

Inside `_ensureTrainedModelImpl`, time the scan — replace:

```js
        this.onProgress({ phase: 'Checking training set…' });
        const [likedResult, dislikedResult] = await Promise.all([
            this.loadFolder(config.customLikeFolder),
            this.loadFolder(config.customDislikeFolder),
        ]);
```

with:

```js
        this.onProgress({ phase: 'Checking training set…' });
        const tScan = this._now();
        const [likedResult, dislikedResult] = await Promise.all([
            this.loadFolder(config.customLikeFolder),
            this.loadFolder(config.customDislikeFolder),
        ]);
        perf.scanMs = this._now() - tScan;
```

Record both folders' stats — replace:

```js
            config.enableClipFeatures,
            signal
        );
        if (likes.aborted || signal?.aborted) return miss;
```

with:

```js
            config.enableClipFeatures,
            signal
        );
        perf.likes = likes.stats;
        if (likes.aborted || signal?.aborted) return miss;
```

and replace:

```js
            config.enableClipFeatures,
            signal
        );
        if (dislikes.aborted || signal?.aborted) return miss;
```

with:

```js
            config.enableClipFeatures,
            signal
        );
        perf.dislikes = dislikes.stats;
        if (dislikes.aborted || signal?.aborted) return miss;
```

Time the bulk pass — replace:

```js
        const bulk = await this._collectBulkRatedVectors(resolvedBulk, config.enableClipFeatures, signal);
```

with:

```js
        const tBulk = this._now();
        const bulk = await this._collectBulkRatedVectors(resolvedBulk, config.enableClipFeatures, signal);
        perf.bulkMs = this._now() - tBulk;
```

Time training — replace:

```js
        const { stats, modelState } = await this.trainModel(likedFeatures, dislikedFeatures, seed);
```

with:

```js
        const tTrain = this._now();
        const { stats, modelState } = await this.trainModel(likedFeatures, dislikedFeatures, seed);
        perf.trainMs = this._now() - tTrain;
```

Time the model-cache write — replace:

```js
            this.sessionStats = stats;
            await this._writeCachedModel(fingerprint, modelState, stats, {
                likeFolder: config.customLikeFolder,
                likeCount: likeFiles.length,
                dislikeFolder: config.customDislikeFolder,
                dislikeCount: dislikeFiles.length,
                bulkRatedCount: bulkPresent.length,
                enableClipFeatures: config.enableClipFeatures,
                versions: config.versions,
            });
        } else {
```

with:

```js
            this.sessionStats = stats;
            const tWrite = this._now();
            await this._writeCachedModel(fingerprint, modelState, stats, {
                likeFolder: config.customLikeFolder,
                likeCount: likeFiles.length,
                dislikeFolder: config.customDislikeFolder,
                dislikeCount: dislikeFiles.length,
                bulkRatedCount: bulkPresent.length,
                enableClipFeatures: config.enableClipFeatures,
                versions: config.versions,
            });
            perf.modelCacheWriteMs = this._now() - tWrite;
        } else {
```

- [ ] **Step 4: Run the manager tests to verify they pass**

Run: `npx vitest run tests/ml-training.test.js`
Expected: PASS, all tests (the existing suite included — no existing test pins `_collectFolderVectors`' return shape; verified at planning by grep).

- [ ] **Step 5: Write the failing sort-line tests**

In `tests/media-viewer-utils.test.js`, inside `describe('handleSortByPrediction lifecycle', …)`, in `makeCtx`'s object literal add after `showMedia: () => {},`:

```js
            _logSortPerf: vi.fn(),
```

Then add these tests at the end of that describe block (before its closing `});`):

```js
    // G3 spec § 7: one perf-log record per sort, handed to _logSortPerf from the finally.
    it('logs one sort perf record on success, with the phases that ran', async () => {
        const ctx = makeCtx();
        await handleSortByPrediction.call(ctx);
        expect(ctx._logSortPerf).toHaveBeenCalledTimes(1);
        const [perf] = ctx._logSortPerf.mock.calls[0];
        expect(perf.outcome).toBe('done');
        expect(perf.phases.map(([name, , note]) => [name, note])).toEqual([
            ['training', 'trained'],
            ['sort', undefined],
        ]);
    });

    it('times the lazy init, the CLIP load, the cache load and the extraction when they run', async () => {
        const ctx = makeCtx({ mlWorker: null, enableClipFeatures: true, featureCache: new Map() });
        ctx.initializeMlWorker = function () {
            this.mlWorker = {};
        };
        await handleSortByPrediction.call(ctx);
        const [perf] = ctx._logSortPerf.mock.calls[0];
        expect(perf.phases.map(([name]) => name)).toEqual([
            'mlInit',
            'clipLoad',
            'sourceCacheLoad',
            'training',
            'extract',
            'sort',
        ]);
    });

    it('logs outcome "stopped" when the model is not ready', async () => {
        const ctx = makeCtx();
        ctx.mlTraining = {
            ensureTrainedModel: () =>
                Promise.resolve({ source: 'trained', stats: { isReady: false }, fingerprint: 'fp', descriptor: {} }),
        };
        await handleSortByPrediction.call(ctx);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('stopped');
    });

    it('logs outcome "cancelled" when the sort is aborted', async () => {
        const ctx = makeCtx();
        ctx.mlTraining = {
            ensureTrainedModel: () => {
                ctx.sortAbortController.abort();
                return Promise.resolve({ source: 'skipped', stats: null, fingerprint: null, descriptor: null });
            },
        };
        await handleSortByPrediction.call(ctx);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('cancelled');
    });

    it('logs outcome "failed" when the sort throws', async () => {
        const ctx = makeCtx({ runMlSort: () => Promise.reject(new Error('worker crashed')) });
        await handleSortByPrediction.call(ctx);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('failed');
    });
```

After the whole `handleSortByPrediction lifecycle` describe, add a new describe:

```js
describe('_logSortPerf (G3)', () => {
    const logSortPerf = extractMethod('_logSortPerf');
    const savedWindow = globalThis.window;
    let nowSpy;
    afterEach(() => {
        globalThis.window = savedWindow;
        nowSpy?.mockRestore();
        nowSpy = undefined;
    });

    it('writes one AI sort line: outcome, total, the phases that ran, the file count', () => {
        const logPerf = vi.fn();
        globalThis.window = { electronAPI: { logPerf } };
        nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
        logSortPerf.call(
            { mediaFiles: [{}, {}, {}] },
            {
                start: 0,
                outcome: 'done',
                phases: [
                    ['clipLoad', 2.4],
                    ['training', 812.6, 'trained'],
                    ['sort', 40],
                ],
            }
        );
        expect(logPerf.mock.calls).toEqual([
            ['AI sort: outcome=done total=1000ms | clipLoad=2ms | training=813ms (trained) | sort=40ms | files=3'],
        ]);
    });

    it('never throws when the perf log is unavailable', () => {
        globalThis.window = { electronAPI: {} };
        expect(() => logSortPerf.call({ mediaFiles: [] }, { start: 0, outcome: 'stopped', phases: [] })).not.toThrow();
    });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: FAIL — the `_logSortPerf (G3)` describe throws `Could not find method: _logSortPerf` at collection, failing the whole file; once that method exists the five lifecycle tests fail with `expected "spy" to be called 1 times, but got 0 times`. Record in the Progress Log.

- [ ] **Step 7: Implement the sort line**

In `media-viewer.js` `handleSortByPrediction`, after `this.updateSortProgress({ phase: 'Preparing…' }); // card visible before any await` add:

```js
        // One perf-log line per sort (G3 spec § 7), written by the finally below whatever the outcome.
        const sortPerf = { start: performance.now(), outcome: 'stopped', phases: [] };
        const timePhase = (name, startedAt, note) => sortPerf.phases.push([name, performance.now() - startedAt, note]);
```

Time the lazy init — replace:

```js
            if (!this.mlWorker || this.featureWorkers.length === 0) {
                await Promise.all([this.initializeMlWorker(), this.initializeFeaturePool()]);
            }
```

with:

```js
            if (!this.mlWorker || this.featureWorkers.length === 0) {
                const tInit = performance.now();
                await Promise.all([this.initializeMlWorker(), this.initializeFeaturePool()]);
                timePhase('mlInit', tInit);
            }
```

Time the CLIP load — replace:

```js
            if (this.enableClipFeatures) {
                this.updateSortProgress({ phase: 'Loading CLIP model…' });
                this.clipProgressSink = (percent) =>
                    this.updateSortProgress({
                        phase: 'Downloading CLIP model…',
                        current: percent,
                        total: 100,
                    });
                try {
                    await this.initClipModel();
                } finally {
                    this.clipProgressSink = null;
                }
            }
```

with:

```js
            if (this.enableClipFeatures) {
                const tClip = performance.now();
                this.updateSortProgress({ phase: 'Loading CLIP model…' });
                this.clipProgressSink = (percent) =>
                    this.updateSortProgress({
                        phase: 'Downloading CLIP model…',
                        current: percent,
                        total: 100,
                    });
                try {
                    await this.initClipModel();
                } finally {
                    this.clipProgressSink = null;
                }
                timePhase('clipLoad', tClip);
            }
```

Time Phase 1 — replace:

```js
            if (this.mediaFiles.some((f) => !this.featureCache.has(f.path))) {
                await this.loadFeatureCache({
                    signal,
                    onProgress: (current, total) =>
                        this.updateSortProgress({ phase: 'Loading cached features…', current, total }),
                });
            }
```

with:

```js
            if (this.mediaFiles.some((f) => !this.featureCache.has(f.path))) {
                const tLoad = performance.now();
                await this.loadFeatureCache({
                    signal,
                    onProgress: (current, total) =>
                        this.updateSortProgress({ phase: 'Loading cached features…', current, total }),
                });
                timePhase('sourceCacheLoad', tLoad);
            }
```

Time training — replace:

```js
            const training = await this.mlTraining.ensureTrainedModel({ signal });
```

with:

```js
            const tTraining = performance.now();
            const training = await this.mlTraining.ensureTrainedModel({ signal });
            timePhase('training', tTraining, training.source);
```

Time Phase 2 — replace:

```js
            if (uncachedFiles.length > 0) {
                // No indeterminate priming needed: startBackgroundFeatureExtraction's head is
                // await-free, so it reaches showBackgroundExtractionProgress — and through it
                // this sink — synchronously, with a real cached/total count.
                this.extractionProgressSink = (current, total) =>
                    this.updateSortProgress({ phase: 'Extracting features…', current, total });
                try {
                    await this.startBackgroundFeatureExtraction();
                } finally {
                    this.extractionProgressSink = null;
                }
            }
```

with:

```js
            if (uncachedFiles.length > 0) {
                const tExtract = performance.now();
                // No indeterminate priming needed: startBackgroundFeatureExtraction's head is
                // await-free, so it reaches showBackgroundExtractionProgress — and through it
                // this sink — synchronously, with a real cached/total count.
                this.extractionProgressSink = (current, total) =>
                    this.updateSortProgress({ phase: 'Extracting features…', current, total });
                try {
                    await this.startBackgroundFeatureExtraction();
                } finally {
                    this.extractionProgressSink = null;
                }
                timePhase('extract', tExtract);
            }
```

Time Phase 3 — replace:

```js
            const result = await this.runMlSort(allFeatures, runId);
```

with:

```js
            const tSort = performance.now();
            const result = await this.runMlSort(allFeatures, runId);
            timePhase('sort', tSort);
```

Record the outcome — replace:

```js
            this.applyPredictionSortResult(result, { resort });
        } catch (err) {
            if (signal.aborted || err.message === 'cancelled') {
                this.showNotification('Sorting cancelled', 'info');
            } else {
                console.error('Error sorting by prediction:', err);
```

with:

```js
            this.applyPredictionSortResult(result, { resort });
            sortPerf.outcome = 'done';
        } catch (err) {
            if (signal.aborted || err.message === 'cancelled') {
                sortPerf.outcome = 'cancelled';
                this.showNotification('Sorting cancelled', 'info');
            } else {
                sortPerf.outcome = 'failed';
                console.error('Error sorting by prediction:', err);
```

Write it — at the very end of the `finally`, after `this._releaseClipLease();`, add:

```js
            this._logSortPerf(sortPerf);
```

Directly after the closing brace of `handleSortByPrediction` (before `async applyBulkRating(bucket) {`), add:

```js
    // One perf-log line per AI sort (G3 spec § 7), from handleSortByPrediction's finally: the outcome, the
    // total, each phase that ran, and the file count. Read back beside the "ML training:" line the
    // training phase writes.
    _logSortPerf(perf) {
        try {
            const ms = (v) => `${Math.round(v)}ms`;
            const parts = perf.phases.map(([name, v, note]) => `${name}=${ms(v)}${note ? ` (${note})` : ''}`);
            parts.push(`files=${this.mediaFiles.length}`);
            window.electronAPI.logPerf?.(
                `AI sort: outcome=${perf.outcome} total=${ms(performance.now() - perf.start)} | ${parts.join(' | ')}`
            );
        } catch (_err) {
            // Diagnostics only — the log line must never turn a finished sort into an error.
        }
    }
```

Wire the manager's sink — in the constructor's `new MlTrainingManager({…})`, after `logError: (msg) => window.electronAPI?.logError?.(msg),` add:

```js
            logPerf: (line) => window.electronAPI?.logPerf?.(line),
```

- [ ] **Step 8: Run the unit suite**

Run: `npx vitest run`
Expected: PASS, all files. Then `npm run lint` — expected: no new errors or warnings in `ml-training.js` / `media-viewer.js`.

- [ ] **Step 9: Mutation-check the pass-by-construction test**

Temporarily replace `_now()`'s body with `return this.now();`, run `npx vitest run tests/ml-training.test.js -t "never fails a rebuild"` — expected FAIL (`clock`). Restore. Record in the Progress Log.

- [ ] **Step 10: Commit**

```bash
git add ml-training.js media-viewer.js tests/ml-training.test.js tests/media-viewer-utils.test.js
git commit -m "feat(ml): perf-log line per training rebuild and per AI sort (G3 Task 1)"
```

(with the trailer). Record the SHA in the Progress Log — **this is the before-run build**.

---

## Checkpoint A: the user's before run

The controller asks the user to run this on Task 1's commit and paste the result. The user's steps:

1. Close the app if it is open.
2. In Explorer, move about **5 files** from `Liked_2` to `Liked_3` — include a video if `Liked_2` has one — choosing files that were in `Liked_2` during an earlier AI sort.
3. In the repo (branch `g3-source-vector-reuse` at Task 1's SHA): `npm start`. Open `Liked_2` with the usual like (`Liked_3`) and dislike (`Liked_1`) folders. Run the AI sort once.
4. Paste the new lines: `Get-Content "$env:APPDATA\media_viewer\logs\media-viewer-perf.log" -Tail 6`.

Expected: an `ML training: source=trained …` line whose `likes:` segment shows `misses` ≈ the number moved and a non-zero `clip=`, followed by an `AI sort: outcome=done …` line. Record both lines verbatim in the Progress Log under **Before run**, with the file count moved and whether a video was among them. If the line shows `source=model-cache` or `session`, the move did not change the like folder's file list — ask the user to confirm the files landed in `Liked_3`.

---

## Task 2: Host — `departedClips`, its two feeds, and `_lookupSourceClip`

**Files:**
- Modify: `media-viewer.js` (constructor ~L171-172; `removeFileFromList` ~L1420-1449; new `_rememberDepartedClip` and `_lookupSourceClip` right after `removeFileFromList`; `loadFolder` ~L3161-3165; `_loadFeatureCacheLocked` ~L8292-8316 and ~L8410-8413)
- Create: `tests/source-clip-reuse.test.js`
- Modify: `tests/media-viewer-utils.test.js`, `tests/like-or-skip-glue.test.js` (mock ctxs)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `this.departedClips: Map<string, { clip: Float32Array(512), size: number, mtimeMs: number }>`; `this._departedClipEvictionLogged: boolean`; `_rememberDepartedClip(name, entry)`; `_lookupSourceClip(file) → Float32Array(512) | null` where `file = { name, size, mtimeMs }` (sync, writes nothing, returns a copy).

- [ ] **Step 1: Write the failing host tests**

Create `tests/source-clip-reuse.test.js`:

```js
// G3 source-folder CLIP reuse (spec docs/superpowers/specs/2026-10-13-g3-source-clip-reuse-design.md): the
// MediaViewer half — departedClips, its two feeds (the source-cache load and removeFileFromList) and the
// read-only _lookupSourceClip; Task 3 adds the composition with a real MlTrainingManager.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as LikeOrSkip from '../like-or-skip.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const { packFeatureChunk } = require('../feature-cache-transport.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method's source text, found by brace counting (the technique of media-viewer-utils.test.js). */
function methodSource(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(([^)]*)\\)\\s*\\{`, 'm'));
    if (!match) {
        throw new Error(`Could not find method: ${name}`);
    }
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            return { isAsync: Boolean(match[1]), params: match[2], body: source.slice(open + 1, i) };
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

/** A MediaViewer method as a callable, invoked with `.call(mockCtx, …)`. */
function extract(name) {
    const { isAsync, params, body } = methodSource(name);
    return new (isAsync ? AsyncFunction : Function)(params, body);
}

const clipOf = (v) => new Float32Array(512).fill(v);

const savedWindow = globalThis.window;
const savedMediaViewer = globalThis.MediaViewer;
let logPerf;
beforeEach(() => {
    logPerf = vi.fn();
    globalThis.window = { electronAPI: { logPerf } };
    // _loadFeatureCacheLocked reads the static MediaViewer.FEATURE_CACHE_VERSION, which an extracted body
    // resolves through the global object. Keep in sync with media-viewer.js.
    globalThis.MediaViewer = { FEATURE_CACHE_VERSION: 4 };
});
afterEach(() => {
    globalThis.window = savedWindow;
    globalThis.MediaViewer = savedMediaViewer;
});

/** The `this` the G3 host methods touch: removeFileFromList's full list plus departedClips. */
function hostCtx(overrides = {}) {
    return {
        baseFolderPath: '/src',
        mediaFiles: [],
        currentIndex: 0,
        predictionScores: new Map(),
        featureCache: new Map(),
        clipCache: new Map(),
        featureMetadata: new Map(),
        perceptualHashes: new Map(),
        jxlFrameCache: new Map(),
        bulkRated: new Map(),
        bulkRatedPairs: new Set(),
        likeOrSkip: new LikeOrSkip.SkipTracker(),
        departedClips: new Map(),
        _departedClipEvictionLogged: false,
        _bulkPairKeysReferencing: () => [],
        saveBulkRatedFile: vi.fn(),
        _rememberDepartedClip: extract('_rememberDepartedClip'),
        ...overrides,
    };
}

describe('_rememberDepartedClip — the one way into departedClips', () => {
    const remember = extract('_rememberDepartedClip');

    it('keeps a valid entry', () => {
        const ctx = hostCtx();
        const clip = clipOf(0.5);
        remember.call(ctx, 'a.jpg', { clip, size: 10, mtimeMs: 99 });
        expect(ctx.departedClips.get('a.jpg')).toEqual({ clip, size: 10, mtimeMs: 99 });
    });

    it('ignores a wrong-length vector and a zero stat', () => {
        const ctx = hostCtx();
        remember.call(ctx, 'short.jpg', { clip: new Float32Array(64), size: 10, mtimeMs: 99 });
        remember.call(ctx, 'nosize.jpg', { clip: clipOf(0.5), size: 0, mtimeMs: 99 });
        remember.call(ctx, 'nomtime.jpg', { clip: clipOf(0.5), size: 10, mtimeMs: 0 });
        expect(ctx.departedClips.size).toBe(0);
    });

    it('re-remembering a name replaces the older entry and moves it last (Review Focus 5)', () => {
        const ctx = hostCtx();
        remember.call(ctx, 'a.jpg', { clip: clipOf(0.1), size: 10, mtimeMs: 1 });
        remember.call(ctx, 'b.jpg', { clip: clipOf(0.2), size: 20, mtimeMs: 2 });
        remember.call(ctx, 'a.jpg', { clip: clipOf(0.3), size: 11, mtimeMs: 3 });
        expect([...ctx.departedClips.keys()]).toEqual(['b.jpg', 'a.jpg']);
        expect(ctx.departedClips.get('a.jpg').mtimeMs).toBe(3);
    });

    it('evicts the oldest entry past 5000 and logs only the first eviction', () => {
        const ctx = hostCtx();
        const clip = clipOf(0.5); // shared: the cap counts entries, not vectors
        for (let i = 0; i < 5002; i++) {
            remember.call(ctx, `f${i}.jpg`, { clip, size: 10, mtimeMs: 1 });
        }
        expect(ctx.departedClips.size).toBe(5000);
        expect(ctx.departedClips.has('f0.jpg')).toBe(false);
        expect(ctx.departedClips.has('f1.jpg')).toBe(false);
        expect(ctx.departedClips.has('f2.jpg')).toBe(true);
        expect(logPerf.mock.calls).toEqual([['Departed CLIP vectors over 5000: evicting the oldest']]);
    });
});

describe.each([
    ['binary', true],
    ['legacy JSON', false],
])('_loadFeatureCacheLocked keeps departed CLIP vectors (%s chunks)', (_label, binary) => {
    const load = extract('_loadFeatureCacheLocked');
    const cacheEntry = (name, size, mtime, clip = 0.25) => [
        name,
        {
            vector: Array.from({ length: 64 }, () => 0.5),
            clipVector: clip === null ? null : Array.from({ length: 512 }, () => clip),
            size,
            mtime,
        },
    ];
    function installCache(pairs) {
        Object.assign(globalThis.window.electronAPI, {
            featureCacheOpen: vi.fn(async () => ({ success: true, version: 4, count: pairs.length })),
            featureCacheChunk: vi.fn(async (offset, limit) => {
                const slice = pairs.slice(offset, offset + limit);
                return binary ? packFeatureChunk(slice) : { entries: slice };
            }),
            featureCacheClose: vi.fn(async () => ({ success: true })),
        });
    }
    const present = { name: 'here.jpg', path: '/src/here.jpg', size: 10, mtimeMs: 100 };

    it('keeps the CLIP half of an entry whose file left the folder, and nothing else of it', async () => {
        installCache([cacheEntry('here.jpg', 10, 100), cacheEntry('gone.jpg', 20, 200, 0.75)]);
        const ctx = hostCtx({ mediaFiles: [present] });
        await load.call(ctx, {});
        expect([...ctx.departedClips.keys()]).toEqual(['gone.jpg']);
        const kept = ctx.departedClips.get('gone.jpg');
        expect(kept.size).toBe(20);
        expect(kept.mtimeMs).toBe(200);
        expect(kept.clip).toHaveLength(512);
        expect(kept.clip[0]).toBeCloseTo(0.75);
        // The folder's own maps never see it, so its next save cannot write it back.
        expect(ctx.featureCache.has('/src/gone.jpg')).toBe(false);
        expect(ctx.clipCache.has('/src/gone.jpg')).toBe(false);
        expect(ctx.featureMetadata.has('/src/gone.jpg')).toBe(false);
        expect(ctx.featureCache.has('/src/here.jpg')).toBe(true);
    });

    it('does not keep a stale entry of a file still in the folder', async () => {
        installCache([cacheEntry('here.jpg', 10, 99)]); // mtime changed since the save
        const ctx = hostCtx({ mediaFiles: [present] });
        await load.call(ctx, {});
        expect(ctx.departedClips.size).toBe(0);
    });

    it('does not keep a departed entry without a CLIP half', async () => {
        // Passes before the change by construction (nothing is kept yet). Pins the `clipVector` check:
        // mutation-check by dropping it from the departed branch of ingest and watching this fail.
        installCache([cacheEntry('here.jpg', 10, 100), cacheEntry('gone.jpg', 20, 200, null)]);
        const ctx = hostCtx({ mediaFiles: [present] });
        await load.call(ctx, {});
        expect(ctx.departedClips.size).toBe(0);
    });

    it('keeps nothing from a load cancelled after the departed entry was read', async () => {
        // Passes before the change by construction (nothing is kept yet). Pins that the merge happens in
        // commitFresh, not in ingest: mutation-check by calling _rememberDepartedClip from ingest and
        // watching this fail. 1,001 entries make two CHUNK=1000 reads; the cancel lands between them.
        const pairs = [cacheEntry('gone.jpg', 20, 200)];
        for (let i = 0; i < 1000; i++) {
            pairs.push(cacheEntry(`f${i}.jpg`, 1, 1));
        }
        installCache(pairs);
        const controller = new AbortController();
        const ctx = hostCtx({ mediaFiles: [present] });
        await load.call(ctx, { signal: controller.signal, onProgress: () => controller.abort() });
        expect(ctx.departedClips.size).toBe(0);
    });
});

describe('removeFileFromList keeps the departing CLIP half', () => {
    const removeFileFromList = extract('removeFileFromList');
    const file = { name: 'a.jpg', path: '/src/a.jpg', size: 10, mtimeMs: 99 };

    it('remembers it under the stat this folder would have saved it with', () => {
        const clip = clipOf(0.75);
        const ctx = hostCtx({
            mediaFiles: [file],
            clipCache: new Map([[file.path, clip]]),
            featureMetadata: new Map([[file.path, { size: 10, mtime: 99 }]]),
        });
        removeFileFromList.call(ctx, file.path);
        expect(ctx.departedClips.get('a.jpg')).toEqual({ clip, size: 10, mtimeMs: 99 });
        expect(ctx.clipCache.has(file.path)).toBe(false); // the purge itself is unchanged
    });

    it('remembers nothing without a recorded stat', () => {
        // Passes before the change by construction. Mutation-check: drop `&& departingMeta` → TypeError.
        const ctx = hostCtx({ mediaFiles: [file], clipCache: new Map([[file.path, clipOf(0.75)]]) });
        removeFileFromList.call(ctx, file.path);
        expect(ctx.departedClips.size).toBe(0);
    });

    it('remembers nothing without a CLIP half', () => {
        // Passes before the change by construction. Mutation-check: drop `departingClip &&` → an entry
        // with clip undefined reaches _rememberDepartedClip, which must still refuse it (keep the test).
        const ctx = hostCtx({ mediaFiles: [file], featureMetadata: new Map([[file.path, { size: 10, mtime: 99 }]]) });
        removeFileFromList.call(ctx, file.path);
        expect(ctx.departedClips.size).toBe(0);
    });
});

describe('_lookupSourceClip — the read-only lookup the manager is given', () => {
    const lookup = extract('_lookupSourceClip');
    const training = { name: 'a.jpg', path: '/likes/a.jpg', size: 10, mtimeMs: 99 };

    it('returns a copy of a departed vector whose name, size and mtime match', () => {
        const clip = clipOf(0.75);
        const ctx = hostCtx({ departedClips: new Map([['a.jpg', { clip, size: 10, mtimeMs: 99 }]]) });
        const got = lookup.call(ctx, training);
        expect(got).not.toBe(clip);
        expect(Array.from(got)).toEqual(Array.from(clip));
    });

    it('finds a file still in the source folder through the live clipCache', () => {
        const clip = clipOf(0.6);
        const ctx = hostCtx({
            clipCache: new Map([['/src/a.jpg', clip]]),
            featureMetadata: new Map([['/src/a.jpg', { size: 10, mtime: 99 }]]),
        });
        const got = lookup.call(ctx, training);
        expect(got).not.toBe(clip);
        expect(Array.from(got)).toEqual(Array.from(clip));
    });

    it('builds the source path correctly for a Windows folder and a drive root (Review Focus 1)', () => {
        const clip = clipOf(0.6);
        for (const [base, key] of [
            ['C:\\Users\\x\\Liked_2', 'C:\\Users\\x\\Liked_2\\a.jpg'],
            ['D:\\', 'D:\\a.jpg'],
        ]) {
            const ctx = hostCtx({
                baseFolderPath: base,
                clipCache: new Map([[key, clip]]),
                featureMetadata: new Map([[key, { size: 10, mtime: 99 }]]),
            });
            expect(lookup.call(ctx, training), base).not.toBeNull();
        }
    });

    it('returns null and logs one near miss when the name matches but the stat does not', () => {
        const ctx = hostCtx({ departedClips: new Map([['a.jpg', { clip: clipOf(0.75), size: 10, mtimeMs: 50 }]]) });
        expect(lookup.call(ctx, training)).toBeNull();
        expect(logPerf.mock.calls).toEqual([
            ['Source CLIP not reused for a.jpg: source size/mtime 10/50 vs training 10/99'],
        ]);
    });

    it('returns null and logs nothing when the source has no entry by that name', () => {
        expect(lookup.call(hostCtx(), training)).toBeNull();
        expect(logPerf).not.toHaveBeenCalled();
    });

    it('a stale departed entry gives way to a fresh live one, with no near-miss line (Review Focus 4)', () => {
        const live = clipOf(0.6);
        const ctx = hostCtx({
            departedClips: new Map([['a.jpg', { clip: clipOf(0.75), size: 10, mtimeMs: 50 }]]),
            clipCache: new Map([['/src/a.jpg', live]]),
            featureMetadata: new Map([['/src/a.jpg', { size: 10, mtime: 99 }]]),
        });
        expect(Array.from(lookup.call(ctx, training))).toEqual(Array.from(live));
        expect(logPerf).not.toHaveBeenCalled();
    });
});

describe('loadFolder', () => {
    it('empties departedClips with the other per-folder caches', () => {
        const { body } = methodSource('loadFolder');
        const clipClear = body.indexOf('this.clipCache.clear();');
        const departedClear = body.indexOf('this.departedClips.clear();');
        expect(clipClear).toBeGreaterThan(-1);
        expect(departedClear).toBeGreaterThan(clipClear);
        expect(departedClear).toBeLessThan(body.indexOf('await this.loadBulkRatedFile();'));
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/source-clip-reuse.test.js`
Expected: FAIL at collection — `Could not find method: _rememberDepartedClip`. (After Step 3 adds that method, the departed-feed and lookup tests are the RED ones: e.g. `expected [] to deeply equal [ 'gone.jpg' ]`, `Could not find method: _lookupSourceClip`.) Record in the Progress Log.

- [ ] **Step 3: Implement the map, the helper and the lookup**

In the constructor, after `this.clipCache = new Map(); // Map<filePath, Float32Array(512)>` add:

```js
        // CLIP vectors whose file left this folder this session (G3): Map<filename, {clip, size, mtimeMs}>.
        // Read-only to MlTrainingManager, through _lookupSourceClip; never saved. See _rememberDepartedClip.
        this.departedClips = new Map();
        this._departedClipEvictionLogged = false;
```

Directly after `removeFileFromList`'s closing brace (before the `// Every rated-pair key that names` comment of `_bulkPairKeysReferencing`), add:

```js
    // The one way into departedClips (G3 spec § 4.1). It holds the CLIP half of files that left this folder
    // this session — moved in Explorer (the cache load's prune) or by the app (removeFileFromList) — so a
    // training-cache miss on the same bytes can reuse it instead of running CLIP again. A zero stat never
    // matches a real one, so it is refused, as the cache writers do. Newest last; past the cap the oldest go.
    _rememberDepartedClip(name, entry) {
        const DEPARTED_CLIP_LIMIT = 5000; // spec D4: ~10 MB of CLIP vectors at most
        const { clip, size, mtimeMs } = entry || {};
        if (!clip || clip.length !== 512 || !size || !mtimeMs) return;
        this.departedClips.delete(name);
        this.departedClips.set(name, { clip, size, mtimeMs });
        while (this.departedClips.size > DEPARTED_CLIP_LIMIT) {
            this.departedClips.delete(this.departedClips.keys().next().value);
            if (!this._departedClipEvictionLogged) {
                this._departedClipEvictionLogged = true;
                window.electronAPI?.logPerf?.(`Departed CLIP vectors over ${DEPARTED_CLIP_LIMIT}: evicting the oldest`);
            }
        }
    }

    // The CLIP half the SOURCE folder holds for a training-folder file (G3 spec § 4.2), injected into
    // MlTrainingManager as lookupSourceClip. Reads departedClips, then the live clipCache at the source path
    // of the same name (a file moved in Explorer while the app is open, or a copy). Name, size and mtime
    // must all match; the first match is returned as a COPY, so the manager never holds a host array. Writes
    // nothing. Only the CLIP half: source-folder 64-dim vectors lack file metadata (spec § 2.2).
    _lookupSourceClip(file) {
        const candidates = [];
        const departed = this.departedClips.get(file.name);
        if (departed) candidates.push(departed);
        if (this.baseFolderPath) {
            // Built as _loadFeatureCacheLocked's makePath builds it, so it is the key load-folder gave the file.
            const sep = this.baseFolderPath.includes('\\') ? '\\' : '/';
            const sourcePath = this.baseFolderPath.replace(/[\\/]+$/, '') + sep + file.name;
            const liveClip = this.clipCache.get(sourcePath);
            const liveMeta = this.featureMetadata.get(sourcePath);
            if (liveClip && liveMeta) candidates.push({ clip: liveClip, size: liveMeta.size, mtimeMs: liveMeta.mtime });
        }
        for (const c of candidates) {
            if (c.clip.length === 512 && c.size === file.size && c.mtimeMs === file.mtimeMs) {
                return Float32Array.from(c.clip);
            }
        }
        if (candidates.length > 0) {
            const c = candidates[0];
            window.electronAPI?.logPerf?.(
                `Source CLIP not reused for ${file.name}: source size/mtime ${c.size}/${c.mtimeMs} ` +
                    `vs training ${file.size}/${file.mtimeMs}`
            );
        }
        return null;
    }
```

- [ ] **Step 4: Feed it from `removeFileFromList`**

In `removeFileFromList`, after `this._mediaPathIndex = null; // invalidate cached path→index map` add:

```js

        // G3: keep the CLIP half of a file leaving the folder, under the stat this folder's cache would save
        // it with, so the training rebuild after the move can reuse it (spec § 4.1). Before the purge below.
        const departingClip = this.clipCache.get(filePath);
        const departingMeta = this.featureMetadata.get(filePath);
        if (departingClip && departingMeta) {
            this._rememberDepartedClip(removedName, {
                clip: departingClip,
                size: departingMeta.size,
                mtimeMs: departingMeta.mtime,
            });
        }
```

- [ ] **Step 5: Feed it from the source-cache load**

In `_loadFeatureCacheLocked`, replace:

```js
        const freshFeatureCache = new Map();
        const freshFeatureMetadata = new Map();
        const freshClip = new Map();
        const ingest = (filename, vector, clipVector, size, mtime) => {
            const currentFile = currentFiles.get(filename);
            if (!currentFile) return; // pruned — file no longer in folder
```

with:

```js
        const freshFeatureCache = new Map();
        const freshFeatureMetadata = new Map();
        const freshClip = new Map();
        const freshDeparted = new Map(); // G3: CLIP halves of files that left the folder since the last save
        const ingest = (filename, vector, clipVector, size, mtime) => {
            const currentFile = currentFiles.get(filename);
            if (!currentFile) {
                // Pruned — the file is no longer in the folder (moved in Explorer, most likely into a training
                // folder). Its CLIP half is staged for departedClips (spec § 4.1); the folder's own maps never
                // see it, so this folder's next save cannot write it back.
                if (clipVector && clipVector.length === 512 && size && mtime) {
                    freshDeparted.set(filename, { clip: clipVector, size, mtimeMs: mtime });
                }
                return;
            }
```

Replace `commitFresh`:

```js
        const commitFresh = () => {
            this.featureCache = freshFeatureCache;
            this.featureMetadata = freshFeatureMetadata;
            for (const [k, v] of freshClip) this.clipCache.set(k, v);
            return this.featureCache.size;
        };
```

with:

```js
        const commitFresh = () => {
            this.featureCache = freshFeatureCache;
            this.featureMetadata = freshFeatureMetadata;
            for (const [k, v] of freshClip) this.clipCache.set(k, v);
            // Merged, not replaced: an in-app move earlier this session may already have remembered a file
            // whose entry this folder's last save dropped.
            for (const [name, entry] of freshDeparted) this._rememberDepartedClip(name, entry);
            return this.featureCache.size;
        };
```

Update the staging comment above `const freshFeatureCache` if it lists the staged maps (re-read it — grep rule). In the legacy fallback, replace:

```js
                freshFeatureCache.clear();
                freshFeatureMetadata.clear();
                freshClip.clear();
```

with:

```js
                freshFeatureCache.clear();
                freshFeatureMetadata.clear();
                freshClip.clear();
                freshDeparted.clear();
```

- [ ] **Step 6: Clear it on folder change**

In `loadFolder`, replace:

```js
            this.clipCache.clear();
            this.featureMetadata.clear();
            this.predictionScores.clear();
```

with:

```js
            this.clipCache.clear();
            this.featureMetadata.clear();
            this.departedClips.clear();
            this.predictionScores.clear();
```

- [ ] **Step 7: Run the new tests**

Run: `npx vitest run tests/source-clip-reuse.test.js`
Expected: PASS.

- [ ] **Step 8: Give every existing `removeFileFromList` ctx the two fields**

Run: `grep -n "removeFileFromList" tests/media-viewer-utils.test.js tests/like-or-skip-glue.test.js`. Every mock ctx that supplies `removeFileFromList` as a property or calls it via `.call(ctx, …)` gets, beside its `clipCache`:

```js
            departedClips: new Map(),
            _rememberDepartedClip: extractMethod('_rememberDepartedClip'), // `extract(...)` in like-or-skip-glue.test.js
```

Known sites at planning: `media-viewer-utils.test.js` — `createContext` in `describe('removeFileFromList')` (~L324), `makeCtx` in `describe('removeFileFromList bulk-rated purge')` (~L2547), the inline ctx of `removeFileFromList prunes bulkRatedPairs keys…` (~L2694), `cacheCtx` in `describe('bulkRatedPairs key capture + restore across undo (G1 T3)')` (~L2723); `like-or-skip-glue.test.js` — `listCtx` (~L162) and the ctxs near ~L350, ~L690, ~L1730. CLAUDE.md § Testing makes this the convention: the mock ctx supplies every `this.*` the method touches.

- [ ] **Step 9: Run the unit suite and lint**

Run: `npx vitest run` — expected PASS. `npm run lint` — no new findings.

- [ ] **Step 10: Mutation-check the pass-by-construction tests**

One at a time, apply, run `npx vitest run tests/source-clip-reuse.test.js`, confirm the named test FAILS, restore:
1. In `ingest`'s departed branch, call `this._rememberDepartedClip(filename, { clip: clipVector, size, mtimeMs: mtime })` directly instead of `freshDeparted.set(...)` → `keeps nothing from a load cancelled…` fails.
2. Drop `clipVector &&` from the departed branch → `does not keep a departed entry without a CLIP half` fails (TypeError on `null.length`).
3. In `removeFileFromList`, drop `&& departingMeta` → `remembers nothing without a recorded stat` fails.
Record each in the Progress Log.

- [ ] **Step 11: Commit**

```bash
git add media-viewer.js tests/source-clip-reuse.test.js tests/media-viewer-utils.test.js tests/like-or-skip-glue.test.js
git commit -m "feat(ml): keep departed source-folder CLIP vectors, read-only lookup (G3 Task 2)"
```

(with the trailer). Record the SHA.

---

## Task 3: Manager — reuse the source CLIP half on a training-cache miss

**Files:**
- Modify: `ml-training.js` (constructor; new `_reuseSourceClip`; `_collectFolderVectors`; `formatTrainingPerfLine`)
- Modify: `media-viewer.js` (constructor's `new MlTrainingManager({…})`: inject `lookupSourceClip`)
- Test: `tests/ml-training.test.js`, `tests/source-clip-reuse.test.js`

**Interfaces:**
- Consumes: Task 1's `stats` object and `formatTrainingPerfLine`; Task 2's `_lookupSourceClip(file)`.
- Produces: manager callback `o.lookupSourceClip(file) → Float32Array(512) | null | Promise<…>`; `stats.clipReused`, `stats.noSourceCopy`; the line's `clipReused=N noSourceCopy=N` fields.

- [ ] **Step 1: Write the failing manager tests**

In `tests/ml-training.test.js`, inside `describe('ensureTrainedModel', …)`, after the `perf line (G3)` describe, add:

```js
    // G3 spec § 4.3 / § 9: a training-cache miss takes its CLIP half from the source folder's vectors.
    describe('source CLIP reuse (G3)', () => {
        const sourceClip = () => new Float32Array(512).fill(0.75);
        const rowWithClip = (rows, value) => rows.find((r) => Math.abs(r[64] - value) < 1e-6);

        it('fills a miss with the source CLIP half and still computes its 64 dims', async () => {
            const io = makeCacheIo();
            const lookupSourceClip = vi.fn((file) => (file.name === 'l1.jpg' ? sourceClip() : null));
            const { m } = scenario({
                cacheIo: io,
                managerOverrides: { lookupSourceClip, logPerf: vi.fn(), now: () => 0 },
            });
            await m.ensureTrainedModel({});

            const clipPaths = m.extractClipEmbedding.mock.calls.map(([p]) => p);
            expect(clipPaths).not.toContain('/likes/l1.jpg');
            expect(clipPaths).toHaveLength(5);
            expect(m.computeFeatures.mock.calls.map(([p]) => p)).toContain('/likes/l1.jpg');
            const l1 = rowWithClip(m.trainModel.mock.calls[0][0], 0.75);
            expect(l1, 'the reused CLIP half did not reach the training rows').toBeDefined();
            expect(l1[0]).toBeCloseTo(0.5); // the 64 dims came from computeFeatures, never from the source
            expect(io.written.find(([name]) => name === 'l1.jpg')[1].clipVector[0]).toBeCloseTo(0.75);
            expect(m.logPerf.mock.calls[0][0]).toContain(
                'likes: load=0ms (disk 0) misses=3 clipReused=1 noSourceCopy=2 features=0ms clip=0ms'
            );
        });

        it('heals a cached entry that lacks only its CLIP half, with no extraction at all', async () => {
            const noClip = (name, size, mtimeMs) => [name, { ...entry(name, size, mtimeMs)[1], clipVector: null }];
            const io = makeCacheIo([
                noClip('l1.jpg', 10, 1),
                entry('l2.jpg', 11, 2),
                entry('l3.jpg', 12, 3),
                entry('d1.jpg', 20, 4),
                entry('d2.jpg', 21, 5),
                entry('d3.jpg', 22, 6),
            ]);
            const lookupSourceClip = vi.fn((file) => (file.name === 'l1.jpg' ? sourceClip() : null));
            const { m } = scenario({ cacheIo: io, managerOverrides: { lookupSourceClip } });
            await m.ensureTrainedModel({});
            expect(m.computeFeatures).not.toHaveBeenCalled();
            expect(m.extractClipEmbedding).not.toHaveBeenCalled();
            expect(io.written.find(([name]) => name === 'l1.jpg')[1].clipVector[0]).toBeCloseTo(0.75);
        });

        it('extracts CLIP as before when the source has no copy', async () => {
            const lookupSourceClip = vi.fn(() => null);
            const { m } = scenario({ managerOverrides: { lookupSourceClip } });
            await m.ensureTrainedModel({});
            expect(lookupSourceClip).toHaveBeenCalledTimes(6); // fails before the change: never consulted
            expect(m.extractClipEmbedding).toHaveBeenCalledTimes(6);
        });

        it('never consults the source with CLIP off (spec D6)', async () => {
            // Passes before the change by construction (nothing consults a lookup yet). Mutation-check:
            // drop the `enableClipFeatures &&` guard and watch it fail.
            const lookupSourceClip = vi.fn(() => sourceClip());
            const { m } = scenario({
                enableClipFeatures: false,
                extractClipEmbedding: vi.fn(async () => null),
                managerOverrides: { lookupSourceClip },
            });
            await m.ensureTrainedModel({});
            expect(lookupSourceClip).not.toHaveBeenCalled();
            const [liked] = m.trainModel.mock.calls[0];
            expect(liked.every((row) => row.slice(64).every((v) => v === 0))).toBe(true);
        });

        it('treats a throwing or wrong-length lookup as a miss: extracted, logged, still cacheable', async () => {
            const lookupSourceClip = vi.fn((file) => {
                if (file.name === 'l1.jpg') throw new Error('map gone');
                if (file.name === 'l2.jpg') return new Float32Array(10);
                return null;
            });
            const { m, modelCacheStore } = scenario({ managerOverrides: { lookupSourceClip } });
            const res = await m.ensureTrainedModel({});
            expect(m.extractClipEmbedding.mock.calls.map(([p]) => p)).toEqual(
                expect.arrayContaining(['/likes/l1.jpg', '/likes/l2.jpg'])
            );
            const logged = m.logError.mock.calls.map(([msg]) => msg).join('\n');
            expect(logged).toContain('Source CLIP lookup failed for l1.jpg: map gone');
            expect(logged).toContain('Source CLIP lookup for l2.jpg returned 10 dims');
            expect(res.source).toBe('trained');
            expect(modelCacheStore.value.entries).toHaveLength(1);
        });

        it('persists nothing when the sort is cancelled mid-collection, reused entries included (Review Focus 2)', async () => {
            // The no-save-on-abort rule predates G3, so this passes before the change; it pins that a reused
            // vector is no reason to save. Mutation-check: call _saveVectorCache before the in-loop abort return.
            const io = makeCacheIo();
            const controller = new AbortController();
            const lookupSourceClip = vi.fn((file) => (file.name === 'l1.jpg' ? sourceClip() : null));
            const { m } = scenario({
                cacheIo: io,
                managerOverrides: {
                    lookupSourceClip,
                    logPerf: vi.fn(),
                    now: () => 0,
                    computeFeatures: vi.fn(async (p) => {
                        if (p === '/likes/l2.jpg') controller.abort();
                        return new Float32Array(64).fill(0.5);
                    }),
                },
            });
            const res = await m.ensureTrainedModel({ signal: controller.signal });
            expect(res.source).toBe('skipped');
            expect(io.written).toEqual([]);
            expect(m.logPerf.mock.calls[0][0]).toMatch(/^ML training: source=aborted /);
        });
    });
```

Update Task 1's two exact-string expectations to the final format:
- In `formatTrainingPerfLine (G3)` → `rounds to whole milliseconds…`: the `likes` object gains `clipReused: 5, noSourceCopy: 0`, and the expected string's `misses=5 features=300ms` becomes `misses=5 clipReused=5 noSourceCopy=0 features=300ms`.
- In `perf line (G3)` → `writes one line for a rebuild…`: both `misses=3 features=0ms` become `misses=3 clipReused=0 noSourceCopy=0 features=0ms` (no lookup is injected there, so nothing is consulted).

The spec's test 6 ("no callback → today's behavior") is the existing `ensureTrainedModel` suite: none of its tests injects `lookupSourceClip`, and it must stay green unchanged.

- [ ] **Step 2: Write the failing composition test**

In `tests/source-clip-reuse.test.js`, add to the imports `import { MlTrainingManager } from '../ml-training.js';`, then append:

```js
describe('composition: the real _lookupSourceClip behind a real MlTrainingManager (spec § 9, test 5)', () => {
    // The 2026-09-10 spec's lesson (§ 13, on § 9.1): an isolation property belongs to a composition, so this
    // binds the REAL host lookup — through the very callback line the constructor injects, read from
    // media-viewer.js — not a vi.fn() stand-in that could never touch a host map.
    function injectedCallback(host, key) {
        const m = source.match(new RegExp(`^\\s+${key}: (\\(.*\\) =>.*),$`, 'm'));
        if (!m) {
            throw new Error(`Could not find the constructor's injected ${key} callback`);
        }
        return new Function(`return ${m[1]};`).call(host);
    }
    const snapshot = (ctx) =>
        JSON.stringify({
            featureCache: [...ctx.featureCache].map(([k, v]) => [k, Array.from(v)]),
            clipCache: [...ctx.clipCache].map(([k, v]) => [k, Array.from(v)]),
            featureMetadata: [...ctx.featureMetadata],
            departedClips: [...ctx.departedClips].map(([k, v]) => [k, { ...v, clip: Array.from(v.clip) }]),
        });

    it('reuses the moved file’s CLIP half, computes its 64 dims, and changes no host map', async () => {
        const movedClip = clipOf(0.75);
        const host = hostCtx({
            departedClips: new Map([['moved.jpg', { clip: movedClip, size: 50, mtimeMs: 500 }]]),
            featureCache: new Map([['/src/other.jpg', new Float32Array(64).fill(0.1)]]),
            clipCache: new Map([['/src/other.jpg', clipOf(0.2)]]),
            featureMetadata: new Map([['/src/other.jpg', { size: 7, mtime: 70 }]]),
            _lookupSourceClip: extract('_lookupSourceClip'),
        });
        const before = snapshot(host);

        const likeFiles = [
            { name: 'moved.jpg', path: '/likes/moved.jpg', size: 50, mtimeMs: 500 },
            { name: 'l2.jpg', path: '/likes/l2.jpg', size: 11, mtimeMs: 2 },
            { name: 'l3.jpg', path: '/likes/l3.jpg', size: 12, mtimeMs: 3 },
        ];
        const dislikeFiles = [
            { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
            { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
            { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
        ];
        const written = [];
        const computeFeatures = vi.fn(async () => new Float32Array(64).fill(0.5));
        const extractClipEmbedding = vi.fn(async () => clipOf(0.25));
        const trainModel = vi.fn(async () => ({
            stats: { isReady: true, positiveCount: 3, negativeCount: 3 },
            modelState: { weights: [1] },
        }));
        const m = new MlTrainingManager({
            loadFolder: async (p) => ({ success: true, files: p === '/likes' ? likeFiles : dislikeFiles }),
            computeFeatures,
            extractClipEmbedding,
            lookupSourceClip: injectedCallback(host, 'lookupSourceClip'),
            trainModel,
            loadModelState: vi.fn(),
            getConfig: () => ({
                customLikeFolder: '/likes',
                customDislikeFolder: '/dislikes',
                enableClipFeatures: true,
                versions: { mlModelVersion: 3, featureCacheVersion: 4, featureVersion: 2, trainingConfigVersion: 1 },
            }),
            getBulkRatedContext: () => ({
                bulkRated: new Map(),
                mediaFiles: [],
                featureCache: host.featureCache,
                clipCache: host.clipCache,
            }),
            cacheIo: {
                acquireLock: async () => () => {},
                open: async () => ({ success: false, notFound: true }), // no training caches on disk yet
                chunk: vi.fn(),
                close: async () => ({ success: true }),
                writeOpen: async () => ({ success: true }),
                writeChunk: async (entries) => {
                    for (const e of entries) written.push(e);
                    return { success: true };
                },
                writeClose: async () => ({ success: true }),
            },
            modelCache: { read: async () => ({ success: true, store: null }), write: async () => ({ success: true }) },
        });

        const res = await m.ensureTrainedModel({});

        expect(res.source).toBe('trained');
        expect(extractClipEmbedding.mock.calls.map(([p]) => p)).not.toContain('/likes/moved.jpg');
        expect(computeFeatures.mock.calls.map(([p]) => p)).toContain('/likes/moved.jpg');
        const movedRow = trainModel.mock.calls[0][0].find((row) => Math.abs(row[64] - 0.75) < 1e-6);
        expect(movedRow, 'the reused CLIP half did not reach training').toBeDefined();
        expect(movedRow[0]).toBeCloseTo(0.5);
        expect(written.find(([name]) => name === 'moved.jpg')[1].clipVector).toEqual(Array.from(movedClip));
        expect(snapshot(host)).toBe(before);
        expect(host.departedClips.get('moved.jpg').clip).toBe(movedClip);
    });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/ml-training.test.js tests/source-clip-reuse.test.js`
Expected: FAIL — `fills a miss…` (`extractClipEmbedding` was called for `/likes/l1.jpg`), `heals…` (called once), `extracts CLIP as before…` (`lookupSourceClip` called 0 times), `treats a throwing…` (logError lacks the lines), the two updated format expectations (no `clipReused`), and the composition test (`Could not find the constructor's injected lookupSourceClip callback`). `never consults…` and `persists nothing…` pass by construction (labelled). Record in the Progress Log.

- [ ] **Step 4: Implement the reuse**

In `ml-training.js`'s constructor JSDoc, after the `o.extractClipEmbedding` line, add:

```js
     * @param {(file: {name: string, size: number, mtimeMs: number}) => (Float32Array|null|Promise<Float32Array|null>)} [o.lookupSourceClip]
     *        G3: the CLIP half the SOURCE folder already holds for this training file — name, size and mtime
     *        matched by the host, returned as a copy. Consulted only with CLIP on. Absent = always extract.
```

In the constructor body, after `this.extractClipEmbedding = o.extractClipEmbedding;` add:

```js
        this.lookupSourceClip = o.lookupSourceClip || null;
```

After `_combine` (before `_now`), add:

```js
    /**
     * The CLIP half the source folder already holds for a training file (G3 spec § 4.3), through the host's
     * `lookupSourceClip`. Only the CLIP half is ever reused: source-folder 64-dim vectors are extracted
     * without file metadata, so they are not what `computeFeatures` produces (spec § 2.2). Any failure is a
     * miss — the caller then extracts exactly as it would have with no lookup at all.
     */
    async _reuseSourceClip(file) {
        try {
            const clip = await this.lookupSourceClip(file);
            if (clip == null) return null;
            if (hasClip(clip)) return clip;
            this.logError(`Source CLIP lookup for ${file.name} returned ${clip.length} dims, not ${CLIP_DIM}; extracting.`);
        } catch (err) {
            this.logError(`Source CLIP lookup failed for ${file.name}: ${err.message}; extracting.`);
        }
        return null;
    }
```

In `_collectFolderVectors`, change the `stats` initializer to:

```js
        const stats = {
            loadMs: 0,
            diskCount: 0,
            misses: 0,
            clipReused: 0,
            noSourceCopy: 0,
            featuresMs: 0,
            clipMs: 0,
            saveMs: 0,
        };
```

and replace Task 1's CLIP lines:

```js
                    const tClip = this._now();
                    const clip = await this.extractClipEmbedding(file.path);
                    stats.clipMs += this._now() - tClip;
```

with:

```js
                    // G3: the CLIP half from the source folder's vectors when it holds this file — only with
                    // CLIP on (spec D6: a CLIP-off row has a zero half, and a reused one would differ from a rebuild).
                    const consult = enableClipFeatures && this.lookupSourceClip !== null;
                    let clip = consult ? await this._reuseSourceClip(file) : null;
                    if (clip) {
                        stats.clipReused++;
                    } else {
                        if (consult) stats.noSourceCopy++;
                        const tClip = this._now();
                        clip = await this.extractClipEmbedding(file.path);
                        stats.clipMs += this._now() - tClip;
                    }
```

Re-read the comment block above `_collectFolderVectors` ("Only files absent from the cache cost CLIP inference…") and amend it to say a file the source folder already holds costs no CLIP inference either (grep rule). The `gainedClip` / `extracted` lines below stay as they are: a miss filled by reuse is `!hadHit`, a CLIP-less hit healed by reuse is `gainedClip`, so either saves the cache.

In `formatTrainingPerfLine`, change the folder segment to:

```js
        parts.push(
            `${label}: load=${ms(f.loadMs)} (disk ${f.diskCount}) misses=${f.misses} ` +
                `clipReused=${f.clipReused} noSourceCopy=${f.noSourceCopy} ` +
                `features=${ms(f.featuresMs)} clip=${ms(f.clipMs)} save=${ms(f.saveMs)}`
        );
```

In `media-viewer.js`'s constructor, after `            extractClipEmbedding: (p) => this.extractClipEmbedding(p),` add:

```js
            // G3: the CLIP half the source folder already holds for a training file — read-only, a copy.
            lookupSourceClip: (file) => this._lookupSourceClip(file),
```

(One line, `key: (args) => body,` — the composition test reads it from source, as `injectedComputeFeaturesCallback` reads `computeFeatures:`.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/ml-training.test.js tests/source-clip-reuse.test.js` — expected PASS. Then `npx vitest run` and `npm run lint` — PASS, no new findings.

- [ ] **Step 6: Mutation-check the pass-by-construction tests**

One at a time, apply, run, confirm FAIL, restore:
1. `const consult = this.lookupSourceClip !== null;` (drop the CLIP guard) → `never consults the source with CLIP off` fails.
2. In the loop, before `if (signal?.aborted) return { … aborted: true, stats };`, insert `if (signal?.aborted) await this._saveVectorCache(folderPath, entries, diskCount, files.length);` → `persists nothing when the sort is cancelled…` fails.
3. In `_lookupSourceClip`, `return c.clip;` instead of the copy → the composition test still passes (the manager never mutates), so ALSO confirm `returns a copy of a departed vector…` in Task 2's tests fails — the copy is pinned there.
Record each in the Progress Log.

- [ ] **Step 7: Commit**

```bash
git add ml-training.js media-viewer.js tests/ml-training.test.js tests/source-clip-reuse.test.js
git commit -m "feat(ml): reuse the source folder's CLIP half on a training-cache miss (G3 Task 3)"
```

(with the trailer). Record the SHA — **this is the after-run build**.

---

## Checkpoint B: the user's after run

The controller asks the user to run this on Task 3's commit:

1. Close the app.
2. In Explorer, move about **5 different files** from `Liked_2` to `Liked_3` — not the before-run batch, which is now in `Liked_3`'s training cache and would hit. Include a video if possible; choose files that were in `Liked_2` during an earlier AI sort.
3. `npm start`, open `Liked_2` with the usual folders, run the AI sort once.
4. Optional, same session: Like 2–3 files in the app, then click the "↻ Re-sort" chip (the in-app path).
5. Paste: `Get-Content "$env:APPDATA\media_viewer\logs\media-viewer-perf.log" -Tail 10`.

**Acceptance (spec § 8)**: the after run's `likes:` segment shows `clipReused` equal to the number moved and `noSourceCopy=0`, with `clip=` ≈ 0ms; both runs' lines are recorded in the Progress Log (Before run / After run), with the per-phase comparison. If `clipReused` is short: read the `Source CLIP not reused for …` lines (a stat mismatch — e.g. a cross-volume move) or, with none, `noSourceCopy` (the source cache held no CLIP for those files — F2's case, or files never AI-sorted in `Liked_2`). Do not proceed to Task 4 until the user has seen the comparison.

---

## Task 4: Docs — `CLAUDE.md` and the 2026-09-10 spec note

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md`

**Interfaces:** none.

- [ ] **Step 1: `CLAUDE.md` § Testing (Unit — Vitest)**

Replace:

```
(e.g. `removeFileFromList` needs `clipCache`/`jxlFrameCache`/`bulkRated` Maps + `bulkRatedPairs` Set + `saveBulkRatedFile`)
```

with:

```
(e.g. `removeFileFromList` needs `clipCache`/`jxlFrameCache`/`bulkRated`/`departedClips` Maps + `bulkRatedPairs` Set + `saveBulkRatedFile` + `_rememberDepartedClip`)
```

- [ ] **Step 2: `CLAUDE.md` § Cache Management — the `removeFileFromList` bullet**

Replace `+ \`likeOrSkip.forget(path)\` + currentIndex adjustment` with:

```
+ `likeOrSkip.forget(path)` + a `departedClips` entry (G3: the file's CLIP half under its `featureMetadata` stat, before the purge) + currentIndex adjustment
```

- [ ] **Step 3: `CLAUDE.md` § Cache Management — the training-vector cache bullet**

After the sentence ending `…training-folder files never do.` insert:

```
**Source CLIP reuse (G3)**: on a training-cache miss with CLIP on, `_collectFolderVectors` asks the injected `lookupSourceClip` → `_lookupSourceClip(file)` for the CLIP half — never the 64-dim half, which source-folder extraction computes without file metadata, so it is not what `computeFeatures` produces. The lookup reads `departedClips` (CLIP halves of files that left the source folder this session: fed by `_loadFeatureCacheLocked`'s prune via `commitFresh` and by `removeFileFromList`; 5,000 cap; cleared in `loadFolder`), then the live `clipCache` at the source path, matches name + size + mtime, writes nothing and returns a copy. Each `ensureTrainedModel` call and each AI sort writes one `media-viewer-perf.log` line (`ML training: …`, `AI sort: …`).
```

- [ ] **Step 4: The 2026-09-10 spec note**

In `docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md`, directly under its title block (before `## 1.`), add:

```
> **Note (2026-10-13, G3).** The manager also reads the source folder's CLIP vectors on a training-cache miss — through an injected `lookupSourceClip`, read-only, returning a copy — so a file moved into a training folder is not re-run through CLIP. § 4.1's direction is unchanged: nothing is written into the source folder's maps. See [2026-10-13-g3-source-clip-reuse-design.md](2026-10-13-g3-source-clip-reuse-design.md).
```

- [ ] **Step 5: Check and commit**

Run: `node scripts/check-docs-index.js` — expected no output, exit 0. Then:

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md
git commit -m "docs: G3 source CLIP reuse in CLAUDE.md; pointer note on the ML pipeline spec"
```

(with the trailer).

---

## Finish (after Task 4)

- [ ] `npx vitest run`, `npm run lint`, `npm run format:check` — all clean.
- [ ] Re-read every comment attached to changed code (grep rule); grep `tests/` and comments for `_collectFolderVectors` return-shape prose and for "keeps no vectors" claims that the change might contradict (it does not: the manager still keeps none across calls).
- [ ] Update this plan: Status, Progress Log, Before/After run lines, Key Discoveries.
- [ ] Push (pre-push runs E2E — expected: RUN, all green; record the count). Open the PR: summary, the before/after lines, the spec link, test plan, F1–F3 named as follow-ups. Body ends with the `🤖 Generated with [Claude Code](https://claude.com/claude-code)` line.
- [ ] Review: standard (`high`). **Ask the user** before running any code review in this chat (memory: the usual flow is PR → review in a separate chat).

## Improvements (minimum 2 required before Extract)

- 🟤 **F1 — Train/score feature skew: source-folder vectors are extracted without file metadata.** The worker pool is posted pixels only (`media-viewer.js` `enqueueFeatureExtraction` → `feature-worker.js` `extractFeatures(imageData, metadata || {})`) and the displayed-media path calls `extractFeatures(imageData)` bare, while training vectors come from `computeFeatures` with size/format/dimensions/video info/faces. Dims 42–47 and 54–61 are constants in every scored vector and real values in every training vector. Fix: pass metadata on the source paths (a `FEATURE_VERSION` bump → re-extraction of every folder); measure the prediction-quality effect first. Would also make the 64-dim half reusable (spec § 2.2, § 10).
- 🟤 **F2 — A file rated in the app whose next sort is in a later session loses its source copy** when an extraction-triggered save rewrote the source cache between the move and the next load. `noSourceCopy` in the perf line measures how often (spec § 10).
- 🟤 **F3 — (low) an in-app move that suffixed ` (n)` cannot be matched by name**, so it is extracted as before (spec § 10).

## Residuals for Extract

- Annotate the two 🟤 entries tagged on the 🔵 [2026-10-04] retrain entry — "`MlTrainingManager` retains no vectors across calls, so every rebuild re-streams both training folders' `.feature_cache.json` in full" and "Every rebuild scores the whole source folder twice" — with the measured `load=` and `sort=` numbers from the Before/After runs, so their next planning pass starts from data.

## Closeout (after the merge, on `main`)

Per `~/.claude/rules/planning-closeout.md`: Extract (Improvements → BACKLOG 🟤 under `### [YYYY-MM-DD] From: G3 closeout`; the Residuals annotations) → Archive (this plan → `docs/archive/plans/`, `git rm` the original, index it in `docs/README.md`) → Transition (DONE.md entry; WEEKLY Summary-Table G3 Status → `✅ <merge-SHA> (PR #N)`; the Wednesday Daily-Schedule row; the 🔵 [2026-10-04] entry — check it off if items (1) and (2) are fully carried by their tagged 🟤 entries, else annotate it with "(3) done in PR #N") → spec post-implementation note → Commit → Capture learnings. Propagation check: any late measurement or review fix that changes what `CLAUDE.md` now says.

## Progress Log

- **2026-10-13** — Branch `g3-source-vector-reuse` created from `main` @ `c2673c4`. Brainstormed with the user section by section: D1 CLIP half only (after finding the source 64-dim vectors lack file metadata), D2 the `departedClips` map + lookup, D3 perf log. mtime probe through `Shell.Application.MoveHere`: `mtimeMs 1709626272345.679, size 200` before and after (same volume). Spec committed `f8e1c53` (hook: 1357 passed, 1 skipped); user approved it.
- **2026-10-13** — Plan written.
- **2026-10-13** — User approved the plan; execution subagent-driven (Sonnet · `high` implementers, the controller commits). Pre-flight rulings: R1 — the `_logSortPerf` "never throws" test uses `window = {}` so it pins the try/catch (as written it could not fail against any single mutation); R2 — Task 2 may add any `this.*` field `_loadFeatureCacheLocked` touches to `hostCtx`; R3 — Task 2 starts once the before-run app is open, and Task 3 starts only after the before-run lines arrive (the app reads its code at launch, so later edits can't reach a running app, but Task 3's would change a later launch).
- **2026-10-13** — **Task 1 done, `713af35`** (hook: 1372 passed, 1 skipped). This is the before-run build. RED, manager: `7 failed | 108 passed` — the 2 `formatTrainingPerfLine` tests (`not a function`) and 5 of the 6 `perf line (G3)` tests (`m.logPerf` undefined); `never fails a rebuild…` passed by construction, as labelled. RED, sort: collection failed (`Could not find method: _logSortPerf`); with a stub method, `6 failed | 417 passed` (5 lifecycle tests: `called 1 times, but got 0 times`; the format test: `expected [] to deeply equal [ Array(1) ]`). Mutation checks, all restored, each one FAILED its test:
  - `_now` without the try → `Error: clock`;
  - `_writeTrainingPerf` without the try → `Error: sink` (an extra check beyond the plan's);
  - `_logSortPerf` without the try → `TypeError … reading 'logPerf'` (R1).

  Task review: spec ✅, approved, 3 minors deferred to the final review:
  - time from a failed extraction call is not counted;
  - `misses` includes CLIP-only re-extractions;
  - a throwing `ensureTrainedModel` leaves no `training` phase in the sort line.

### Before run

_(Checkpoint A — the user's lines, verbatim.)_

### After run

_(Checkpoint B — the user's lines, verbatim, and the comparison.)_

## Key Discoveries

- **The BACKLOG entry's mechanism was half wrong** (memory: a BACKLOG entry's stated mechanism is a hypothesis). "Fill a training-cache miss from the source folder's vector" assumed the source vector is what extraction computes; only the CLIP half is. `computeFeatures` has exactly one caller — the manager — so no source-folder vector has ever carried file metadata.
- **Moves never dirty the source cache** (only extraction sets `featureCacheDirty`), so an Explorer-moved file's entry usually survives on disk until the next session's load — which is what makes capturing it at load time work.
