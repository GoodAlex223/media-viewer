# ML Training Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop re-extracting and retraining a byte-identical training set every time a source folder without a `.ml_model.json` is AI-sorted, by making the model's identity follow its training set instead of the folder it is viewed from.

**Architecture:** A new pure-ESM `ml-training.js` module owns training-set assembly, a training-set fingerprint, per-training-folder vector caches, and a fingerprint-keyed model cache in app data. The online per-rating update protocol is removed, so the model becomes a pure, reproducible function of its training set. The renderer keeps sort orchestration and the progress card.

**Tech Stack:** Electron 30+, vanilla ES modules in the renderer (no bundler), CommonJS in main/workers, Vitest (unit), Playwright (E2E).

**Spec:** [docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md](../../superpowers/specs/2026-09-10-ml-training-pipeline-design.md)

## Global Constraints

- **New logic lands in `ml-training.js`, not `media-viewer.js`.** The renderer is 9,642 lines; this plan must remove more from it than it adds.
- **Module pattern:** `export class MlTrainingManager` with constructor-injected callbacks, following `fullscreen.js` (explicit callbacks), not `tournament.js` (whole-host). Testable with no MediaViewer instance.
- **Training vectors must never be written into `this.featureCache` / `this.clipCache` / `this.featureMetadata`.** Reading the source folder's maps for bulk-rated files is correct; writing training-folder vectors into them is the data-loss path.
- **Never persist `size: 0` or `mtime: 0`** in a cache entry — `0` never matches a real stat, so the entry is rejected as stale forever. Skip unresolvable entries instead.
- **Every cache carries its own shrink-guard baseline.** The guard that caught a real 23,559-entry → 32-entry overwrite is per-cache or it is nothing.
- **All feature-cache IO goes through one lock.** The main-process streaming reader keeps a single global handle.
- **Prettier:** tabWidth 4, singleQuote, semi, trailingComma es5, printWidth 120, arrowParens always, LF.
- **Unused vars prefix `_`** to satisfy ESLint `no-unused-vars`.
- **Pre-commit runs `npx vitest run`.** Every commit must leave the suite green (613 tests at plan time).
- **A RED test that passes against unfixed code is zero coverage.** Every "verify it fails" step is mandatory and its failure message must match.

---

### Task 1: Training determinism, reset, and version reporting

Makes training a pure function of its inputs — the precondition for caching it at all. Also fixes the inflated `positiveCount` and the never-resetting learning-rate decay.

**Files:**
- Modify: `ml-model.js` (add `TRAINING_CONFIG_VERSION`, seeded shuffle in `trainBatch`, export)
- Modify: `ml-worker.js:68-100` (`trainFromHistorical` resets + takes a seed), `:276-288` (`trainHistorical` case), `:263-274` (`initComplete` echo)
- Modify: `tests/ml-model.test.js`
- Create: `tests/ml-worker.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `ml-model.js` exports `TRAINING_CONFIG_VERSION: number` (starts at `1`).
  - `OnlineLogisticRegression.prototype.trainBatch(featuresArray, labelsArray, epochs = 5, seed = 1)` — deterministic for a given seed.
  - Worker message `{ type: 'trainHistorical', data: { likedFeatures, dislikedFeatures, seed } }`.
  - Worker reply `initComplete` gains `trainingConfigVersion`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ml-model.test.js`:

```js
describe('trainBatch determinism and counts (G1)', () => {
    const makeSet = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: 576 }, (_, d) => (i + d) % 7));

    it('counts each sample once regardless of epoch count', () => {
        const model = new OnlineLogisticRegression(576);
        const features = makeSet(6);
        const labels = [1, 1, 1, 0, 0, 0];
        model.trainBatch(features, labels, 5, 12345);
        expect(model.positiveCount).toBe(3);
        expect(model.negativeCount).toBe(3);
        expect(model.totalSamples).toBe(6);
    });

    it('produces identical weights for the same seed', () => {
        const features = makeSet(8);
        const labels = [1, 0, 1, 0, 1, 0, 1, 0];
        const a = new OnlineLogisticRegression(576);
        const b = new OnlineLogisticRegression(576);
        a.trainBatch(features, labels, 4, 999);
        b.trainBatch(features, labels, 4, 999);
        expect(Array.from(a.weights)).toEqual(Array.from(b.weights));
    });

    it('produces different weights for different seeds', () => {
        const features = makeSet(8);
        const labels = [1, 0, 1, 0, 1, 0, 1, 0];
        const a = new OnlineLogisticRegression(576);
        const b = new OnlineLogisticRegression(576);
        a.trainBatch(features, labels, 4, 1);
        b.trainBatch(features, labels, 4, 2);
        expect(Array.from(a.weights)).not.toEqual(Array.from(b.weights));
    });

    it('exports TRAINING_CONFIG_VERSION', () => {
        expect(typeof TRAINING_CONFIG_VERSION).toBe('number');
        expect(TRAINING_CONFIG_VERSION).toBeGreaterThanOrEqual(1);
    });
});
```

Add `TRAINING_CONFIG_VERSION` to the destructuring at the top of `tests/ml-model.test.js` (it currently pulls `OnlineLogisticRegression`, `ML_MODEL_VERSION`, `DEFAULT_FEATURE_DIM` from `require('../ml-model')`).

Create `tests/ml-worker.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ml-worker.js runs under importScripts('ml-model.js') in a real Worker, which puts
// ml-model.js's classes in global scope. Reproduce that: load the CJS exports and hang
// them on globalThis, then stub importScripts + self before require()-ing the worker.
// (House pattern: tests/sorting-worker.test.js stubs globalThis.self the same way.)
const { OnlineLogisticRegression, ML_MODEL_VERSION, DEFAULT_FEATURE_DIM, TRAINING_CONFIG_VERSION } =
    require('../ml-model.js');

const posted = [];
globalThis.OnlineLogisticRegression = OnlineLogisticRegression;
globalThis.ML_MODEL_VERSION = ML_MODEL_VERSION;
globalThis.DEFAULT_FEATURE_DIM = DEFAULT_FEATURE_DIM;
globalThis.TRAINING_CONFIG_VERSION = TRAINING_CONFIG_VERSION;
globalThis.importScripts = () => {};
globalThis.self = { onmessage: null, postMessage: (m) => posted.push(m) };

require('../ml-worker.js');

const send = (msg) => globalThis.self.onmessage({ data: msg });
const lastOfType = (type) => [...posted].reverse().find((m) => m.type === type);
const vec = (n, fill) => Array.from({ length: n }, () => fill);

beforeEach(() => {
    posted.length = 0;
    send({ type: 'init', data: {} });
    posted.length = 0;
});

describe('ml-worker trainHistorical (G1)', () => {
    it('resets before training, so training twice yields the same counts', () => {
        const liked = [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)];
        const disliked = [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)];

        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 7 } });
        const first = lastOfType('trainComplete').stats;

        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 7 } });
        const second = lastOfType('trainComplete').stats;

        expect(second.positiveCount).toBe(first.positiveCount);
        expect(second.negativeCount).toBe(first.negativeCount);
    });

    it('reports the real sample counts, not counts multiplied by epochs', () => {
        const liked = [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)];
        const disliked = [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)];
        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 7 } });
        const stats = lastOfType('trainComplete').stats;
        expect(stats.positiveCount).toBe(3);
        expect(stats.negativeCount).toBe(3);
    });

    it('is deterministic for a fixed seed', () => {
        const liked = [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)];
        const disliked = [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)];
        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 42 } });
        const a = lastOfType('trainComplete').modelState.weights;
        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 42 } });
        const b = lastOfType('trainComplete').modelState.weights;
        expect(b).toEqual(a);
    });
});

describe('ml-worker initComplete (G1)', () => {
    it('echoes the training config version alongside the model version', () => {
        posted.length = 0;
        send({ type: 'init', data: {} });
        const reply = lastOfType('initComplete');
        expect(reply.modelVersion).toBe(ML_MODEL_VERSION);
        expect(reply.featureDim).toBe(DEFAULT_FEATURE_DIM);
        expect(reply.trainingConfigVersion).toBe(TRAINING_CONFIG_VERSION);
    });
});
```

> If G4's `tests/ml-worker.test.js` has already landed, **extend it** with these `describe` blocks rather than creating the file, and keep its existing harness.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ml-model.test.js tests/ml-worker.test.js`
Expected: FAIL. `ml-model.test.js` fails with `positiveCount` `30` (6 samples × 5 epochs) instead of `6`, and `TRAINING_CONFIG_VERSION` `undefined`. `ml-worker.test.js` fails on `trainingConfigVersion` being `undefined` and on the doubled counts in the reset test.

- [ ] **Step 3: Add the seeded PRNG, the seed parameter, and the version constant to `ml-model.js`**

At the top, beside `ML_MODEL_VERSION`:

```js
const ML_MODEL_VERSION = 3;
const DEFAULT_FEATURE_DIM = 576; // 64 hand-crafted + 512 CLIP semantic

// Bumped whenever the learning rate, regularization, epoch schedule or class-weight rule
// changes. The training-set fingerprint includes it, so a hyperparameter change invalidates
// every cached model. Echoed to the renderer in the worker's initComplete reply so the value
// is never duplicated outside this file.
const TRAINING_CONFIG_VERSION = 1;

// Deterministic PRNG (mulberry32). trainBatch shuffles with it instead of Math.random() so a
// given training set always produces the same weights — that is what makes a cached model
// verifiable rather than merely plausible.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
```

Replace `trainBatch` (`ml-model.js:171`):

```js
    trainBatch(featuresArray, labelsArray, epochs = 5, seed = 1) {
        if (featuresArray.length === 0) return;

        const random = mulberry32(seed);

        for (let epoch = 0; epoch < epochs; epoch++) {
            // Shuffle indices for SGD (seeded — see mulberry32 above)
            const indices = Array.from({ length: featuresArray.length }, (_, i) => i);
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            // Process samples in shuffled order. Only the first epoch counts each sample —
            // later epochs are additional passes over the SAME data, so counting them again
            // inflated positiveCount/negativeCount by a factor of `epochs`, which drove both
            // the class-imbalance weight and the user-facing "N likes, M dislikes" figures.
            const countThisPass = epoch === 0;
            for (const idx of indices) {
                this.update(featuresArray[idx], labelsArray[idx], countThisPass);
            }
        }
    }
```

Change `update` (`ml-model.js:71`) to take the flag, defaulting to `true` so every existing caller is unaffected:

```js
    update(features, label, countSample = true) {
        // Update class counts
        if (countSample) {
            if (label === 1) {
                this.positiveCount++;
            } else {
                this.negativeCount++;
            }
            this.totalSamples++;
        }
```

Leave the rest of `update` untouched.

Add to the export block at the tail of `ml-model.js`:

```js
    module.exports = {
        OnlineLogisticRegression,
        ML_MODEL_VERSION,
        DEFAULT_FEATURE_DIM,
        TRAINING_CONFIG_VERSION,
    };
```

- [ ] **Step 4: Reset before training and thread the seed through `ml-worker.js`**

Replace the head of `trainFromHistorical` (`ml-worker.js:68`):

```js
function trainFromHistorical(likedFeatures, dislikedFeatures, seed = 1) {
    if (!model) {
        initializeModel(null);
    }

    // Reset before training. Without this, trainBatch warm-starts onto the previous weights,
    // so a file removed from the like folder could never be unlearned and totalSamples grew
    // without bound (dragging adaptiveLR toward zero). A rebuild must reproduce the model a
    // fresh install would produce, or the fingerprint cache is keyed on a lie.
    model.reset();

    const totalSamples = likedFeatures.length + dislikedFeatures.length;
```

and its `trainBatch` call:

```js
    model.trainBatch(features, labels, epochs, seed);
```

In the `trainHistorical` case (`ml-worker.js:276`):

```js
                const trainResult = trainFromHistorical(
                    data.likedFeatures || [],
                    data.dislikedFeatures || [],
                    data.seed || 1
                );
```

