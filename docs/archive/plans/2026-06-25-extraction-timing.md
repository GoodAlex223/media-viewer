# Feature-Extraction Timing (Lazy / On-Demand) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop background feature extraction from running on every folder open; produce CLIP/feature vectors only when an AI-dependent feature is actually used.

**Architecture:** Pure lazy/on-demand. Remove the two eager `kickoffBackgroundExtractionIfEnabled()` call sites (folder-open in `loadFolder`, and the CLIP enable-toggle in `setupEventListeners`). Add a conditional on-demand trigger to the CLIP semantic-sort branch of `handleSortBySimilarity`, gated by a new pure predicate `clipVectorsNeedExtraction()` so a repeat sort does not reload the ~40s feature cache. The ML "Sort by Prediction" path is already lazy and is left untouched; hash-based similarity sort needs no vectors.

**Tech Stack:** Vanilla JS (no bundler) ES-module renderer `media-viewer.js`; Vitest unit tests via the source-extraction harness in `tests/media-viewer-utils.test.js`.

**Status:** Complete — all 4 tasks implemented on branch `feature/extraction-timing` (commits `2c57398`, `8ead5c6`, `f19431c`, `cb976ba`); every per-task review Approved; final whole-branch review (opus) "Ready to merge: Yes"; 381 unit tests green. ⏳ **Manual 24k-folder smoke + merge PENDING** (the real acceptance gate — synthetic fixtures can't represent 24k; user parallel-work hand-off).

## Global Constraints

- **Single production file:** all production edits are in `media-viewer.js`. No new files, no new dependencies, no HTML/CSS changes (pure lazy needs no settings UI).
- **Reuse `kickoffBackgroundExtractionIfEnabled()` unchanged** — do not edit its body (8021–8051); its 11 existing tests must stay green. Only its callers change.
- **Do not touch** `handleSortByPrediction` (7274, already lazy) or the hash-sort branch of `handleSortBySimilarity`.
- **Prettier:** tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always. **ESLint:** eqeqeq, curly, prefer-const, no-var. Unused vars prefixed `_`.
- **Pre-commit hook** runs `node scripts/check-secrets.js` → lint-staged (ESLint+Prettier) → `npx vitest run` (unit tests must pass). Every commit below must pass it.
- Spec: `docs/superpowers/specs/2026-06-25-extraction-timing-design.md` (decisions D1–D4).

---

### Task 1: Add `clipVectorsNeedExtraction()` predicate (the lazy gate)

**Files:**
- Modify: `media-viewer.js` — insert one method after `getCombinedFeatures()` (after line 7084, before `async loadBulkRatedFile()` at 7086).
- Test: `tests/media-viewer-utils.test.js` — new describe block.

**Interfaces:**
- Produces: `clipVectorsNeedExtraction(): boolean` — instance method on `MediaViewer`. Reads `this.enableClipFeatures` (boolean), `this.mediaFiles` (array of `{path}`), `this.clipCache` (Map keyed by `file.path`). Returns `true` iff CLIP is enabled AND at least one current file has no in-memory clip vector. Consumed by Task 2.

- [x] **Step 1: Write the failing test**

In `tests/media-viewer-utils.test.js`, append a new describe block at the end of the file (after the last existing block):

```js
describe('clipVectorsNeedExtraction', () => {
    const clipVectorsNeedExtraction = extractMethod('clipVectorsNeedExtraction');

    it('returns false when CLIP is disabled (even with uncached files)', () => {
        const ctx = {
            enableClipFeatures: false,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map(),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(false);
    });

    it('returns true when CLIP enabled and clipCache is empty', () => {
        const ctx = {
            enableClipFeatures: true,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map(),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(true);
    });

    it('returns true when at least one current file lacks a clip vector', () => {
        const ctx = {
            enableClipFeatures: true,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map([['a', new Float32Array(512)]]),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(true);
    });

    it('returns false when every current file already has a clip vector in memory', () => {
        const ctx = {
            enableClipFeatures: true,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map([
                ['a', new Float32Array(512)],
                ['b', new Float32Array(512)],
            ]),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(false);
    });

    it('returns false for an empty folder (nothing to extract)', () => {
        const ctx = { enableClipFeatures: true, mediaFiles: [], clipCache: new Map() };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(false);
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: FAIL — the file fails to collect with `Error: Could not find method: clipVectorsNeedExtraction` (the `extractMethod` call at the top of the new describe throws because the method does not exist yet).

- [x] **Step 3: Add the method to `media-viewer.js`**

Insert immediately after the end of `getCombinedFeatures()` (the `}` on line 7084), before `async loadBulkRatedFile()`:

```js
    // True when CLIP is enabled and at least one current file lacks an in-memory CLIP vector.
    // Gates the lazy on-demand extraction trigger in handleSortBySimilarity's CLIP branch so a
    // repeat CLIP sort (vectors already in memory) does not needlessly reload the ~40s feature
    // cache. See docs/superpowers/specs/2026-06-25-extraction-timing-design.md (D3).
    clipVectorsNeedExtraction() {
        if (!this.enableClipFeatures) return false;
        return this.mediaFiles.some((f) => !this.clipCache.has(f.path));
    }