In the `initComplete` reply (`ml-worker.js:265`), add one line after `featureDim`:

```js
                modelVersion: ML_MODEL_VERSION,
                featureDim: DEFAULT_FEATURE_DIM,
                trainingConfigVersion: TRAINING_CONFIG_VERSION,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ml-model.test.js tests/ml-worker.test.js`
Expected: PASS.

Then the whole suite: `npm test` — expected PASS (613 + the new cases).

- [ ] **Step 6: Commit**

```bash
git add ml-model.js ml-worker.js tests/ml-model.test.js tests/ml-worker.test.js
git commit -m "fix(ml): reset before historical training; seed the shuffle; stop inflating counts

trainFromHistorical warm-started onto existing weights, so a file removed from
the like folder could never be unlearned and totalSamples grew across retrains,
decaying adaptiveLR toward zero. trainBatch also counted every sample once per
epoch, so positiveCount was likes x epochs -- the figure shown in the 'ML
trained' toast and the 'Need more ratings' message, and the input to the
class-imbalance weight.

Training is now deterministic for a given seed, which is what lets a cached
model be verified against a rebuild.

Adds TRAINING_CONFIG_VERSION, echoed in initComplete so the renderer never
duplicates the constant."
```

---

### Task 2: `ml-training.js` — descriptor and fingerprint

The pure core: no IO, no DOM, no worker. Everything the model is a function of, and nothing else.

**Files:**
- Create: `ml-training.js`
- Create: `tests/ml-training.test.js`
- Modify: `eslint.config.mjs:113`

**Interfaces:**
- Consumes: `TRAINING_CONFIG_VERSION` from Task 1 (as a value passed in, not imported — `ml-model.js` is not importable from the renderer).
- Produces:
  - `DESCRIPTOR_KEYS: readonly string[]` — the declared schema.
  - `buildDescriptor(input) => Descriptor` where
    `input = { likeFolder, likeFiles, dislikeFolder, dislikeFiles, bulkRated, enableClipFeatures, versions }`,
    `likeFiles`/`dislikeFiles` are `Array<{ name, size, mtimeMs }>`,
    `bulkRated` is `Array<{ name, bucket, size, mtimeMs }>`,
    `versions = { mlModelVersion, featureCacheVersion, featureVersion, trainingConfigVersion }`.
  - `fingerprintDescriptor(descriptor) => string` — 32 lowercase hex chars.
  - `seedFromFingerprint(fingerprint) => number` — uint32.

- [ ] **Step 1: Write the failing tests**

Create `tests/ml-training.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { DESCRIPTOR_KEYS, buildDescriptor, fingerprintDescriptor, seedFromFingerprint } from '../ml-training.js';

const baseInput = () => ({
    likeFolder: '/likes',
    likeFiles: [
        { name: 'a.jpg', size: 100, mtimeMs: 1000 },
        { name: 'b.jpg', size: 200, mtimeMs: 2000 },
    ],
    dislikeFolder: '/dislikes',
    dislikeFiles: [{ name: 'c.jpg', size: 300, mtimeMs: 3000 }],
    bulkRated: [{ name: 'd.jpg', bucket: 'good', size: 400, mtimeMs: 4000 }],
    enableClipFeatures: true,
    versions: { mlModelVersion: 3, featureCacheVersion: 4, featureVersion: 2, trainingConfigVersion: 1 },
});

// One case per declared input. A new descriptor key without a row here fails the
// completeness test below -- the control that stops an unfingerprinted input reaching
// training and silently serving a stale model.
const MUTATIONS = {
    likeFolder: (i) => (i.likeFolder = '/other-likes'),
    likeFiles: (i) => (i.likeFiles[0].size = 101),
    dislikeFolder: (i) => (i.dislikeFolder = '/other-dislikes'),
    dislikeFiles: (i) => (i.dislikeFiles[0].mtimeMs = 3001),
    bulkRated: (i) => (i.bulkRated[0].bucket = 'bad'),
    enableClipFeatures: (i) => (i.enableClipFeatures = false),
    mlModelVersion: (i) => (i.versions.mlModelVersion = 4),
    featureCacheVersion: (i) => (i.versions.featureCacheVersion = 5),
    featureVersion: (i) => (i.versions.featureVersion = 3),
    trainingConfigVersion: (i) => (i.versions.trainingConfigVersion = 2),
};

describe('training-set descriptor', () => {
    it('declares exactly the keys the mutation table covers', () => {
        expect([...DESCRIPTOR_KEYS].sort()).toEqual(Object.keys(MUTATIONS).sort());
    });

    it('produces only declared keys', () => {
        const d = buildDescriptor(baseInput());
        expect(Object.keys(d).sort()).toEqual([...DESCRIPTOR_KEYS].sort());
    });

    it('is insensitive to file ordering', () => {
        const a = baseInput();
        const b = baseInput();
        b.likeFiles.reverse();
        expect(fingerprintDescriptor(buildDescriptor(a))).toBe(fingerprintDescriptor(buildDescriptor(b)));
    });

    it('ignores fields that do not affect training', () => {
        const a = baseInput();
        const b = baseInput();
        b.likeFiles[0].path = '/somewhere/else/a.jpg';
        b.likeFiles[0].type = 'image/png';
        expect(fingerprintDescriptor(buildDescriptor(a))).toBe(fingerprintDescriptor(buildDescriptor(b)));
    });
});

describe('fingerprint', () => {
    it('is stable for identical input', () => {
        expect(fingerprintDescriptor(buildDescriptor(baseInput()))).toBe(
            fingerprintDescriptor(buildDescriptor(baseInput()))
        );
    });

    it('is 32 lowercase hex characters', () => {
        expect(fingerprintDescriptor(buildDescriptor(baseInput()))).toMatch(/^[0-9a-f]{32}$/);
    });

    for (const [key, mutate] of Object.entries(MUTATIONS)) {
        it(`changes when ${key} changes`, () => {
            const before = fingerprintDescriptor(buildDescriptor(baseInput()));
            const mutated = baseInput();
            mutate(mutated);
            expect(fingerprintDescriptor(buildDescriptor(mutated))).not.toBe(before);
        });
    }

    it('distinguishes an added file from a removed one', () => {
        const withExtra = baseInput();
        withExtra.likeFiles.push({ name: 'z.jpg', size: 500, mtimeMs: 5000 });
        expect(fingerprintDescriptor(buildDescriptor(withExtra))).not.toBe(
            fingerprintDescriptor(buildDescriptor(baseInput()))
        );
    });
});

describe('seedFromFingerprint', () => {
    it('is a stable uint32 for a given fingerprint', () => {
        const fp = fingerprintDescriptor(buildDescriptor(baseInput()));
        const seed = seedFromFingerprint(fp);
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(0xffffffff);
        expect(seedFromFingerprint(fp)).toBe(seed);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ml-training.test.js`
Expected: FAIL — `Failed to resolve import "../ml-training.js"`.

- [ ] **Step 3: Create `ml-training.js` with the descriptor and fingerprint**

```js
// ml-training.js
// MlTrainingManager — owns the ML training set: which files train the model, the fingerprint
// that identifies that set, the per-training-folder vector caches, and the fingerprint-keyed
// model cache. Follows the v2.0 modularization pattern (see fullscreen.js): constructor-injected
// callbacks for host dependencies, so the module is testable with no MediaViewer instance.
//
// Design: docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md

/**
 * Everything the trained model is a function of. Training reads the descriptor and nothing
 * else, so an input that is not declared here cannot influence the model — which is what
 * makes a fingerprint miss structurally impossible rather than merely discouraged.
 */
export const DESCRIPTOR_KEYS = Object.freeze([
    'likeFolder',
    'likeFiles',
    'dislikeFolder',
    'dislikeFiles',
    'bulkRated',
    'enableClipFeatures',
    'mlModelVersion',
    'featureCacheVersion',
    'featureVersion',
    'trainingConfigVersion',
]);

// Only these fields of a file entry affect training. `path` is excluded deliberately: the
// folder is already a descriptor key, and including absolute paths would make the fingerprint
// machine-specific for no gain.
const fileTriple = (f) => [String(f.name), Number(f.size) || 0, Number(f.mtimeMs) || 0];
const byName = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

export function buildDescriptor({
    likeFolder,
    likeFiles,
    dislikeFolder,
    dislikeFiles,
    bulkRated,
    enableClipFeatures,
    versions,
}) {
    return {
        likeFolder: likeFolder || '',
        likeFiles: (likeFiles || []).map(fileTriple).sort(byName),
        dislikeFolder: dislikeFolder || '',
        dislikeFiles: (dislikeFiles || []).map(fileTriple).sort(byName),
        bulkRated: (bulkRated || [])
            .map((f) => [String(f.name), String(f.bucket), Number(f.size) || 0, Number(f.mtimeMs) || 0])
            .sort(byName),
        enableClipFeatures: Boolean(enableClipFeatures),
        mlModelVersion: Number(versions?.mlModelVersion) || 0,
        featureCacheVersion: Number(versions?.featureCacheVersion) || 0,
        featureVersion: Number(versions?.featureVersion) || 0,
        trainingConfigVersion: Number(versions?.trainingConfigVersion) || 0,
    };
}

// FNV-1a over a canonical serialization. Four independent basis values give 128 bits, because
// a collision here is not a slow cache but a silently wrong model.
function fnv1a(str, offset) {
    let h = offset >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

const OFFSETS = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];

/** Serialize in DESCRIPTOR_KEYS order — never object key order, which is insertion-dependent. */
function canonicalize(descriptor) {
    return JSON.stringify(DESCRIPTOR_KEYS.map((k) => descriptor[k]));
}

export function fingerprintDescriptor(descriptor) {
    const text = canonicalize(descriptor);
    return OFFSETS.map((o) => fnv1a(text, o).toString(16).padStart(8, '0')).join('');
}

export function seedFromFingerprint(fingerprint) {
    return parseInt(String(fingerprint).slice(0, 8), 16) >>> 0;
}
```

- [ ] **Step 4: Register the new module with ESLint**

`eslint.config.mjs:113` currently reads:

```js
        files: ['fullscreen.js', 'tournament-engine.js', 'tournament.js'],
```

Change to:

```js
        files: ['fullscreen.js', 'tournament-engine.js', 'tournament.js', 'ml-training.js'],
```

Update the comment at `eslint.config.mjs:8` to mention it:

```js
//   2c. Browser renderer modules     — fullscreen.js, ml-training.js (ES modules, imported by media-viewer.js)
```

- [ ] **Step 5: Run tests and lint to verify they pass**

Run: `npx vitest run tests/ml-training.test.js`
Expected: PASS (all mutation cases plus the completeness checks).

Run: `npm run lint`
Expected: no errors for `ml-training.js`.

- [ ] **Step 6: Commit**

```bash
git add ml-training.js tests/ml-training.test.js eslint.config.mjs
git commit -m "feat(ml): training-set descriptor and fingerprint

Declares every input the trained model is a function of in one frozen schema,
so training reads the descriptor and nothing else. A table-driven test asserts
the fingerprint changes for each declared input and that the declared key set
equals the mutation table -- an input added without a case fails the suite
rather than silently serving a stale cached model."
```

---

### Task 3: `ml-training.js` — training-vector cache

Per-training-folder `.feature_cache.json`, isolated from the source folder's maps.

**Files:**
- Modify: `ml-training.js`
- Modify: `tests/ml-training.test.js`

**Interfaces:**
- Consumes: Task 2's module.
- Produces, on `MlTrainingManager`:
  - `constructor(options)` — see the options table in Step 3.
  - `async _loadVectorCache(folderPath, files, signal) => { entries: Map<string, CacheEntry>, diskCount: number }` where `CacheEntry = { feature: Float32Array(64), clip: Float32Array(512) | null, size: number, mtimeMs: number }`.
  - `async _saveVectorCache(folderPath, entries, diskCount) => boolean` — `false` when the shrink guard skipped the write.
  - `static CACHE_FILENAME = '.feature_cache.json'`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ml-training.test.js`:

```js
import { MlTrainingManager } from '../ml-training.js';
import { vi } from 'vitest';

function makeCacheIo(initialEntries = [], version = 4) {
    const written = [];
    return {
        written,
        acquireLock: vi.fn().mockResolvedValue(() => {}),
        open: vi.fn().mockResolvedValue({ success: true, version, count: initialEntries.length }),
        chunk: vi.fn().mockImplementation(async (offset, limit) => ({
            success: true,
            entries: initialEntries.slice(offset, offset + limit),
        })),
        close: vi.fn().mockResolvedValue({ success: true }),
        writeOpen: vi.fn().mockResolvedValue({ success: true }),
        writeChunk: vi.fn().mockImplementation(async (entries) => {
            written.push(...entries);
            return { success: true };
        }),
        writeClose: vi.fn().mockResolvedValue({ success: true }),
    };
}

const managerWith = (overrides = {}) =>
    new MlTrainingManager({
        loadFolder: vi.fn(),
        computeFeatures: vi.fn(),
        extractClipEmbedding: vi.fn(),
        trainModel: vi.fn(),
        loadModelState: vi.fn(),
        getConfig: vi.fn(),
        getBulkRatedContext: vi.fn(),
        cacheIo: makeCacheIo(),
        modelCache: { read: vi.fn(), write: vi.fn() },
        onProgress: vi.fn(),
        logError: vi.fn(),
        notify: vi.fn(),
        ...overrides,
    });

const entry = (name, size, mtimeMs) => ({
    name,
    vector: Array.from({ length: 64 }, () => 0.5),
    clipVector: Array.from({ length: 512 }, () => 0.25),
    size,
    mtime: mtimeMs,
});

describe('training-vector cache', () => {
    it('loads entries whose size and mtime still match the folder scan', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries, diskCount } = await m._loadVectorCache('/likes', [
            { name: 'a.jpg', size: 100, mtimeMs: 1000 },
        ]);
        expect(entries.size).toBe(1);
        expect(entries.get('a.jpg').feature.length).toBe(64);
        expect(entries.get('a.jpg').clip.length).toBe(512);
        expect(diskCount).toBe(1);
    });

    it('rejects an entry whose size changed', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 999, mtimeMs: 1000 }]);
        expect(entries.size).toBe(0);
    });

    it('rejects an entry whose mtime changed', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 9999 }]);
        expect(entries.size).toBe(0);
    });

    it('prunes an entry whose file is no longer in the folder', async () => {
        const io = makeCacheIo([entry('gone.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 1000 }]);
        expect(entries.size).toBe(0);
    });

    it('invalidates the whole cache on a version mismatch', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)], 3);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 1000 }]);
        expect(entries.size).toBe(0);
    });

    it('keeps a CLIP-less entry loadable but marks it for re-extraction', async () => {
        const e = entry('a.jpg', 100, 1000);
        e.clipVector = null;
        const io = makeCacheIo([e]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 1000 }]);
        expect(entries.get('a.jpg').clip).toBeNull();
    });
});

describe('training-vector cache save', () => {
    const built = (name, size, mtimeMs) => [
        name,
        {
            feature: new Float32Array(64).fill(0.5),
            clip: new Float32Array(512).fill(0.25),
            size,
            mtimeMs,
        },
    ];

    it('writes entries through the streaming writer', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        const ok = await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 0);
        expect(ok).toBe(true);
        expect(io.written).toHaveLength(1);
        expect(io.written[0].name).toBe('a.jpg');
        expect(io.written[0].size).toBe(100);
    });

    it('never writes an entry with an unresolvable size or mtime', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        await m._saveVectorCache('/likes', new Map([built('a.jpg', 0, 1000), built('b.jpg', 100, 1000)]), 0);
        expect(io.written.map((e) => e.name)).toEqual(['b.jpg']);
    });

    it('writes clipVector: null rather than zeros when CLIP was unavailable', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        const [name, value] = built('a.jpg', 100, 1000);
        value.clip = null;
        await m._saveVectorCache('/likes', new Map([[name, value]]), 0);
        expect(io.written[0].clipVector).toBeNull();
    });

    it('refuses to overwrite a populated cache with a drastically smaller one', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        const ok = await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 1000);
        expect(ok).toBe(false);
        expect(io.written).toHaveLength(0);
    });

    it('keeps each folder shrink guard independent', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        // /likes legitimately shrank to 1 from a baseline of 1; /dislikes has a 1000 baseline.
        expect(await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 1)).toBe(true);
        expect(await m._saveVectorCache('/dislikes', new Map([built('b.jpg', 100, 1000)]), 1000)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ml-training.test.js`
Expected: FAIL — `MlTrainingManager is not a constructor` / `_loadVectorCache is not a function`.

- [ ] **Step 3: Implement the manager shell and the vector cache**

Append to `ml-training.js`:

```js
const FEATURE_DIM = 64;
const CLIP_DIM = 512;
export const TRAINING_VECTOR_DIM = FEATURE_DIM + CLIP_DIM; // 576

const CHUNK_SIZE = 500;

// Round before serializing: full-precision floats stringify to ~17 chars each, and 6 decimals
// is well below the noise floor for unit-normalized cosine similarity. Mirrors the source
// folder's cache writer.
const round6 = (arr) => {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        out[i] = Math.round(arr[i] * 1e6) / 1e6;
    }
    return out;
};

export class MlTrainingManager {
    static CACHE_FILENAME = '.feature_cache.json';

    /**
     * @param {Object} o
     * @param {(path: string) => Promise<{success: boolean, files?: Array}>} o.loadFolder
     * @param {(path: string, fileInfo: Object) => Promise<Float32Array>} o.computeFeatures
     * @param {(path: string) => Promise<Float32Array|null>} o.extractClipEmbedding
     * @param {(liked: Array, disliked: Array, seed: number) => Promise<{stats: Object, modelState: Object}>} o.trainModel
     * @param {(modelState: Object) => Promise<{stats: Object}>} o.loadModelState
     * @param {() => Object} o.getConfig
     * @param {() => Object} o.getBulkRatedContext
     * @param {Object} o.cacheIo    Streaming feature-cache IO, all calls serialized by acquireLock
     * @param {Object} o.modelCache `{ read(), write(store) }`
     * @param {(p: Object) => void} o.onProgress
     * @param {(msg: string) => void} o.logError
     * @param {(msg: string, level: string) => void} o.notify
     */
    constructor(o) {
        this.loadFolder = o.loadFolder;
        this.computeFeatures = o.computeFeatures;
        this.extractClipEmbedding = o.extractClipEmbedding;
        this.trainModel = o.trainModel;
        this.loadModelState = o.loadModelState;
        this.getConfig = o.getConfig;
        this.getBulkRatedContext = o.getBulkRatedContext;
        this.cacheIo = o.cacheIo;
        this.modelCache = o.modelCache;
        this.onProgress = o.onProgress || (() => {});
        this.logError = o.logError || (() => {});
        this.notify = o.notify || (() => {});

        // Fingerprint the live worker was last trained on. Null until the first train or a
        // model-cache hit. This is what makes a repeat sort in one session free.
        this.sessionFingerprint = null;
    }

    _cachePath(folderPath) {
        const sep = folderPath.includes('\\') ? '\\' : '/';
        return folderPath.replace(/[\\/]+$/, '') + sep + MlTrainingManager.CACHE_FILENAME;
    }

    /**
     * Load one training folder's vector cache. Entries are validated against the folder scan
     * and returned in a map OWNED BY THIS MODULE — they are never merged into the host's
     * featureCache/clipCache/featureMetadata, which belong to the source folder and are
     * persisted by its own 30 s auto-save.
     */
    async _loadVectorCache(folderPath, files, signal) {
        const entries = new Map();
        if (!folderPath || !files || files.length === 0) return { entries, diskCount: 0 };

        const current = new Map(files.map((f) => [f.name, f]));
        const expectedVersion = this.getConfig?.().versions?.featureCacheVersion;

        const release = await this.cacheIo.acquireLock();
        let diskCount = 0;
        try {
            const opened = await this.cacheIo.open(this._cachePath(folderPath));
            if (!opened?.success) return { entries, diskCount: 0 };
            if (expectedVersion !== undefined && opened.version !== expectedVersion) {
                await this.cacheIo.close();
                return { entries, diskCount: 0 };
            }
            diskCount = opened.count || 0;

            for (let offset = 0; offset < diskCount; offset += CHUNK_SIZE) {
                if (signal?.aborted) break;
                const batch = await this.cacheIo.chunk(offset, CHUNK_SIZE);
                if (!batch?.success) break;
                for (const raw of batch.entries || []) {
                    const file = current.get(raw.name);
                    if (!file) continue; // pruned — no longer in the folder
                    if (!raw.size || !raw.mtime) continue; // poisoned entry
                    if (raw.size !== file.size || raw.mtime !== file.mtimeMs) continue; // stale
                    if (!raw.vector || raw.vector.length !== FEATURE_DIM) continue;
                    entries.set(raw.name, {
                        feature: Float32Array.from(raw.vector),
                        clip:
                            raw.clipVector && raw.clipVector.length === CLIP_DIM
                                ? Float32Array.from(raw.clipVector)
                                : null,
                        size: raw.size,
                        mtimeMs: raw.mtime,
                    });
                }
            }
            await this.cacheIo.close();
        } catch (err) {
            this.logError(`Training vector cache load failed for ${folderPath}: ${err.message}`);
            await this.cacheIo.close().catch(() => {});
        } finally {
            release();
        }
        return { entries, diskCount };
    }