```

The exact anchor (replace the first, add the method between):

```js
        return Array.from(combined);
    }

    async loadBulkRatedFile() {
```
becomes
```js
        return Array.from(combined);
    }

    clipVectorsNeedExtraction() {
        if (!this.enableClipFeatures) return false;
        return this.mediaFiles.some((f) => !this.clipCache.has(f.path));
    }

    async loadBulkRatedFile() {
```
(include the doc comment shown above; omitted here for brevity of the anchor)

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS — all 5 new cases pass; existing 127 cases in the file still pass.

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(extraction): add clipVectorsNeedExtraction lazy gate (Group P3)"
```

---

### Task 2: Trigger extraction on-demand in the CLIP sort path

**Files:**
- Modify: `media-viewer.js` — `async handleSortBySimilarity(forceResort = false)` (5081), CLIP branch at 5204–5219.

**Interfaces:**
- Consumes: `clipVectorsNeedExtraction()` (Task 1); `kickoffBackgroundExtractionIfEnabled()` (existing, 8021 — async, awaits `startBackgroundFeatureExtraction()` to completion).
- Produces: no new symbols. After this task, a full CLIP sort self-extracts vectors when missing, so it no longer depends on the folder-open kickoff (removed in Task 3).

Note: this branch is large and DOM/Electron-coupled, so it is verified by manual smoke (see Verification), not a unit test — the decision logic it calls (`clipVectorsNeedExtraction`) is already unit-tested in Task 1.

- [x] **Step 1: Add the on-demand trigger**

In the CLIP branch of `handleSortBySimilarity`, insert the trigger between the `enableClipFeatures` guard and the vector-collection loop. Replace:

```js
                    if (!this.enableClipFeatures) {
                        throw new Error('CLIP features are disabled. Enable in Settings (F1) to use semantic sorting.');
                    }

                    // Collect CLIP vectors from clipCache (Float32Array → plain Array for postMessage serialization)
                    const clipVectors = {};
```

with:

```js
                    if (!this.enableClipFeatures) {
                        throw new Error('CLIP features are disabled. Enable in Settings (F1) to use semantic sorting.');
                    }

                    // Lazy extraction (Group P3): vectors are no longer pre-warmed on folder open.
                    // If any current file lacks an in-memory CLIP vector, extract now and wait —
                    // kickoff loads the cache + model and runs extraction to completion (cancelable
                    // progress card). Gated so a repeat CLIP sort (vectors already cached) skips the
                    // ~40s feature-cache reload.
                    if (this.clipVectorsNeedExtraction()) {
                        await this.kickoffBackgroundExtractionIfEnabled();
                    }

                    // Collect CLIP vectors from clipCache (Float32Array → plain Array for postMessage serialization)
                    const clipVectors = {};
```

- [x] **Step 2: Verify lint + full unit suite stay green**

Run: `npm run lint && npx vitest run`
Expected: lint 0 errors; all unit tests pass (no test count change — this edit is covered by manual smoke + Task 1's predicate tests).

- [x] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat(extraction): trigger CLIP-vector extraction on demand in CLIP sort (Group P3)"
```

---

### Task 3: Remove the folder-open kickoff

**Files:**
- Modify: `media-viewer.js` — `async loadFolder(folderPath)` (2467); remove kickoff at 2536.
- Test: `tests/media-viewer-utils.test.js` — add a `methodSource` raw-extractor helper + a regression test.

**Interfaces:**
- Produces (test helper): `methodSource(name: string): string` — returns the raw source text of a top-level `MediaViewer` method body (handles `async` and non-async). Used here and in Task 4.

- [x] **Step 1: Add the `methodSource` test helper**

In `tests/media-viewer-utils.test.js`, insert this function immediately after the `extractAsyncMethod` definition (after its closing `}` on line 77, before `const buildKeyString = ...` on line 79):

```js
// Returns the raw source text of a top-level MediaViewer method body (for regression
// assertions that a call was added/removed). Handles both `name(` and `async name(`.
function methodSource(methodName) {
    const regex = new RegExp(`^\\s{4}(?:async\\s+)?${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) {
        throw new Error(`Could not find method: ${methodName}`);
    }
    const searchStart = match.index + match[0].length - 1; // position of opening {
    let braceCount = 0;
    for (let i = searchStart; i < source.length; i++) {
        if (source[i] === '{') braceCount++;
        if (source[i] === '}') braceCount--;
        if (braceCount === 0) return source.substring(searchStart + 1, i);
    }
    throw new Error(`Unbalanced braces for method: ${methodName}`);
}
```

- [x] **Step 2: Write the failing regression test**

Append a new describe block at the end of `tests/media-viewer-utils.test.js`:

```js
describe('lazy extraction wiring (Group P3)', () => {
    it('loadFolder no longer kicks off background extraction on folder open', () => {
        expect(methodSource('loadFolder')).not.toContain('kickoffBackgroundExtractionIfEnabled');
    });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "loadFolder no longer kicks off"`
Expected: FAIL — `loadFolder` still contains `this.kickoffBackgroundExtractionIfEnabled();` at line 2536, so `.not.toContain` fails.

- [x] **Step 4: Remove the kickoff call from `loadFolder`**

Replace:

```js
            this.updateFolderInfo();

            this.kickoffBackgroundExtractionIfEnabled();

            console.log(`Successfully loaded ${this.mediaFiles.length} media files`);
```

with:

```js
            this.updateFolderInfo();

            // Lazy extraction (Group P3): feature/CLIP vectors are produced on first use of an
            // AI feature (CLIP sort / Sort by Prediction), not on folder open — keeps large
            // folders responsive. See docs/superpowers/specs/2026-06-25-extraction-timing-design.md.
            console.log(`Successfully loaded ${this.mediaFiles.length} media files`);
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "loadFolder no longer kicks off"`
Expected: PASS.

- [x] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: all pass (the 11 `kickoffBackgroundExtractionIfEnabled` tests unaffected — the method body is unchanged).

- [x] **Step 7: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(extraction): stop kicking off extraction on folder open (Group P3)"
```

---

### Task 4: Make the CLIP enable-toggle lazy

**Files:**
- Modify: `media-viewer.js` — CLIP toggle `change` handler inside `setupEventListeners()` (1656); drop the toggle-on `else` branch at 1939–1945.
- Test: `tests/media-viewer-utils.test.js` — extend the Group P3 regression describe.

**Interfaces:**
- Consumes: `methodSource` (Task 3).

- [x] **Step 1: Write the failing regression test**

In `tests/media-viewer-utils.test.js`, add a second `it` to the existing `describe('lazy extraction wiring (Group P3)', ...)` block. Scope the assertion to just the CLIP-toggle `change` handler (small, brace-safe) rather than brace-counting the ~500-line `setupEventListeners`:

```js
    it('CLIP enable-toggle handler no longer kicks off extraction', () => {
        // The only kickoff call inside setupEventListeners was the toggle-on branch (Group C);
        // under lazy semantics toggling CLIP on just enables the capability. Extract only the
        // handler body so the assertion does not depend on the whole 500-line method.
        const anchor = "clipToggle.addEventListener('change'";
        const start = source.indexOf(anchor);
        expect(start).toBeGreaterThan(-1);
        const open = source.indexOf('{', start);
        let depth = 0;
        let end = -1;
        for (let i = open; i < source.length; i++) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        const handlerBody = source.slice(open, end);
        expect(handlerBody).not.toContain('kickoffBackgroundExtractionIfEnabled');
    });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "CLIP enable-toggle"`
Expected: FAIL — the toggle handler still contains the toggle-on `this.kickoffBackgroundExtractionIfEnabled();` (line 1944).

- [x] **Step 3: Drop the toggle-on `else` branch**

`this.enableClipFeatures` and its `localStorage` write already happen above the `if/else` (lines 1910–1911), so the `else` body's only statement is the kickoff. Replace:

```js
                } else {
                    // Toggle-on: start background extraction immediately, mirroring the
                    // folder-load path (see loadFolder's kickoff call). Fire-and-forget.
                    // kickoff no-ops when no folder is loaded (guards on mediaFiles.length),
                    // so toggling CLIP on with nothing loaded won't trigger a model download.
                    this.kickoffBackgroundExtractionIfEnabled();
                }
```

with:

```js
                }
                // Toggle-on is intentionally lazy (Group P3): enabling CLIP only advertises the
                // capability; vectors are produced on first use of an AI feature, not on toggle.
```

(The toggle-**off** `if` block above — revert `sortAlgorithm`, delete the `'clip'` sort cache — is unchanged.)

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "CLIP enable-toggle"`
Expected: PASS.

- [x] **Step 5: Run lint + full unit suite**

Run: `npm run lint && npx vitest run`
Expected: lint 0 errors (no empty block — the `else` is gone, not emptied); all unit tests pass.

- [x] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(extraction): make CLIP enable-toggle lazy, no eager kickoff (Group P3)"
```

---

## Verification (manual smoke — parallel-work hand-off, real 24k folder)

Synthetic E2E fixtures cannot represent 24 000 files; the user verifies on a real large folder. Run `npm start` and check:

1. **Open the 24k folder** → no CPU spike, no extraction progress card, no CLIP model download. Browsing/rating is immediately responsive.
2. **Sort by Similarity with algorithm = CLIP** (Settings → sort algorithm `clip`) → "⏳ Starting feature extraction…" toast + cancelable progress card appear; on completion the folder sorts by CLIP similarity. Cancelling mid-extraction works and leaves the app usable.
3. **Click CLIP sort again** → sorts instantly; no feature-cache reload, no re-extraction (the `clipVectorsNeedExtraction()` gate returns false).
4. **Sort by Prediction** still works (already-lazy ML path, unchanged) — extracts on demand and sorts.
5. **Hash similarity sort** (vptree / mst / simple) still works with zero feature extraction.
6. **Settings (F1) → toggle CLIP off then on** → no extraction kicks off from the toggle; the next CLIP sort triggers it.

---

## Self-Review

**Spec coverage:**
- D1 (remove folder-open kickoff) → Task 3. ✓
- D2 (CLIP toggle-on lazy) → Task 4. ✓
- D3 (conditional gate, no needless reload) → Task 1 (`clipVectorsNeedExtraction`) + Task 2 (gated call). ✓
- D4 (reuse `kickoffBackgroundExtractionIfEnabled` unchanged) → Task 2 reuses it; no edit to 8021–8051. ✓
- Non-goals (ML path, hash path, restore-cache path untouched; no settings UI) → respected; no task touches them. ✓
- Test plan (predicate unit tests + loadFolder regression + manual smoke) → Tasks 1/3/4 + Verification. ✓

**Placeholder scan:** none — every step has exact paths, full code, exact commands, expected output.

**Type/name consistency:** `clipVectorsNeedExtraction()` (defined Task 1, called Task 2) — consistent. `methodSource()` (defined Task 3, reused Task 4) — consistent. `kickoffBackgroundExtractionIfEnabled()` spelled identically throughout.

**Ordering safety:** Task 2 adds the on-demand CLIP trigger *before* Task 3 removes the folder-open kickoff, so CLIP sort is never broken between commits. Task 1 lands the predicate before Task 2 consumes it.

---

## Key Discoveries

- **The ML "Sort by Prediction" path was already lazy.** [media-viewer.js handleSortByPrediction](../../../media-viewer.js) already calls `loadFeatureCache()` → checks `uncachedFiles` → `startBackgroundFeatureExtraction()` on demand and never depended on the folder-open kickoff. This narrowed the real work: only the **CLIP semantic-sort** path needed a new on-demand trigger; the folder-open kickoff was pure pre-warm overhead for the non-AI user.
- **CLIP semantic sort vs. hash similarity sort have different vector needs.** CLIP sort reads `clipCache` (512-dim) and errored "wait for background extraction" when empty; hash sort (vptree/mst/simple) computes perceptual hashes in its own loop and needs **no** feature vectors at all. Only the CLIP branch of `handleSortBySimilarity` got the trigger.
- **`loadFeatureCache()` is single-flight but not cached across calls** — it re-reads `.feature_cache.json` (~40s streaming parse on 24k) on every fresh call. This is why the trigger had to be **conditional** (`clipVectorsNeedExtraction()`): an unconditional ensure on every CLIP sort would reload the whole cache even when vectors are already in memory.
- **The CLIP "restore cached order" path is a separate branch** that never reaches the full-sort code, so it stays instant (vector-less new files end-append, pre-existing behavior) — no trigger needed there.
- **Two reused methods were left byte-for-byte unchanged** (`kickoffBackgroundExtractionIfEnabled`, `clipVectorsNeedExtraction`), so the kickoff's 11 existing unit tests stayed green and only callers changed.
- **Test-helper fragility surfaced:** the new `methodSource()` source-extractor brace-counts naively (ignores braces inside string/template/regex literals). Harmless for its only caller (`loadFolder`, all-balanced `${...}`), which is why Task 4 deliberately used a *scoped* handler extractor instead — but a latent trap for any future brace-bearing caller.

## Future Improvements

(Extracted to BACKLOG.md 🟤 [2026-06-25] — see Group P3 closeout group.)

1. **Harden or document `methodSource()` brace-counting** (`tests/media-viewer-utils.test.js`) — skip string/template/regex spans, or add a doc-comment warning, before a second brace-bearing caller is added. Latent silent-wrong-slice risk; currently safe for `loadFolder` only.
2. **Extract the gate-and-extract lazy-trigger into a shared helper** if/when a third AI-dependent consumer appears, so the `if (needsExtraction) await kickoff` pattern lives in one place rather than alongside the ML path's inline `uncachedFiles` check.

## Verification status

- ✅ 381 unit tests green (5 predicate cases + 2 regression guards added; +7 from 374).
- ✅ All per-task reviews Approved; final whole-branch review (opus) "Ready to merge: Yes" (no Critical/Important).
- ⏳ **PENDING — manual 24k-folder smoke** (plan's 6-step checklist; steps 3 "repeat CLIP sort = instant/no reload" and 6 "toggle off→on = no kickoff" are the unit-uncovered behaviors). This is the real acceptance gate and the merge precondition.