    /**
     * Persist one training folder's vectors. Returns false when the shrink guard refused.
     * @param {number} diskCount entries last seen on disk FOR THIS FOLDER — the guard is
     *   per-cache, so a legitimately small like folder cannot be blocked by a large dislike one.
     */
    async _saveVectorCache(folderPath, entries, diskCount) {
        if (!folderPath || !entries || entries.size === 0) return false;

        // DATA-LOSS GUARD: never replace a substantially populated on-disk cache with a
        // drastically smaller in-memory one. Mirrors _saveFeatureCacheLocked; a real incident
        // overwrote a 23,559-entry cache with 32 entries.
        if (diskCount > 0 && entries.size < diskCount * 0.5) {
            this.logError(
                `Training-cache save SKIPPED (shrink guard) for ${folderPath}: ` +
                    `in-memory ${entries.size} entries vs ${diskCount} on disk.`
            );
            return false;
        }

        const release = await this.cacheIo.acquireLock();
        try {
            const version = this.getConfig?.().versions?.featureCacheVersion;
            const opened = await this.cacheIo.writeOpen(this._cachePath(folderPath), { version });
            if (!opened?.success) return false;

            let batch = [];
            for (const [name, value] of entries) {
                // Skip rather than poison: size 0 / mtime 0 never matches a real stat, so such
                // an entry would be rejected as stale forever.
                if (!value.size || !value.mtimeMs) continue;
                batch.push({
                    name,
                    vector: round6(value.feature),
                    clipVector: value.clip ? round6(value.clip) : null,
                    size: value.size,
                    mtime: value.mtimeMs,
                });
                if (batch.length >= CHUNK_SIZE) {
                    await this.cacheIo.writeChunk(batch);
                    batch = [];
                }
            }
            if (batch.length > 0) await this.cacheIo.writeChunk(batch);
            await this.cacheIo.writeClose();
            return true;
        } catch (err) {
            this.logError(`Training vector cache save failed for ${folderPath}: ${err.message}`);
            await this.cacheIo.writeClose().catch(() => {});
            return false;
        } finally {
            release();
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ml-training.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ml-training.js tests/ml-training.test.js
git commit -m "feat(ml): per-training-folder vector cache

Reuses the v4 feature-cache format, staleness rule and streaming IO for the
like/dislike folders, in maps owned by the module. Training vectors are never
merged into the source folder's featureCache/clipCache -- the source folder's
30s auto-save would otherwise persist like-folder entries into it and the
load-time prune would delete them again.

Each folder carries its own shrink-guard baseline, and an entry whose size or
mtime cannot be resolved is skipped rather than written as 0 (which no real
stat matches, so it would be rejected as stale forever)."
```

---

### Task 4: Model-cache IPC and LRU store

**Files:**
- Modify: `main.js` (new handlers beside the tournament-state ones, ~`:280`)
- Modify: `preload.js` (~`:25`, after the feature-cache writer group)
- Modify: `ml-training.js`
- Modify: `tests/ml-training.test.js`

**Interfaces:**
- Consumes: Task 3's `MlTrainingManager`.
- Produces:
  - IPC `read-ml-model-cache` → `{ success: true, store: Store | null }`, `write-ml-model-cache` → `{ success: boolean, error?: string }`.
  - `Store = { version: 1, entries: Array<{ fingerprint, modelState, stats, descriptorSummary, savedAt }> }`, newest first, max 5.
  - `preload`: `readMlModelCache()`, `writeMlModelCache(store)`.
  - `MlTrainingManager.MODEL_CACHE_LIMIT = 5`
  - `async _readCachedModel(fingerprint) => entry | null`
  - `async _writeCachedModel(fingerprint, modelState, stats, descriptorSummary) => void`
  - `async invalidateModelCache() => void`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ml-training.test.js`:

```js
describe('model cache', () => {
    const makeModelCache = (initial = null) => {
        let store = initial;
        return {
            read: vi.fn(async () => ({ success: true, store })),
            write: vi.fn(async (s) => {
                store = s;
                return { success: true };
            }),
            get current() {
                return store;
            },
        };
    };

    it('returns null on an empty cache', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        expect(await m._readCachedModel('abc')).toBeNull();
    });

    it('returns the entry whose fingerprint matches', async () => {
        const mc = makeModelCache({
            version: 1,
            entries: [{ fingerprint: 'abc', modelState: { weights: [1] }, stats: { isReady: true }, savedAt: 1 }],
        });
        const m = managerWith({ modelCache: mc });
        const hit = await m._readCachedModel('abc');
        expect(hit.modelState.weights).toEqual([1]);
    });

    it('returns null for a non-matching fingerprint', async () => {
        const mc = makeModelCache({
            version: 1,
            entries: [{ fingerprint: 'abc', modelState: { weights: [1] }, stats: {}, savedAt: 1 }],
        });
        const m = managerWith({ modelCache: mc });
        expect(await m._readCachedModel('zzz')).toBeNull();
    });

    it('ignores a store written by a future version', async () => {
        const mc = makeModelCache({ version: 99, entries: [{ fingerprint: 'abc', modelState: {}, stats: {} }] });
        const m = managerWith({ modelCache: mc });
        expect(await m._readCachedModel('abc')).toBeNull();
    });

    it('writes newest first and evicts past the limit', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        for (let i = 0; i < MlTrainingManager.MODEL_CACHE_LIMIT + 2; i++) {
            await m._writeCachedModel(`fp${i}`, { weights: [i] }, { isReady: true }, { likeFiles: i });
        }
        expect(mc.current.entries).toHaveLength(MlTrainingManager.MODEL_CACHE_LIMIT);
        expect(mc.current.entries[0].fingerprint).toBe(`fp${MlTrainingManager.MODEL_CACHE_LIMIT + 1}`);
        expect(mc.current.entries.some((e) => e.fingerprint === 'fp0')).toBe(false);
    });

    it('replaces an existing fingerprint rather than duplicating it', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        await m._writeCachedModel('same', { weights: [1] }, {}, {});
        await m._writeCachedModel('same', { weights: [2] }, {}, {});
        expect(mc.current.entries).toHaveLength(1);
        expect(mc.current.entries[0].modelState.weights).toEqual([2]);
    });

    it('persists the descriptor summary so a wrong hit is diagnosable', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        await m._writeCachedModel('fp', { weights: [1] }, {}, { likeFolder: '/likes', likeCount: 12 });
        expect(mc.current.entries[0].descriptorSummary).toEqual({ likeFolder: '/likes', likeCount: 12 });
    });

    it('a write failure is logged, not thrown', async () => {
        const logError = vi.fn();
        const mc = { read: vi.fn(async () => ({ success: true, store: null })), write: vi.fn(async () => ({ success: false, error: 'EACCES' })) };
        const m = managerWith({ modelCache: mc, logError });
        await expect(m._writeCachedModel('fp', {}, {}, {})).resolves.toBeUndefined();
        expect(logError).toHaveBeenCalled();
    });

    it('invalidateModelCache empties the store and the session fingerprint', async () => {
        const mc = makeModelCache({ version: 1, entries: [{ fingerprint: 'abc', modelState: {}, stats: {} }] });
        const m = managerWith({ modelCache: mc });
        m.sessionFingerprint = 'abc';
        await m.invalidateModelCache();
        expect(mc.current.entries).toEqual([]);
        expect(m.sessionFingerprint).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ml-training.test.js -t "model cache"`
Expected: FAIL — `m._readCachedModel is not a function`.

- [ ] **Step 3: Add the model-cache methods to `ml-training.js`**

Add to `MlTrainingManager` (below `_saveVectorCache`):

```js
    static MODEL_CACHE_VERSION = 1;
    static MODEL_CACHE_LIMIT = 5;

    async _readCachedModel(fingerprint) {
        try {
            const res = await this.modelCache.read();
            const store = res?.store;
            if (!store || store.version !== MlTrainingManager.MODEL_CACHE_VERSION) return null;
            return (store.entries || []).find((e) => e.fingerprint === fingerprint) || null;
        } catch (err) {
            this.logError(`ML model cache read failed: ${err.message}`);
            return null;
        }
    }

    async _writeCachedModel(fingerprint, modelState, stats, descriptorSummary) {
        try {
            const res = await this.modelCache.read();
            const existing =
                res?.store?.version === MlTrainingManager.MODEL_CACHE_VERSION ? res.store.entries || [] : [];
            const kept = existing.filter((e) => e.fingerprint !== fingerprint);
            const entries = [
                { fingerprint, modelState, stats, descriptorSummary, savedAt: Date.now() },
                ...kept,
            ].slice(0, MlTrainingManager.MODEL_CACHE_LIMIT);
            const write = await this.modelCache.write({
                version: MlTrainingManager.MODEL_CACHE_VERSION,
                entries,
            });
            if (!write?.success) {
                this.logError(`ML model cache write failed: ${write?.error || 'unknown error'}`);
            }
        } catch (err) {
            this.logError(`ML model cache write failed: ${err.message}`);
        }
    }

    /** Escape hatch behind the Settings "Rebuild model" control. */
    async invalidateModelCache() {
        this.sessionFingerprint = null;
        try {
            await this.modelCache.write({ version: MlTrainingManager.MODEL_CACHE_VERSION, entries: [] });
        } catch (err) {
            this.logError(`ML model cache clear failed: ${err.message}`);
        }
    }
```

- [ ] **Step 4: Add the IPC handlers to `main.js`**

Insert after the `deleteTournamentState` handler (~`main.js:298`):

```js
    // ---- ML model cache (app data, keyed by training-set fingerprint) ----
    // Lives in userData, NOT in a media folder: the model is a function of the like/dislike
    // folders and is reusable from every source folder, which is the whole point of the
    // fingerprint. See docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md.
    const mlModelCachePath = () => path.join(app.getPath('userData'), 'ml-model-cache.json');

    ipcMain.handle('read-ml-model-cache', async () => {
        try {
            const text = await fs.readFile(mlModelCachePath(), 'utf-8');
            return { success: true, store: JSON.parse(text) };
        } catch (err) {
            if (err.code === 'ENOENT') {
                return { success: true, store: null };
            }
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('write-ml-model-cache', async (_event, store) => {
        const target = mlModelCachePath();
        const tmpPath = target + '.tmp';
        try {
            await fs.writeFile(tmpPath, JSON.stringify(store), 'utf-8');
            await fs.rename(tmpPath, target); // atomic replace — no torn file on crash mid-write
            return { success: true };
        } catch (err) {
            await fs.unlink(tmpPath).catch(() => {}); // best-effort cleanup
            return { success: false, error: err.message };
        }
    });
```

- [ ] **Step 5: Expose them in `preload.js`**

After the `featureCacheWriteClose` line (~`preload.js:25`):

```js
    // ML model cache (app data, keyed by training-set fingerprint)
    readMlModelCache: () => ipcRenderer.invoke('read-ml-model-cache'),
    writeMlModelCache: (store) => ipcRenderer.invoke('write-ml-model-cache', store),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/ml-training.test.js`
Expected: PASS.

Run: `npm run lint && npm run format:check`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add main.js preload.js ml-training.js tests/ml-training.test.js
git commit -m "feat(ml): fingerprint-keyed model cache in app data

Stores the trained weights under a hash of the training set, in userData rather
than per source folder -- the model is a function of the globally-configured
like/dislike folders, so keying it on the folder being viewed is what forced a
full retrain in every new folder.

Writes go through .tmp + rename, mirroring writeTournamentState. LRU of 5; the
descriptor summary is persisted beside each entry so a wrong hit is diagnosable
after the fact rather than only reproducible."
```

---

### Task 5: `ensureTrainedModel()`

The resolution order, training-set assembly, progress reporting and the CLIP-coverage gate.

**Files:**
- Modify: `ml-training.js`
- Modify: `tests/ml-training.test.js`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `async ensureTrainedModel({ signal } = {}) => { source: 'session'|'model-cache'|'trained'|'skipped', stats: Object|null, fingerprint: string|null, descriptor: Object|null }`
  - `source: 'skipped'` when a training folder is unset or the set is empty.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ml-training.test.js`:

```js
describe('ensureTrainedModel', () => {
    const versions = { mlModelVersion: 3, featureCacheVersion: 4, featureVersion: 2, trainingConfigVersion: 1 };

    const scenario = (over = {}) => {
        const likeFiles = over.likeFiles || [
            { name: 'l1.jpg', path: '/likes/l1.jpg', size: 10, mtimeMs: 1 },
            { name: 'l2.jpg', path: '/likes/l2.jpg', size: 11, mtimeMs: 2 },
            { name: 'l3.jpg', path: '/likes/l3.jpg', size: 12, mtimeMs: 3 },
        ];
        const dislikeFiles = over.dislikeFiles || [
            { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
            { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
            { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
        ];
        const modelCacheStore = { value: over.store ?? null };
        const m = managerWith({
            loadFolder: vi.fn(async (p) => ({
                success: true,
                files: p === '/likes' ? likeFiles : dislikeFiles,
            })),
            computeFeatures: vi.fn(async () => new Float32Array(64).fill(0.5)),
            extractClipEmbedding: over.extractClipEmbedding || vi.fn(async () => new Float32Array(512).fill(0.25)),
            trainModel: vi.fn(async () => ({ stats: { isReady: true, positiveCount: 3, negativeCount: 3 }, modelState: { weights: [1] } })),
            loadModelState: vi.fn(async () => ({ stats: { isReady: true, positiveCount: 3, negativeCount: 3 } })),
            getConfig: vi.fn(() => ({
                customLikeFolder: '/likes',
                customDislikeFolder: '/dislikes',
                enableClipFeatures: over.enableClipFeatures ?? true,
                versions,
            })),
            getBulkRatedContext: vi.fn(() => ({
                bulkRated: over.bulkRated || new Map(),
                mediaFiles: over.mediaFiles || [],
                featureCache: new Map(),
                clipCache: new Map(),
            })),
            cacheIo: over.cacheIo || makeCacheIo(),
            modelCache: {
                read: vi.fn(async () => ({ success: true, store: modelCacheStore.value })),
                write: vi.fn(async (s) => {
                    modelCacheStore.value = s;
                    return { success: true };
                }),
            },
            ...(over.managerOverrides || {}),
        });
        return { m, modelCacheStore };
    };

    it('trains when nothing is cached', async () => {
        const { m } = scenario();
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(res.stats.isReady).toBe(true);
        expect(m.trainModel).toHaveBeenCalledTimes(1);
    });

    it('returns source "session" on a repeat call with an unchanged training set', async () => {
        const { m } = scenario();
        await m.ensureTrainedModel({});
        const second = await m.ensureTrainedModel({});
        expect(second.source).toBe('session');
        expect(m.trainModel).toHaveBeenCalledTimes(1);
    });

    it('retrains when the like folder changes', async () => {
        const { m } = scenario();
        await m.ensureTrainedModel({});
        m.getConfig.mockReturnValue({
            customLikeFolder: '/likes',
            customDislikeFolder: '/dislikes',
            enableClipFeatures: true,
            versions,
        });
        m.loadFolder.mockImplementation(async (p) => ({
            success: true,
            files:
                p === '/likes'
                    ? [
                          { name: 'l1.jpg', path: '/likes/l1.jpg', size: 10, mtimeMs: 1 },
                          { name: 'l2.jpg', path: '/likes/l2.jpg', size: 11, mtimeMs: 2 },
                          { name: 'l3.jpg', path: '/likes/l3.jpg', size: 12, mtimeMs: 3 },
                          { name: 'NEW.jpg', path: '/likes/NEW.jpg', size: 99, mtimeMs: 99 },
                      ]
                    : [
                          { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
                          { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
                          { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
                      ],
        }));
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(m.trainModel).toHaveBeenCalledTimes(2);
    });

    it('loads from the model cache in a fresh session instead of training', async () => {
        const { m: first, modelCacheStore } = scenario();
        await first.ensureTrainedModel({});

        const { m: second } = scenario({ store: modelCacheStore.value });
        const res = await second.ensureTrainedModel({});
        expect(res.source).toBe('model-cache');
        expect(second.trainModel).not.toHaveBeenCalled();
        expect(second.loadModelState).toHaveBeenCalledTimes(1);
    });

    it('skips when a training folder is unset', async () => {
        const { m } = scenario();
        m.getConfig.mockReturnValue({
            customLikeFolder: '',
            customDislikeFolder: '/dislikes',
            enableClipFeatures: true,
            versions,
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('skipped');
        expect(m.trainModel).not.toHaveBeenCalled();
    });

    it('does not send a training message when aborted mid-extraction', async () => {
        const controller = new AbortController();
        const { m } = scenario({
            extractClipEmbedding: vi.fn(async () => {
                controller.abort();
                return new Float32Array(512).fill(0.25);
            }),
        });
        const res = await m.ensureTrainedModel({ signal: controller.signal });
        expect(m.trainModel).not.toHaveBeenCalled();
        expect(res.source).toBe('skipped');
    });

    it('trains but does not cache when CLIP is on and coverage is incomplete', async () => {
        const { m, modelCacheStore } = scenario({ extractClipEmbedding: vi.fn(async () => null) });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(m.trainModel).toHaveBeenCalledTimes(1);
        expect(modelCacheStore.value?.entries || []).toHaveLength(0);
        expect(m.notify).toHaveBeenCalled();
    });

    it('caches normally when CLIP is off, since zero halves are then expected', async () => {
        const { m, modelCacheStore } = scenario({
            enableClipFeatures: false,
            extractClipEmbedding: vi.fn(async () => null),
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(modelCacheStore.value.entries).toHaveLength(1);
    });

    it('reports progress through the injected sink', async () => {
        const { m } = scenario();
        await m.ensureTrainedModel({});
        const phases = m.onProgress.mock.calls.map((c) => c[0].phase);
        expect(phases).toContain('Processing likes');
        expect(phases).toContain('Processing dislikes');
        expect(phases).toContain('Training model…');
    });

    it('includes bulk-rated files still present in the source folder', async () => {
        const { m } = scenario({
            bulkRated: new Map([['b1.jpg', 'good']]),
            mediaFiles: [{ name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 }],
        });
        await m.ensureTrainedModel({});
        const [liked] = m.trainModel.mock.calls[0];
        expect(liked).toHaveLength(4); // 3 likes + 1 bulk-rated good
    });

    it('ignores a bulk-rated name whose file has left the source folder', async () => {
        const { m } = scenario({ bulkRated: new Map([['gone.jpg', 'good']]), mediaFiles: [] });
        await m.ensureTrainedModel({});
        const [liked] = m.trainModel.mock.calls[0];
        expect(liked).toHaveLength(3);
    });

    it('passes a fingerprint-derived seed so the rebuild is reproducible', async () => {
        const { m } = scenario();
        const res = await m.ensureTrainedModel({});
        const [, , seed] = m.trainModel.mock.calls[0];
        expect(seed).toBe(seedFromFingerprint(res.fingerprint));
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ml-training.test.js -t "ensureTrainedModel"`
Expected: FAIL — `m.ensureTrainedModel is not a function`.

- [ ] **Step 3: Implement `ensureTrainedModel` and its helpers**

Add to `MlTrainingManager`:

```js
    /** Merge a 64-dim feature half and an optional 512-dim CLIP half into one 576-dim row. */
    _combine(feature, clip) {
        const merged = new Float32Array(TRAINING_VECTOR_DIM);
        merged.set(feature, 0);
        if (clip) merged.set(clip, FEATURE_DIM);
        return Array.from(merged);
    }

    /**
     * Load one training folder's cached vectors, extract whatever is missing or stale, persist
     * the result, and return the 576-dim rows. Only files absent from the cache cost CLIP
     * inference — which is the whole retrain-skip win.
     */
    async _collectFolderVectors(folderPath, files, phase, signal) {
        const { entries, diskCount } = await this._loadVectorCache(folderPath, files, signal);
        const rows = [];
        let clipMissing = 0;
        let extracted = 0;

        for (let i = 0; i < files.length; i++) {
            if (signal?.aborted) return { rows, clipMissing, aborted: true };
            const file = files[i];
            let hit = entries.get(file.name);

            // Re-extract when absent, or when the CLIP half is missing while CLIP is on —
            // the self-healing filter that keeps a degraded run from becoming permanent.
            const needsClip = this.getConfig().enableClipFeatures && hit && !hit.clip;
            if (!hit || needsClip) {
                try {
                    const feature = hit ? hit.feature : await this.computeFeatures(file.path, file);
                    const clip = await this.extractClipEmbedding(file.path);
                    hit = { feature, clip: clip || null, size: file.size, mtimeMs: file.mtimeMs };
                    entries.set(file.name, hit);
                    extracted++;
                } catch (err) {
                    console.warn(`Skipping ${file.name}:`, err.message);
                    continue;
                }
            }

            if (!hit.clip) clipMissing++;
            rows.push(this._combine(hit.feature, hit.clip));
            this.onProgress({ phase, current: i + 1, total: files.length });
        }

        if (extracted > 0 && !signal?.aborted) {
            await this._saveVectorCache(folderPath, entries, diskCount);
        }
        return { rows, clipMissing, aborted: false };
    }

    /**
     * Corrective bulk ratings stay in the SOURCE folder and are never in the like/dislike
     * folders, so a from-scratch rebuild cannot recover them from disk. Their vectors come from
     * the source folder's own caches — reading those is correct; writing to them is not.
     */
    async _collectBulkRatedVectors(signal) {
        const { bulkRated, mediaFiles, featureCache, clipCache } = this.getBulkRatedContext();
        const liked = [];
        const disliked = [];
        const present = [];
        const total = bulkRated?.size || 0;
        let processed = 0;

        for (const [name, bucket] of bulkRated || []) {
            if (signal?.aborted) break;
            this.onProgress({ phase: 'Processing corrective ratings', current: ++processed, total });
            const file = (mediaFiles || []).find((f) => f.name === name);
            if (!file) continue;

            let feature = featureCache?.get(file.path);
            let clip = clipCache?.get(file.path) || null;
            if (!feature) {
                try {
                    feature = await this.computeFeatures(file.path, file);
                    clip = await this.extractClipEmbedding(file.path);
                } catch (err) {
                    console.warn(`Skipping bulk-rated ${name}:`, err.message);
                    continue;
                }
            }
            (bucket === 'good' ? liked : disliked).push(this._combine(feature, clip));
            present.push({ name, bucket, size: file.size, mtimeMs: file.mtimeMs });
        }
        return { liked, disliked, present };
    }

    /**
     * Ensure the ML worker holds a model trained on the CURRENT training set, doing the least
     * work that guarantees it. Resolution order: live session → persisted model cache → rebuild.
     */
    async ensureTrainedModel({ signal } = {}) {
        const miss = { source: 'skipped', stats: null, fingerprint: null, descriptor: null };
        const config = this.getConfig();
        if (!config.customLikeFolder || !config.customDislikeFolder) return miss;
        if (signal?.aborted) return miss;

        this.onProgress({ phase: 'Checking training set…' });
        const [likedResult, dislikedResult] = await Promise.all([
            this.loadFolder(config.customLikeFolder),
            this.loadFolder(config.customDislikeFolder),
        ]);
        if (signal?.aborted) return miss;

        const likeFiles = likedResult?.success ? likedResult.files : [];
        const dislikeFiles = dislikedResult?.success ? dislikedResult.files : [];
        if (likeFiles.length === 0 && dislikeFiles.length === 0) return miss;

        // The bulk-rated half must be resolved BEFORE the fingerprint: it is a descriptor input,
        // and the vectors are cheap (they come from the source folder's warm caches).
        const bulk = await this._collectBulkRatedVectors(signal);
        if (signal?.aborted) return miss;

        const descriptor = buildDescriptor({
            likeFolder: config.customLikeFolder,
            likeFiles,
            dislikeFolder: config.customDislikeFolder,
            dislikeFiles,
            bulkRated: bulk.present,
            enableClipFeatures: config.enableClipFeatures,
            versions: config.versions,
        });
        const fingerprint = fingerprintDescriptor(descriptor);

        if (this.sessionFingerprint === fingerprint) {
            return { source: 'session', stats: this.sessionStats || null, fingerprint, descriptor };
        }

        const cached = await this._readCachedModel(fingerprint);
        if (cached && !signal?.aborted) {
            this.onProgress({ phase: 'Loading cached model…' });
            const { stats } = await this.loadModelState(cached.modelState);
            this.sessionFingerprint = fingerprint;
            this.sessionStats = stats;
            return { source: 'model-cache', stats, fingerprint, descriptor };
        }
        if (signal?.aborted) return miss;

        const likes = await this._collectFolderVectors(config.customLikeFolder, likeFiles, 'Processing likes', signal);
        if (likes.aborted || signal?.aborted) return miss;
        const dislikes = await this._collectFolderVectors(
            config.customDislikeFolder,
            dislikeFiles,
            'Processing dislikes',
            signal
        );
        if (dislikes.aborted || signal?.aborted) return miss;

        const likedFeatures = [...likes.rows, ...bulk.liked];
        const dislikedFeatures = [...dislikes.rows, ...bulk.disliked];
        if (likedFeatures.length === 0 && dislikedFeatures.length === 0) return miss;

        this.onProgress({ phase: 'Training model…' });
        const seed = seedFromFingerprint(fingerprint);
        const { stats, modelState } = await this.trainModel(likedFeatures, dislikedFeatures, seed);
        this.sessionFingerprint = fingerprint;
        this.sessionStats = stats;

        // A model trained with a zero CLIP half while CLIP is ON is a degraded model wearing a
        // CLIP-enabled fingerprint. Degraded operation stays supported; caching it does not,
        // or the next session serves it as if it were the real thing.
        const clipMissing = likes.clipMissing + dislikes.clipMissing;
        if (config.enableClipFeatures && clipMissing > 0) {
            this.notify(
                `Model trained without CLIP for ${clipMissing} file(s) — not cached; it will rebuild next sort.`,
                'warning'
            );
        } else {
            await this._writeCachedModel(fingerprint, modelState, stats, {
                likeFolder: config.customLikeFolder,
                likeCount: likeFiles.length,
                dislikeFolder: config.customDislikeFolder,
                dislikeCount: dislikeFiles.length,
                bulkRatedCount: bulk.present.length,
                enableClipFeatures: config.enableClipFeatures,
                versions: config.versions,
            });
        }

        return { source: 'trained', stats, fingerprint, descriptor };
    }
```

Add `sessionStats` to the constructor beside `sessionFingerprint`:

```js
        this.sessionFingerprint = null;
        this.sessionStats = null;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ml-training.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ml-training.js tests/ml-training.test.js
git commit -m "feat(ml): ensureTrainedModel with session/cache/rebuild resolution

Resolves in the cheapest order that still guarantees the worker holds a model
trained on the CURRENT training set: live session fingerprint, then the
persisted model cache, then a rebuild from cached vectors. Only files absent
from a vector cache cost CLIP inference.

A model trained with a missing CLIP half while CLIP is enabled is trained but
never cached -- otherwise the next session would serve a degraded model under a
CLIP-enabled fingerprint. The seed is derived from the fingerprint, so a
rebuild reproduces the cached weights exactly."
```

---

### Task 6: Wire the manager into the renderer

Replaces the `!mlStats?.isReady` gate and deletes the three functions the module now owns.

**Files:**
- Modify: `media-viewer.js` — imports (`:1-2`), constructor (~`:136`), `initComplete` handler (~`:6784`), `handleSortByPrediction` (~`:8082-8135`); delete `trainFromHistoricalRatings` (`:7651`), `trainFromHistoricalRatingsAndWait` (`:7769`), `collectBulkRatedTrainingExamples` (`:7620`)
- Modify: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `MlTrainingManager`, `ensureTrainedModel` from Task 5.
- Produces: `this.mlTraining` on `MediaViewer`; `this._mlWorkerVersions = { mlModelVersion, featureDim, trainingConfigVersion }`; `this._featureExtractorVersion`.

- [ ] **Step 1: Write the failing test**

Append to `tests/media-viewer-utils.test.js` (the file already provides `extractAsyncMethod`):

```js
describe('handleSortByPrediction delegates training to MlTrainingManager (G1)', () => {
    it('calls ensureTrainedModel instead of the removed retrain gate', () => {
        const src = readFileSync(new URL('../media-viewer.js', import.meta.url), 'utf-8');
        expect(src).toContain('this.mlTraining.ensureTrainedModel(');
        // The three functions the module now owns must be gone from the renderer.
        expect(src).not.toContain('async trainFromHistoricalRatings(');
        expect(src).not.toContain('async trainFromHistoricalRatingsAndWait(');
        expect(src).not.toContain('async collectBulkRatedTrainingExamples(');
    });

    it('captures the worker-reported versions in initComplete', () => {
        const src = readFileSync(new URL('../media-viewer.js', import.meta.url), 'utf-8');
        expect(src).toContain('trainingConfigVersion');
    });
});
```

> `readFileSync` and `URL` are already imported at the top of this test file for the
> `extractMethod` helpers; if not, add `import { readFileSync } from 'fs';`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "delegates training"`
Expected: FAIL — `this.mlTraining.ensureTrainedModel(` not found.

- [ ] **Step 3: Import and construct the manager**

`media-viewer.js:1-2`:

```js
import { FullscreenManager } from './fullscreen.js';
import { TournamentManager } from './tournament.js';
import { MlTrainingManager } from './ml-training.js';
```

In the constructor, after `this.mlStats = null;` (`:136`):

```js
        // Versions reported by the workers that own them — never re-declared here, so they
        // cannot drift from the code they describe. Populated by initComplete and by the
        // feature pool's getVersion probe.
        this._mlWorkerVersions = { mlModelVersion: 0, featureDim: 0, trainingConfigVersion: 0 };
        this._featureExtractorVersion = 0;

        this.mlTraining = new MlTrainingManager({
            loadFolder: (p) => window.electronAPI.loadFolder(p),
            computeFeatures: (p, info) => this.computeFeatures(p, info),
            extractClipEmbedding: (p) => this.extractClipEmbedding(p),
            trainModel: (liked, disliked, seed) => this._runWorkerTraining(liked, disliked, seed),
            loadModelState: (modelState) => this._runWorkerInit(modelState),
            getConfig: () => ({
                customLikeFolder: this.customLikeFolder,
                customDislikeFolder: this.customDislikeFolder,
                enableClipFeatures: this.enableClipFeatures,
                versions: {
                    mlModelVersion: this._mlWorkerVersions.mlModelVersion,
                    featureCacheVersion: MediaViewer.FEATURE_CACHE_VERSION,
                    featureVersion: this._featureExtractorVersion,
                    trainingConfigVersion: this._mlWorkerVersions.trainingConfigVersion,
                },
            }),
            getBulkRatedContext: () => ({
                bulkRated: this.bulkRated,
                mediaFiles: this.mediaFiles,
                featureCache: this.featureCache,
                clipCache: this.clipCache,
            }),
            cacheIo: {
                acquireLock: () => this._acquireCacheIoLock(),
                open: (p) => window.electronAPI.featureCacheOpen(p),
                chunk: (o, l) => window.electronAPI.featureCacheChunk(o, l),
                close: () => window.electronAPI.featureCacheClose(),
                writeOpen: (p, h) => window.electronAPI.featureCacheWriteOpen(p, h),
                writeChunk: (e) => window.electronAPI.featureCacheWriteChunk(e),
                writeClose: () => window.electronAPI.featureCacheWriteClose(),
            },
            modelCache: {
                read: () => window.electronAPI.readMlModelCache(),
                write: (store) => window.electronAPI.writeMlModelCache(store),
            },
            onProgress: (p) => this.updateSortProgress(p),
            logError: (msg) => window.electronAPI?.logError?.(msg),
            notify: (msg, level) => this.showNotification(msg, level),
        });
```

- [ ] **Step 4: Add the two worker-promise helpers**

Add beside `requestPredictionScores` (~`media-viewer.js:7892`):

```js
    /**
     * Post a trainHistorical job and resolve on trainComplete. Replaces
     * trainFromHistoricalRatingsAndWait's callback+30s-timeout pairing; the manager owns the
     * decision to train at all, this owns only the round trip.
     */
    _runWorkerTraining(likedFeatures, dislikedFeatures, seed) {
        return new Promise((resolve) => {
            this._trainingCompleteCallback = (payload) => resolve(payload);
            this.mlWorker.postMessage({
                type: 'trainHistorical',
                data: { likedFeatures, dislikedFeatures, seed },
            });
            setTimeout(() => {
                if (this._trainingCompleteCallback) {
                    this._trainingCompleteCallback = null;
                    resolve({ stats: this.mlStats, modelState: this.mlModelState });
                }
            }, 30000);
        });
    }

    /** Post an init with a cached model and resolve on initComplete. */
    _runWorkerInit(modelState) {
        return new Promise((resolve) => {
            this._initCompleteCallback = (payload) => resolve(payload);
            this.mlWorker.postMessage({ type: 'init', data: { savedModel: modelState } });
            setTimeout(() => {
                if (this._initCompleteCallback) {
                    this._initCompleteCallback = null;
                    resolve({ stats: this.mlStats });
                }
            }, 10000);
        });
    }
```

- [ ] **Step 5: Settle the promises and capture versions in the worker handlers**

In `handleMlWorkerMessage`'s `initComplete` case (~`:6784`), after `this.mlStats = message.stats;`:

```js
                this._mlWorkerVersions = {
                    mlModelVersion: message.modelVersion || 0,
                    featureDim: message.featureDim || 0,
                    trainingConfigVersion: message.trainingConfigVersion || 0,
                };
                if (this._initCompleteCallback) {
                    const cb = this._initCompleteCallback;
                    this._initCompleteCallback = null;
                    cb({ stats: message.stats });
                }
```

In the `trainComplete` case (~`:6800`), replace the existing callback block:

```js
                if (this._trainingCompleteCallback) {
                    const cb = this._trainingCompleteCallback;
                    this._trainingCompleteCallback = null;
                    cb({ stats: message.stats, modelState: message.modelState });
                }
```

- [ ] **Step 6: Probe the feature-extractor version when the pool initializes**

In `initializeFeaturePool()`, immediately after the loop that does `this.featureWorkers.push(worker)` (~`:8509`):

```js
        // One-shot version probe: feature-worker.js answers `getVersion` with the
        // FEATURE_VERSION that feature-extractor.js actually compiled with, so the training
        // fingerprint never re-declares it. (The FEATURE_CACHE_VERSION comment claiming the two
        // constants must match is false — they are 4 and 2 — which is why both are fingerprinted.)
        const probe = this.featureWorkers[0];
        if (probe) {
            const onVersion = (e) => {
                if (e.data?.type === 'version') {
                    this._featureExtractorVersion = e.data.version || 0;
                    probe.removeEventListener('message', onVersion);
                }
            };
            probe.addEventListener('message', onVersion);
            probe.postMessage({ type: 'getVersion', data: {} });
        }
```

- [ ] **Step 7: Replace the retrain gate**

In `handleSortByPrediction`, replace the block at `:8123-8127`:

```js
            // Train from historical ratings if needed.
            if (!this.mlStats?.isReady) {
                this.updateSortProgress({ phase: 'Training model…' });
                await this.trainFromHistoricalRatingsAndWait(signal);
                this.updateSortPredictionButton();
            }
```

with:

```js
            // Ensure the worker holds a model trained on the CURRENT training set. The manager
            // decides whether that costs nothing (same session), a small read (model cache) or a
            // rebuild from cached vectors — the gate is the training set, not the source folder.
            const training = await this.mlTraining.ensureTrainedModel({ signal });
            if (training.stats) this.mlStats = training.stats;
            this.updateSortPredictionButton();
            if (training.source !== 'skipped' && this.mlStats?.isReady) {
                this.showMlLearningIndicator(this.mlStats, training.source);
            }
```

- [ ] **Step 8: Delete the three superseded methods**

Delete these whole method bodies from `media-viewer.js`:
- `collectBulkRatedTrainingExamples` (`:7620-7649`)
- `trainFromHistoricalRatings` (`:7651-7767`)
- `trainFromHistoricalRatingsAndWait` (`:7769-7793`)

Then grep for stragglers and remove or update every hit — including comments and tests, not just live callers:

```bash
grep -rn "trainFromHistoricalRatings\|collectBulkRatedTrainingExamples" --include="*.js" --include="*.md" .
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. Existing tests that asserted on `trainFromHistoricalRatings` (notably "waits for the CLIP model before training on historical ratings" in `tests/media-viewer-utils.test.js`) must be **relocated to the manager**, not deleted — the CLIP-await property still holds and is now covered by Task 5's `ensureTrainedModel` tests. If a relocated assertion has no equivalent, add it to `tests/ml-training.test.js` before removing it here.

- [ ] **Step 10: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js tests/ml-training.test.js
git commit -m "refactor(ml): route training through MlTrainingManager

handleSortByPrediction's !mlStats?.isReady gate becomes
mlTraining.ensureTrainedModel(), so the decision to retrain is made against the
training set rather than against whether this source folder happens to have a
.ml_model.json.

Removes trainFromHistoricalRatings, trainFromHistoricalRatingsAndWait and
collectBulkRatedTrainingExamples from the renderer (~150 lines). Version
constants are captured from the workers that own them (initComplete,
feature-worker getVersion) rather than re-declared."
```

---

### Task 7: Remove the online update and deferred-refresh protocol

**Files:**
- Modify: `media-viewer.js` — `updateMlModelWithFeatures` (`:8218`), `reverseMlModelUpdate` (`:8380`), `_beginDeferredCompareRefresh` (`:8248`), `_cancelDeferredCompareRefresh`, the arm sites (`:4001`, `:5534`, `:8357`), callers at `:1461`, `:3962`, `:4114`, `:4117`, `:4188`, `:4191`, `:4233`, `:5473`, `:5476`, `:8320`, the `updateComplete` / `reverseUpdateComplete` cases (`:6819-6893`), `showMlLearningIndicator` (`:1054`), constructor flags (`:140-141`)
- Modify: `tests/media-viewer-utils.test.js`, `tests/e2e/compare-mode.test.js`

**Interfaces:**
- Consumes: Task 6's wiring.
- Produces: `showMlLearningIndicator(stats, source)` — `source` is `'session' | 'model-cache' | 'trained'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/media-viewer-utils.test.js`:

```js
describe('online-update protocol removed (G1)', () => {
    const src = readFileSync(new URL('../media-viewer.js', import.meta.url), 'utf-8');

    it('no longer defines the online update or reverse-update helpers', () => {
        expect(src).not.toContain('updateMlModelWithFeatures(');
        expect(src).not.toContain('reverseMlModelUpdate(');
    });

    it('no longer defines the deferred compare-refresh protocol', () => {
        expect(src).not.toContain('_beginDeferredCompareRefresh');
        expect(src).not.toContain('_cancelDeferredCompareRefresh');
        expect(src).not.toContain('pendingCompareUpdates');
        expect(src).not.toContain('pendingCompareRefresh');
    });

    it('keeps mlFeatures on history entries — undo restores caches from it', () => {
        expect(src).toContain('restoreFeatureCachesFromHistory');
        expect(src).toContain('mlFeatures');
    });

    it('reports the training source in the learning indicator', () => {
        expect(src).toContain('showMlLearningIndicator(stats, source');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "online-update protocol removed"`
Expected: FAIL — all four assertions fail; the symbols are still present.

- [ ] **Step 3: Delete the update helpers and their call sites**

Delete the method bodies `updateMlModelWithFeatures` (`:8218-8241`) and `reverseMlModelUpdate` (`:8380`ff).

At each caller, delete the call and any now-dead surrounding logic:
- `:1461` — inside the single-mode rating path; drop the call, keep the `mlFeatures` capture that feeds `moveHistory`.
- `:5473`, `:5476` — inside `moveComparePair`; drop both calls.
- `:8320` — inside `applyBulkRating`; drop the call and the `postedUpdates` accumulator.
- `:3962`, `:4114`, `:4117`, `:4188`, `:4191`, `:4233` — undo paths in `handleCancel`; drop the calls only. **Leave `restoreFeatureCachesFromHistory` and every use of `entry.mlFeatures` untouched** — that is cache restoration, not model reversal.

- [ ] **Step 4: Delete the deferred-refresh protocol**

- Delete `_beginDeferredCompareRefresh` (`:8248`ff) and `_cancelDeferredCompareRefresh`.
- Delete the three arm sites: `:4001` (bulk-undo branch), `:5534` (`moveComparePair`), `:8357` (`applyBulkRating`). At each, the `else` fallthrough that already calls `await this.showMedia();` becomes the only path — inline it.
- Delete the two `_cancelDeferredCompareRefresh()` calls in `loadFolder` (`:2593`, `:2624`) **and their explanatory comments**, which describe a protocol that no longer exists.
- Delete the constructor fields `pendingCompareRefresh`, `pendingCompareUpdates` (`:140-141`) and `pendingCompareTimeout`.
- In `handleMlWorkerMessage`, delete the whole `updateComplete` and `reverseUpdateComplete` cases (`:6819-6893`). In `scoreComplete`, delete the branch that clears the deferred window; keep the branch that writes `predictionScores`.
- **Keep `mediaNavigationInProgress`.** It remains the navigation mutex. Only its deferred-window role goes.

- [ ] **Step 5: Repurpose the learning indicator**

Replace the signature and text line of `showMlLearningIndicator` (`:1054`, `:1074`):

```js
    showMlLearningIndicator(stats, source = 'trained') {
```

```js
        const label = source === 'trained' ? 'Trained on' : 'Model reused —';
        indicator.textContent = `🧠 ${label} ${stats.positiveCount}👍 ${stats.negativeCount}👎`;
```

Extend the auto-dismiss from 1500 ms to 2500 ms — it now fires once per sort rather than once per rating, so it has to be readable rather than glanceable.

- [ ] **Step 6: Sweep for stale references across the whole repo**

```bash
grep -rn "pendingCompareUpdates\|pendingCompareRefresh\|_beginDeferredCompareRefresh\|_cancelDeferredCompareRefresh\|updateMlModelWithFeatures\|reverseMlModelUpdate" \
  --include="*.js" --include="*.md" .
```

Every hit in `tests/`, `docs/` and comments must be updated or deleted. The unit-only pre-commit hook will not catch a stale E2E assertion — this sweep is the control.

In `tests/e2e/compare-mode.test.js`, the "REAL ML worker" test asserts `updateComplete×2 → scoreComplete:scores → showMedia`. That chain no longer exists. **Rewrite it** to assert the new contract: after a bulk rating, the next pair renders immediately with no deferred window (`mediaNavigationInProgress` is false within one animation frame).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

Run: `npm run test:e2e`
Expected: PASS. The pre-push hook runs this anyway; running it here means the failure is diagnosed against a small diff rather than a large one.

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js tests/
git commit -m "refactor(ml): remove online per-rating updates and the deferred compare refresh

The model is now rebuilt from cached vectors per AI sort, so a per-rating SGD
step no longer has a job: rated files move into the like/dislike folders and
bulk-rated files are re-injected, and the training-set fingerprint guarantees
the rebuild actually happens -- which it previously did not, since a folder
with a warm .ml_model.json never retrained at all.

Deletes the deferred compare-refresh protocol outright, closing five open
lifecycle defects by construction and removing the up-to-3s navigation pause
after each compare-mode rating. mlFeatures stays on history entries:
restoreFeatureCachesFromHistory splits it back into featureCache/clipCache on
undo. mediaNavigationInProgress keeps its navigation-mutex role."
```

---

### Task 8: Remove the worker update paths and the per-source-folder model file

**Files:**
- Modify: `ml-worker.js` (`update` `:289`, `reverseUpdate` `:301`, `reverseUpdateModel` `:129`, `updateModel` `:108`)
- Modify: `ml-model.js` (`reverseUpdate` `:127`)
- Modify: `media-viewer.js` (`loadMlModel` `:7028`, `saveMlModel` `:7052`, `deleteMlModelCache` `:7069`, call sites `:6792`, `:6803`, `:8086`)
- Modify: `tests/ml-model.test.js`, `tests/ml-worker.test.js`

**Interfaces:**
- Consumes: Task 7 (renderer no longer posts `update`/`reverseUpdate`).
- Produces: no new interfaces. `ml-model.js` keeps `update()` — `trainBatch` is built on it.

- [ ] **Step 1: Write the failing test**

Append to `tests/ml-worker.test.js`:

```js
describe('online-update messages removed (G1)', () => {
    it('answers an update message with an unknown-type error', () => {
        posted.length = 0;
        send({ type: 'update', data: { features: vec(576, 0.5), label: 1 } });
        const err = lastOfType('error');
        expect(err).toBeDefined();
        expect(err.message).toContain('Unknown message type');
    });

    it('answers a reverseUpdate message with an unknown-type error', () => {
        posted.length = 0;
        send({ type: 'reverseUpdate', data: { features: vec(576, 0.5), label: 1 } });
        expect(lastOfType('error')).toBeDefined();
    });

    it('still trains, so update() survives as the trainBatch primitive', () => {
        send({
            type: 'trainHistorical',
            data: { likedFeatures: [vec(576, 0.4)], dislikedFeatures: [vec(576, -0.4)], seed: 1 },
        });
        expect(lastOfType('trainComplete')).toBeDefined();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ml-worker.test.js -t "online-update messages removed"`
Expected: FAIL — the `update` case still returns `updateComplete`, so no `error` is posted.

- [ ] **Step 3: Delete the worker cases and functions**

In `ml-worker.js`, delete:
- the `case 'update':` block (`:289-299`)
- the `case 'reverseUpdate':` block (`:301-311`)
- `function updateModel` (`:108-127`)
- `function reverseUpdateModel` (`:129-146`)

The `default:` case already answers `Unknown message type: <type>`, which is what the new tests assert.

In `ml-model.js`, delete `reverseUpdate` (`:127-155`). **Keep `update`** — `trainBatch` calls it. Delete any test in `tests/ml-model.test.js` that exercises `reverseUpdate`, and confirm no other test depends on it:

```bash
grep -rn "reverseUpdate" --include="*.js" .
```

- [ ] **Step 4: Delete the per-source-folder model file plumbing**

In `media-viewer.js`, delete `loadMlModel` (`:7028-7050`), `saveMlModel` (`:7052-7067`) and `deleteMlModelCache` (`:7069-7077`), plus:
- `:6792` — the `deleteMlModelCache()` call in the `modelWasReset` branch of `initComplete`. Keep the branch's cache-clearing of `mlModelState`; only the file write goes.
- `:6803` — the `saveMlModel()` call in `trainComplete`.
- `:8086` — the `await this.loadMlModel();` in the lazy-init branch of `handleSortByPrediction`. The `init` message posted by `initializeMlWorker()` still runs; the manager loads a cached model when the fingerprint matches.

Existing `.ml_model.json` files are left on disk untouched — nothing reads or writes them now, and `deleteMlModelCache()` never deleted anything anyway (it wrote `''`; there is no `deleteFile` IPC).

- [ ] **Step 5: Sweep and run**

```bash
grep -rn "loadMlModel\|saveMlModel\|deleteMlModelCache\|ml_model.json" --include="*.js" --include="*.md" .
```

Update `CLAUDE.md`'s "deleteMlModelCache() writes ''" gotcha in Task 10 rather than here, but note every hit now.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ml-worker.js ml-model.js media-viewer.js tests/
git commit -m "refactor(ml): drop worker update paths and the per-source-folder model file

Nothing posts update/reverseUpdate since the online protocol was removed, so
the worker cases, updateModel, reverseUpdateModel and the model's reverseUpdate
go with them. OnlineLogisticRegression.update stays -- trainBatch is built on
it.

.ml_model.json plumbing is removed: the fingerprint-keyed cache in app data
replaces it, and keying the model on the folder being viewed was the original
defect. Existing files are left on disk; nothing reads them."
```

---

### Task 9: Settings escape hatch and E2E coverage

**Files:**
- Modify: `index.html` (~`:452`, the ML settings section)
- Modify: `media-viewer.js` (settings wiring, near the CLIP toggle at `:1972`)
- Create: `tests/e2e/ml-retrain-skip.test.js`
- Modify: `tests/e2e/fixtures/` as needed

**Interfaces:**
- Consumes: `MlTrainingManager.invalidateModelCache()` from Task 4.
- Produces: `#rebuildModelBtn` in the settings panel.

- [ ] **Step 1: Write the failing E2E**

Create `tests/e2e/ml-retrain-skip.test.js`:

```js
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, mockFolderDialog, seedLocalStorage, createTempFixtureDir } from './helpers/electron-app.js';

// The two properties that matter, stated as behaviour rather than as internals:
//   1. switching only the source folder must NOT re-enter the training phase
//   2. changing the like folder MUST re-enter it
// Property 2 is the one that proves retraining was not simply disabled — before this work it
// did not hold at all, because a folder with a warm .ml_model.json never retrained.

let electronApp;
let page;
let srcA;
let srcB;
let likes;
let dislikes;

test.beforeEach(async () => {
    srcA = await createTempFixtureDir(['a1.png', 'a2.png', 'a3.png']);
    srcB = await createTempFixtureDir(['b1.png', 'b2.png', 'b3.png']);
    likes = await createTempFixtureDir(['l1.png', 'l2.png', 'l3.png']);
    dislikes = await createTempFixtureDir(['d1.png', 'd2.png', 'd3.png']);
    ({ electronApp, page } = await launchApp());
    await seedLocalStorage(page, {
        customLikeFolder: likes.path,
        customDislikeFolder: dislikes.path,
        mlPredictionEnabled: 'true',
        enableClipFeatures: 'false', // keeps the run fast and deterministic; 64-dim path
    });
});

test.afterEach(async () => {
    if (electronApp) await closeApp(electronApp);
    for (const dir of [srcA, srcB, likes, dislikes]) {
        if (dir) await dir.cleanup();
    }
});

/** Count how many times ensureTrainedModel actually rebuilt, by tapping the manager. */
async function installTrainingProbe(page) {
    await page.evaluate(() => {
        window.__trainSources = [];
        const mgr = window.mediaViewer.mlTraining;
        const original = mgr.ensureTrainedModel.bind(mgr);
        mgr.ensureTrainedModel = async (opts) => {
            const res = await original(opts);
            window.__trainSources.push(res.source);
            return res;
        };
    });
}

test('a source-folder switch does not re-enter the training phase', async () => {
    await mockFolderDialog(electronApp, srcA.path);
    await page.evaluate((p) => window.mediaViewer.loadFolder(p), srcA.path);
    await installTrainingProbe(page);

    await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
    await page.waitForFunction(() => window.__trainSources.length === 1);
    expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

    await page.evaluate((p) => window.mediaViewer.loadFolder(p), srcB.path);
    await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
    await page.waitForFunction(() => window.__trainSources.length === 2);

    // The training set did not change, so no rebuild — this is the reported bug.
    expect(await page.evaluate(() => window.__trainSources[1])).toBe('session');
});

test('a changed like folder does re-enter the training phase', async () => {
    await mockFolderDialog(electronApp, srcA.path);
    await page.evaluate((p) => window.mediaViewer.loadFolder(p), srcA.path);
    await installTrainingProbe(page);

    await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
    await page.waitForFunction(() => window.__trainSources.length === 1);

    await likes.addFile('l4.png');

    await page.evaluate(() => window.mediaViewer.handleSortByPrediction()); // toggle off
    await page.evaluate(() => window.mediaViewer.handleSortByPrediction()); // sort again
    await page.waitForFunction(() => window.__trainSources.length >= 2);

    const sources = await page.evaluate(() => window.__trainSources);
    expect(sources[sources.length - 1]).toBe('trained');
});
```

> `createTempFixtureDir` currently returns a path and a cleanup. Extend the helper in
> `tests/e2e/helpers/electron-app.js` with an `addFile(name)` method that copies
> `tests/e2e/fixtures/1x1.png` into the directory under the given name — the second test needs
> to mutate a training folder mid-run. Keep the existing return shape backward-compatible.

- [ ] **Step 2: Run the E2E to verify it fails**

Run: `npx playwright test tests/e2e/ml-retrain-skip.test.js`
Expected: FAIL — `window.mediaViewer.mlTraining` exists after Task 6, but `addFile` does not, and before the helper is added the second test errors with `likes.addFile is not a function`. Add the helper, re-run, and confirm both tests then exercise real behaviour.

- [ ] **Step 3: Add the `addFile` helper**

In `tests/e2e/helpers/electron-app.js`, inside `createTempFixtureDir`'s return object:

```js
        addFile: async (name) => {
            const src = path.join(__dirname, '..', 'fixtures', '1x1.png');
            await fs.copyFile(src, path.join(dir, name));
        },
```

- [ ] **Step 4: Add the Settings "Rebuild model" control**

In `index.html`, inside the ML settings section after the `clipFeaturesToggle` row (~`:452`):

```html
                        <div class="setting-row">
                            <label for="rebuildModelBtn">Rebuild prediction model</label>
                            <button type="button" id="rebuildModelBtn" class="control-btn">
                                <span class="btn-label">Rebuild model</span>
                            </button>
                        </div>
```

In `media-viewer.js`, beside the CLIP toggle wiring (~`:1972`):

```js
        // Escape hatch for the fingerprint cache. If a training input is ever missed by the
        // descriptor, this is the only way a user can force a rebuild short of touching a
        // training folder — so it exists on purpose, not as a convenience.
        const rebuildModelBtn = document.getElementById('rebuildModelBtn');
        if (rebuildModelBtn) {
            rebuildModelBtn.addEventListener('click', async () => {
                await this.mlTraining.invalidateModelCache();
                this.mlStats = null;
                this.mlModelState = null;
                if (this.mlWorker) this.mlWorker.postMessage({ type: 'reset' });
                this.updateSortPredictionButton();
                this.showNotification('Prediction model cleared — it will rebuild on the next AI sort.', 'info');
            });
        }
```

- [ ] **Step 5: Run everything**

Run: `npx playwright test tests/e2e/ml-retrain-skip.test.js`
Expected: PASS, both tests.

Run: `npm test && npm run test:e2e && npm run lint && npm run format:check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add index.html media-viewer.js tests/e2e/
git commit -m "test(ml): E2E for the retrain skip, plus a Settings rebuild escape hatch

Two properties: a source-folder switch must not re-enter training, and a
changed like folder must. The second is the one that proves retraining was not
simply disabled -- before this work it never happened at all once a folder had
a warm .ml_model.json.

The Rebuild model control is the escape hatch for a descriptor that ever misses
an input; without it a user would have to touch a training folder to force a
rebuild."
```

---

### Task 10: Documentation and closeout rulings

**Files:**
- Modify: `CLAUDE.md` (§ Architecture, § State Management, § Cache Management, § Async Patterns, the `deleteMlModelCache` gotcha, the L157 `pendingCompareUpdates` invariant)
- Modify: `PROJECT.md` if it asserts the module list
- Modify: `docs/planning/BACKLOG.md`, `docs/planning/TODO.md`, `docs/planning/WEEKLY.md`, `docs/planning/DONE.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `CLAUDE.md`**

- **§ Architecture** file tree: add
  `├── ml-training.js       # MlTrainingManager ES module: training-set fingerprint, per-training-folder vector caches, fingerprint-keyed model cache`
- **§ Code Conventions → Patterns**: add `MlTrainingManager` to the list of extracted subsystems beside `FullscreenManager` and `TournamentManager`.
- **§ Detected Patterns → State Management**: rewrite the `resetMlModel()` bullet. It currently describes the online-update protocol. State instead that the model is keyed on a training-set fingerprint, that `resetMlModel()` is called only by the like/dislike folder controls and the CLIP toggle, and that `loadFolder()` deliberately does not touch model state.
- **§ Detected Patterns → Async Patterns**: delete the "ML compare refresh" paragraph entirely, including the `pendingCompareRefresh` / `pendingCompareUpdates` / `_cancelDeferredCompareRefresh` invariant at L157. The protocol no longer exists.
- **§ Detected Patterns → Cache Management**: add the training-vector caches and the model cache; state the isolation rule (training vectors never enter `featureCache`/`clipCache`/`featureMetadata`).
- **§ Git Insights → Active gotchas**: delete the `deleteMlModelCache() writes ''` bullet (the function is gone). Add a bullet recording that `FEATURE_CACHE_VERSION` (4) and `FEATURE_VERSION` (2) do **not** match despite the comment claiming they must, which is why the training fingerprint includes both.

- [ ] **Step 2: Check `PROJECT.md`**

```bash
grep -n "fullscreen.js\|tournament.js\|module" PROJECT.md
```

If it lists the extracted modules, add `ml-training.js`. If it does not, change nothing.

- [ ] **Step 3: Flip the BACKLOG and TODO entries in the same commit as the closeout**

Check off, each with its outcome recorded inline:
- TODO 🟠 "Don't re-train likes/dislikes model when only the source folder changed" — **done**, with the corrected root cause noted (the recorded `resetMlModel()` mechanism was wrong).
- 🔵 [2026-08-28] "Skip like/dislike folder re-processing via change detection (re-report)" — done.
- 🔵 [2026-08-28] "Skip re-processing the likes folder when only the dislikes folder changed" — done; per-folder granularity falls out of per-file cache hits.
- 🔵 [2026-08-28] "Reuse feature_cache.json vectors for historical training" — done.
- 🔵 [2026-08-28] "Discuss: drop online per-rating model updates…" — **decided and implemented**: dropped.
- The five deferred-refresh 🟤 entries listed in spec § 6.3 — **reaped**, with this merge SHA as evidence.
- 🟤 "`mediaNavigationInProgress` needs a per-window token" — **moot**; record why.
- 🟤 "Late `scoreComplete` writes old scores onto a new folder" — **re-scoped**, stays open.

Annotate but do **not** close:
- 🔵 [2026-08-28] "Use tournament tier outcomes as ordinal training labels" — deferred, with the spec's reasoning.
- 🔵 [2026-08-28] "Add toggleable file-size weighting to the AI sort" — confirmed outside the model.

File as new 🟤 entries:
- The false `FEATURE_CACHE_VERSION` / `FEATURE_VERSION` "must match" comment.
- Any `.ml_model.json` cleanup, if wanted later (currently orphaned by design).

- [ ] **Step 4: Update WEEKLY.md and DONE.md**

Set the G1 Summary-Table Status to `✅ <merge-SHA>` (this project merges locally with no PR by default — never a bare `✅`), tick the G1 Daily-Schedule entries, and add a DONE.md entry linking the spec and the archived plan.

- [ ] **Step 5: Archive the plan**

```bash
git mv docs/planning/plans/2026-09-10_ml-training-pipeline.md docs/archive/plans/
```

Then add it to `docs/README.md` — the pre-commit `check-docs-index.js` guard requires every file under `docs/archive/plans/` to be linked, and will fail the commit otherwise.

- [ ] **Step 6: Verify and commit**

Run: `node scripts/check-docs-index.js && npm test`
Expected: both pass.

```bash
git add CLAUDE.md PROJECT.md docs/
git commit -m "docs(g1): closeout — CLAUDE.md propagation, BACKLOG rulings, archive

Propagates the late corrections into the live docs rather than leaving them in
the spec: the resetMlModel() bullet described a mechanism that was never true,
the deferred-compare-refresh invariant at L157 governs a protocol that no
longer exists, and the deleteMlModelCache gotcha describes a deleted function.

Records the online-update ruling on each affected BACKLOG entry: five reaped,
one moot, one re-scoped, two annotated-not-closed."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: § 2 D1 → Tasks 7–8; D2 → Task 3; D3 → Task 4; D4 → Task 5 (`bulk.present` is a descriptor input, no deltas layer); D5 → Task 2; D6 → Task 7 Step 5; D7 → Task 1. § 3 → Tasks 2 and 6. § 4 → Task 3 (isolation, shrink guard, poisoning, lock). § 5 → Tasks 2 and 4; § 5.3's four controls → Task 2 Step 1 (structural + tested), Task 4 Step 3 (`descriptorSummary`), Task 9 Step 4 (escape hatch); § 5.4 → Task 1. § 6 → Tasks 6–8, including § 6.1's four must-not-delete items, pinned by Task 7 Step 1. § 7.1 → Task 5 (`clipMissing` gate, `clip: null` never zeros); § 7.2 → Tasks 3 and 5. § 8 → Tasks 7 and 9. § 9 → Tasks 1–9. § 10 and § 11 → Task 10.

**Two gaps found and closed while reviewing.** The version-constant sourcing had no home — closed by Task 6 Steps 3–6 and reflected back into the spec's § 5.1. And the E2E's second property needed a way to mutate a training folder mid-run, which no helper offered — closed by Task 9 Step 3.

**Type consistency.** `MlTrainingManager` option names are identical in Task 3's `managerWith` harness and Task 6's real construction. `CacheEntry` is `{ feature, clip, size, mtimeMs }` throughout, distinct from the on-disk `{ vector, clipVector, size, mtime }` — the mapping happens only in `_loadVectorCache` and `_saveVectorCache`. `ensureTrainedModel`'s four `source` values are the same set in Task 5's tests, Task 6's caller, Task 7's indicator and Task 9's E2E.

**Known ordering dependency.** Tasks 7 and 8 are split so the renderer stops posting `update`/`reverseUpdate` *before* the worker stops answering them. Running 8 before 7 leaves a window where ratings post messages that return `Unknown message type` errors. Do not reorder.
