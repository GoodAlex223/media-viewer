# G2 PR 2. Background Hashing, Parity Mode and Atomic Folder Writes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G2 (🔵 🏆; ~13 SP across two PRs, spec D7; this plan is **PR 2**, re-estimated ~9 SP below) ← TODO 🔴 [2026-06-18] "Speed up AI / similarity sorting on large folders (24k+ files)", slice PR2
**Spec**: [2026-10-19-g2-hash-sort-off-renderer-design.md](../../superpowers/specs/2026-10-19-g2-hash-sort-off-renderer-design.md) (approved 2026-10-19; PR 1 amendments § 15, PR 1 execution notes § 16; **PR 2 amendments § 17: B1–B10 from planning, B11–B14 from the PR #87 review**)
**Created**: 2026-10-22
**Status**: In review — PR #87; plan approved by the user 2026-10-22 ("Looks good"). Review rounds 1 and 2 answered (2026-10-24). The `Liked_2` smoke has not run.
**Last Updated**: 2026-10-24
**Branch**: `g2-pr2-background-hashing` (from `main` @ `bf5ec84`, after PR #86 merged as `654fb3e`)

**Goal:** A similarity sort hashes its images in background workers, so the app stays usable during a cold-cache sort of a large folder, with hashes that match today's route under the D4 bar. `.hash_cache.json`, `.sort_cache.json` and `.bulk_rated.json` can no longer be torn by a quit mid-save.

**Architecture:** Six new files outside the renderer:
- `perceptual-hash.js`: the one `blockhash`.
- `main-thread-hash.js`: today's route, moved out of `media-viewer.js`.
- `hash-worker.js`: the measured F4 route, as a module worker.
- `hash-pool.js`: a per-run pool of N workers with today's route as its fallback, a pixel-exact canary, crash and timeout recovery, and abort.
- `hash-parity.js`: the D5 diagnostic.
- `atomic-write.js`: main's tmp + rename writer.

`media-viewer.js` keeps the orchestration: its run loop consumes the pool's results through PR 1's token checks, and `computePerceptualHash` becomes a one-line delegate that serves as the pool's fallback. `main.js` gains the parity query flag and sends two handlers through the atomic writer. There is **no new IPC channel, no `preload.js` change and no `sorting-worker.js` change**.

**Tech Stack:** Electron 39.1.2 renderer and main; WebCodecs `ImageDecoder`, `OffscreenCanvas` and `createImageBitmap` in a module worker; Vitest 4 (node environment); Playwright + Electron E2E; `sharp` 0.34.5 for fixtures generated at test time.

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. The `PostToolUse` hook formats each edited JS file; lint-staged formats at commit. `docs/` and `*.md` are Prettier-ignored.
- **ESLint**: `curly: ['error', 'all']`, `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; `_` prefix). New files join existing blocks in `eslint.config.mjs`:
  - `atomic-write.js` → block 1 (Node main);
  - `perceptual-hash.js`, `main-thread-hash.js`, `hash-pool.js`, `hash-parity.js` → block 2c (renderer modules, `htmlSinkGuard`);
  - `hash-worker.js` → block 3a-jxl (rename its comment to "Module Web Workers").

  The four 2c files also join `RENDERER_FILES` in `tests/lint-guard.test.js`. No new file builds markup.
- **Scope fences**:
  - **No new IPC channel and no `preload.js` edit.** The worker reads media through the app scheme (`fetch(MediaUrl.toMediaUrl(path))`, spec F14). The parity flag travels as a query (F15). Perf lines use the existing `logPerf`, and the canary log line uses `logError`.
  - `sorting-worker.js` is untouched, so the Tier 2 plan review does not apply.
  - `main.js` changes are limited to the parity URL, the atomic writer and the two handlers named in T1. **No file-move handler changes** (Tier 1).
- **The route is the measured one** (spec § 5.2, F4; re-measured 2026-10-22, § 17 B8):
  - a **fresh** `OffscreenCanvas(256, 256)` per file;
  - `getContext('2d')` with **no options**;
  - `drawImage(src, 0, 0, 256, 256)`, then `getImageData(0, 0, 256, 256)`;
  - YUV test: exactly `/^(I4|NV|I2)/.test(image.format)`.
  - **Never** `willReadFrequently`, never a reused canvas, never a `desiredWidth`/`resizeWidth` decode.
- **The one `blockhash`** lives in `perceptual-hash.js`. Never import the npm `blockhash` package: it is a different algorithm, and T2 removes it.
- **Hash identity**: a hash is the 256-character `0`/`1` string `blockhash(imageData, 16)` returns. Path identity is exact string equality, with no case folding.
- **Renderer namespaces**: `media-viewer.js` reaches each new module through a namespace import (`MainThreadHash`, `HashPool`, `HashParity`), never a bare imported name. Extracted-method unit tests supply them through `globalThis`, as `SimilaritySort` is supplied today.
- **Every `await` in a run is followed by its liveness check** (PR 1's rule, spec § 6.4). A pool result is stored only after `_assertSimilarityRunLive(run)` (in a run) or `assertLive()` (in the placement), with no `await` between the check and the store.
- **Never transfer a buffer the renderer keeps.** JXL frame bytes come from `jxlFrameCache`, so they are posted without a transfer list. Only the worker's own read-back pixels are transferred.
- **Progress goes through `updateSortProgress` only** (CLAUDE.md, the shared-element gotcha).
- **Exact strings** (new; PR 1's strings stay as they are):
  - Confirm over 1,000 files (my call 8): `` `Sorting ${n} files may take several minutes.\n\nHashing runs in the background, so you can keep using the app while it works.\n\nHash data will be cached at:\n${cacheFile}\n\nContinue?` ``
  - Canary failure: `⚠️ Background hashing check failed — hashing on the main thread` (`warning`). Log: `logError({ level: 'warn', source: 'hash-pool', message: \`Hash canary failed: ${detail}\` })`.
  - Parity confirm (always shown): `` `Hash parity check: ${images} images are hashed by both routes. Nothing is sorted and no cache is written.\n\nThe second pass runs on the main thread, so the app will not respond for several minutes.\n\nContinue?` ``
  - Parity done: `Parity check done — see the perf log`, `success` when the verdict is `pass`, `warning` when `fail`. Parity cancelled: `❌ Parity check cancelled` (`info`). A parity failure uses the sort's `` `❌ Error: ${error.message}` `` (`error`).
- **Perf lines**:
  - The similarity line's hash note becomes `new <N>, worker <N>, fallback <N>, skipped <N>, pool <P>`, plus `, canary failed` when it failed. `pool 0` means no pool was made, because nothing needed a hash.
  - Parity lines are defined in T6.
- **Constants**:
  - `POOL_SIZE = 3` (T8 measures 1–4 and may change it).
  - `WORKER_TASK_TIMEOUT_MS = 30_000` and `MAIN_ROUTE_TIMEOUT_MS = 30_000` (today's 30 s).
  - `CANARY_TIMEOUT_MS = 5_000`.
  - Canary images: 320×240; the JPEG at quality `0.92`.
  - `PARITY_MAX_RATE = 0.005`; `MAX_PARITY_DETAIL_LINES = 200`; `TMP_SWEEP_MIN_AGE_MS = 600_000`.
- **Real folders**:
  - **Nothing opens, sorts, hashes or writes `Liked_2` before the user's smoke**, which is its cold-cache test (F8: 15,649 files, no `.hash_cache.json`, measured 2026-10-22).
  - T8 reads `Liked_3` read-only, through a grant in a throwaway E2E profile: no `loadFolder`, no sort, no write.
- **Every new test must fail against the code before its step lands.** Record the failure in the Progress Log. Where a mutation is named, run it, log both runs, and restore the change with `git checkout -- <file>`. Never restore from a scratchpad backup (memory `feedback_subagent_commits_vs_memory_hook`).
- **E2E**: `workers: 1`; null guards in `afterEach`; each launch gets a fresh grant store. Use `{ force: true }` or `page.evaluate` past the `.media-container` overlay. Wait for `isLoading` and `mediaNavigationInProgress` to clear before guarded actions.
- **Hooks**: pre-commit runs the secret scan → docs-index guard → `CLAUDE.md` size warning → lint-staged → `npx vitest run`. Pre-push runs the full E2E suite. Never `--no-verify`.
- **Grep rule** (CLAUDE.md § Best Practices): when moving or renaming a named function, grep code, tests **and comments**, and re-read every comment on changed code. Known hits:
  - `computePerceptualHash` (the video-release tests, the E2E gate, comments at `media-viewer.js:9423` and `:8636`);
  - `this.blockhash`;
  - the "could freeze the application" text.
- **Commits**: one per task. In subagent-driven mode the **controller** commits. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, or the executing model's own line.

## Review Focus

Each line names the input, the expected behaviour, the pinning test and the **mutation that must make that test fail**. The mutation run is logged in the owning task.

1. **File names that need URL encoding** (`%`, `#`, spaces, Cyrillic, `&`/`=`/`;`). Expected: the worker hashes them, not the fallback, and the hash equals today's.
   - Pinned in T7: E2E `file names that need encoding are hashed by the worker`, on fixtures `100% #1 фото.jpg` and `a&b=c;d.png`.
   - Mutation: in `hash-pool.js`, build the URL as `'app://media-viewer/@fs/' + path` instead of `toMediaUrl(path)`. The route assertion (`worker`) fails.
2. **Cancel while every worker is mid-decode** (nothing replies). Expected: the run ends at once, not after the slowest decode or the 30 s timeout. Every worker is terminated, and the finished hashes are saved.
   - Pinned in T4: unit `abort ends the iteration at once and terminates every worker`, with fake workers that never reply.
   - Mutation: delete the pool's `signal` abort listener. The test times out at its 1 s guard.
3. **Hashing a JXL leaves its display-cache entry usable.** Expected: the PNG bytes reach the worker as a copy, and the source buffer keeps its length.
   - Pinned in T4: unit `JXL bytes are posted as a copy, never transferred`.
   - Mutation: add `[bytes]` (or `[bytes.buffer]`) as the transfer list. The fake worker records it and the test fails.
4. **A Show or cache-hit placement made stale while its pool hashes.** Expected: it stores no hash and terminates its pool.
   - Pinned in T5: the existing `a placement made stale during the hash stops there` test (`media-viewer-utils.test.js` ~L814) gains `expect(pool.terminate).toHaveBeenCalled()`, and the fake pool is the hash source.
   - Mutation A: delete the `assertLive()` after a pool result in `insertNewFilesInSortedOrder`; the hash is stored. Mutation B: delete the `finally { pool.terminate(); }`; terminate is never called.
5. **`MV_HASH_PARITY=1` left set in the user's shell** (the smoke's own command). Expected: every parity run asks first, even on a 3-file folder; declining starts nothing. E2E launches never inherit the variable.
   - Pinned in T6: unit `parity mode always asks first, and declining starts nothing`. Pinned in T7: `launchApp` drops `MV_HASH_PARITY` unless a test passes it (E2E `a normal launch is not in parity mode even when the shell sets MV_HASH_PARITY`).
   - Mutation A: show the parity confirm only above 1,000 files. Mutation B: remove the `delete env.MV_HASH_PARITY` in `launchApp`.

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `atomic-write.js` | Create | `createAtomicWriter`: per-target serialized, fsynced, unique-tmp + rename writes, with an orphan-tmp sweep (T1) |
| `main.js` | Modify | Builds the writer; `write-folder-cache` and `writeBulkRatedFile` write through it (T1); loads `INDEX_URL?hashParity=1` under `MV_HASH_PARITY=1` (T6) |
| `perceptual-hash.js` | Create | The one `blockhash`, plus `HASH_CANVAS_SIZE`, `HASH_BITS` (T2) |
| `main-thread-hash.js` | Create | Today's route: `hashFile`, `hashImageUrl`, `makeCanaryImages` (T2) |
| `hash-worker.js` | Create | Module worker: `sniffImageType`, `isYuvFormat`, `hasIccProfile`, `hashBytes`, the message protocol (T3) |
| `hash-pool.js` | Create | `HashPool`: slots, queue, timeouts, crash recovery, fallback lane, abort, canary; `isVideoPath` (T4) |
| `hash-parity.js` | Create | `readParityFlag`, `runHashParity`, `classifyParity`, `formatParityLines` (T6) |
| `media-viewer.js` | Modify | `computePerceptualHash` delegates; `blockhash` method deleted (T2). `_createHashPool`, `_reportHashCanaryFailure`; the run's hash phase and the placement on the pool; confirm wording (T5). `hashParityMode`, `_runHashParity`, `lastHashParityReport` (T6) |
| `package.json`, `package-lock.json` | Modify | Remove the unused `blockhash` dependency (T2) |
| `eslint.config.mjs` | Modify | New files in blocks 1, 2c, 3a-jxl (T1–T4, T6) |
| `tests/atomic-write.test.js` | Create | The writer (T1) |
| `tests/main-hardening.test.js` | Modify | Source pins: both handlers write through `writeFileAtomic` (T1) |
| `tests/perceptual-hash.test.js` | Create | Known vectors, single-source pins (T2) |
| `tests/main-thread-hash.test.js` | Create | The canvas recipe; URL routing (T2) |
| `tests/video-release.test.js` | Modify | `computePerceptualHash`'s three video tests re-pointed at `MainThreadHash.hashFile` (T2) |
| `tests/hash-worker.test.js` | Create | Sniffing, YUV test, ICC detection, source pins (T3) |
| `tests/hash-pool.test.js` | Create | The pool with fake workers (T4) |
| `tests/hash-pool-harness.js` | Create | `fakeHashPool(hashFn, opts)` for glue tests (T5) |
| `tests/similarity-sort-glue.test.js` | Modify | Run contexts gain `_createHashPool`; the new hash-phase tests; the perf note (T5); the parity glue (T6) |
| `tests/media-viewer-utils.test.js` | Modify | Placement contexts gain `_createHashPool`; Review Focus #4 (T5) |
| `tests/integration/cached-sort-path.test.js` | Modify | `_createHashPool` is never called when nothing is missing (T5) |
| `tests/hash-parity.test.js` | Create | Classification, formatting, the two-pass runner (T6) |
| `tests/lint-guard.test.js` | Modify | `RENDERER_FILES` gains the four 2c files (T2, T4, T6) |
| `tests/e2e/fixtures/hash-fixtures.js` | Create | `generateHashFixtures(dir)`: the § 11.1 set, made at test time with `sharp` (T7) |
| `tests/e2e/helpers/electron-app.js` | Modify | `launchApp({ env })`; `MV_HASH_PARITY` dropped unless passed (T7) |
| `tests/e2e/hash-parity.test.js` | Create | Fixture parity, canary, encoding, responsiveness, parity mode (T7) |
| `tests/e2e/similarity-sort.test.js` | Modify | `gateHashing` gates the pool, not `computePerceptualHash` (T7) |
| `CLAUDE.md` | Modify | Architecture tree; Data Structures (the one `blockhash`); Async Patterns (the pool); Cache Management (atomic writes); Build commands (`MV_HASH_PARITY`); one Active gotcha (the route rules) (T1–T6) |
| `docs/ARCHITECTURE.md` | Modify | § Similarity Sorting Flow's first box; § Data Storage's Image Hashes row (atomic) (T5, T1) |
| `PROJECT.md`, `README.md`, `docs/PROJECT_CONTEXT.md` | Modify | "blockhash npm package" / "blockhash-js" → the app's own block-mean hash in `perceptual-hash.js` (T2) |
| spec, `docs/README.md`, `docs/planning/plans/README.md`, `WEEKLY.md`, `TODO.md` | Modify | § 17; this plan indexed; G2 and the 🔴 entry point at it (committed with this plan) |

**Live-surface preflight** (plans README step 4). These are the live surfaces asserting a claim PR 2 changes, diffed against the table above:
- `CLAUDE.md`:
  - § Architecture tree (no new file): ✅ T1–T6.
  - § Data Structures "Perceptual hashing (image similarity)" (no source named): ✅ T2.
  - § Async Patterns similarity bullets (hashing implied on the renderer): ✅ T5.
  - § Cache Management "`write-folder-cache` takes only `'hash'`/`'sort'`" (still true; atomicity added): ✅ T1.
  - § Data Flow item 1 ("feature-cache streaming … batched atomic writes"; folder-cache writes not named): ✅ T1.
- `PROJECT.md` § External Dependencies "blockhash | npm package" (false today: unused): ✅ T2.
- `README.md:73` and `docs/PROJECT_CONTEXT.md:36` "blockhash-js" (false today): ✅ T2.
- `docs/ARCHITECTURE.md:145` "Renderer: compute hashes" and `:237` (Image Hashes row): ✅ T5, T1.
- The comments at `media-viewer.js:9423` ("computeFeatures and computePerceptualHash release a video") and on `insertNewFilesInSortedOrder` (`:8636`): ✅ T2, T5.

**Checked, no claim to change**:
- `index.html`: the CSP is a response header, `worker-src 'self'` and `connect-src 'self'` already cover the worker, and no script tag changes.
- `README.md` § Features ("perceptual hashing" is still true).

**Not changed, deliberately**: `PROJECT.md` "Known Limitations … ~9,400 lines" (stale, but WEEKLY G5 owns the line-count sweep); BACKLOG (closeout).

## Planning amendments (spec § 17, committed with this plan)

Measured on `bf5ec84`, 2026-10-22; scripts in this session's scratchpad (`spike/canary-main.js`, `spike/page/canary*.js`, a copy of the 2026-10-19 harness). None changes a user ruling.

- **B1. The canary compares pixels, not hashes.** In a fresh Electron 39.1.2 process, seven canvas-encoded candidates went through both routes; the worker route matched today's pixel for pixel on all seven, visible and minimized. With the worker's context forced to `willReadFrequently: true`, 94k–239k of 262,144 bytes differed on every candidate, but the hash differed on only two. The 320×240 JPEG and 320×240 alpha PNG that § 9.2 describes kept **identical hashes**, so a hash-only canary would not fire. A pass needs every byte of both 256×256 read-backs equal, and the hashes equal.
- **B2. Atomic folder-file writes.** `write-folder-cache` (PR #85 review #5) and `writeBulkRatedFile` write through one helper:
  - a unique tmp name per write, created exclusively (`'wx'`);
  - `assertFixedPath` on the tmp and on the target before anything is written;
  - fsync, then a rename with the lock retry (`withReadRetries`);
  - writes to one target applied in the order main received them;
  - orphaned tmps older than 10 minutes removed on the first write to each target.

  `.bulk_rated.json` is included because its ratings exist nowhere else; a bulk rating moves no file (side-agent note, relayed by the user, 2026-10-22). Per-target ordering is needed because unique names alone stop a tear but not an older write's rename landing last.
- **B3. Today's route moves to `main-thread-hash.js`** (§ 5.1's builder call). `computePerceptualHash` stays on `MediaViewer` as a one-line delegate and serves as the pool's fallback. Its image draw is factored into `hashImageUrl`, which the canary also uses on a `blob:` URL; its messages are unchanged.
- **B4. One pool per run** (§ 6.2, § 6.4). A run, or a placement with files to hash, creates a pool and terminates it in its `finally`. No worker outlives the run that made it, so "a stale run only lets its workers go" holds by construction.
- **B5. Parity mode runs two passes, worker route first** (§ 9.1). The second pass reads files the first already read, so the speed-up it reports is conservative. Parity mode always asks first, because the second pass freezes the app. It writes no cache, and it leaves its report on the viewer as `lastHashParityReport` for the E2E.
- **B6. D4's classes, as code.** A 1-bit difference is *accepted* when the bytes sniff as JPEG, or as WebP decoded to a YUV frame (lossy). Every other difference is a *defect*. A share of differing images above 0.5% of those compared fails the verdict too.
- **B7. PR 1 Improvement #1 (a per-run hash map) is not absorbed.**
  - The pool's results reach `perceptualHashes` through one store in the run's loop, after the token check, so the pool adds no write path.
  - The E2 gap the map would close needs a hash computed after a move. The pool cannot produce one: a moved file's read fails on both routes.
  - The map would also rework `saveHashCache`'s merge-once rule (PR #85 #20), which guards the 13k-entry cache against shrinking.

  It stays in BACKLOG, and this ruling is appended at closeout.
- **B8. Re-measured.**
  - F4 holds: the spike's 25 fixtures were 25/25 pixel-exact and hash-identical, in frame formats BGRA, BGRX, I444 and I420.
  - E15: minimized, both routes stayed pixel-identical on B1's seven candidates.
- **B9. The unused npm `blockhash` dependency is removed.** It is a different algorithm, and nothing imports it. The one `blockhash` is `perceptual-hash.js`.

## Existing tests these changes reach (measured on `bf5ec84`)

- **`tests/video-release.test.js`**: `computePerceptualHash — video (G3)` (3 tests, ~L210) extracts the method and mocks `this.blockhash`. T2 re-points them at `MainThreadHash.hashFile` with an injected `releaseVideo`, mocking `blockhash` through `vi.mock('../perceptual-hash.js', …)`. Their assertions (error counts, `src` attribute) are unchanged.
- **`tests/similarity-sort-glue.test.js`**:
  - `runCtx` (~L304) and the other run contexts mock `computePerceptualHash` (18 sites). T5 adds `_createHashPool() { return fakeHashPool((p) => this.computePerceptualHash(p)); }` to each context, so every existing mock keeps its meaning (the fake calls it serially, in path order).
  - The perf-note assertion (~L680, `'new 3, skipped 0'`) becomes `'new 3, worker 3, fallback 0, skipped 0, pool 3'`.
- **`tests/media-viewer-utils.test.js`**:
  - The `insertNewFilesInSortedOrder` tests (~L446–560, ~L640–690, ~L814–863) gain the same `_createHashPool` in their contexts.
  - `_logSortPerf`'s similarity case (~L2505) passes the note as input and is unaffected.
- **`tests/integration/cached-sort-path.test.js`**: 3 tests assert `computePerceptualHash` is never called when cached. T5 adds `_createHashPool: vi.fn()` and asserts it is never called either.
- **`tests/e2e/similarity-sort.test.js`**: `gateHashing` wraps `computePerceptualHash`, which the worker route no longer calls. T7 gates the pool's results instead (same semantics: result 1 passes, result 2 and later wait).
- **E2E that run real sorts**: `sort-progress.test.js` and `security-csp-walk.test.js` now hash in workers. The CSP walk is the guard that the worker's module import and its `fetch` raise no violation, and it must stay green.
- **`tests/e2e/security-ipc.test.js`**: "writing a folder cache through a planted link is refused and the target is unchanged" must stay green; the writer asserts the target before it creates anything.
- **`tests/like-or-skip-glue.test.js` § 4**: no new `this.mediaFiles =` assignment, so nothing changes. Run it after T5.

## Task Ordering and Model

1. **T1**, atomic writes, is independent and goes first: the safety fix, on a separate surface (main).
2. **T2**, the one `blockhash` and today's route moved, is behaviour-neutral and is the base for T3–T5.
3. **T3**, the worker, then **T4**, the pool (with fake workers; T4 needs T3's protocol only).
4. **T5**, the run on the pool, needs T2 and T4.
5. **T6**, parity mode, needs T4 and T5.
6. **T7**, E2E, needs T5 and T6.
7. **T8**, pool-size measurement, needs T7 green. It changes `POOL_SIZE` only.

| | Choice | Why |
|---|---|---|
| SP | **~9** (spec § 13.1 said ~7 for PR 2): T1 1, T2 0.75, T3 0.75, T4 1.5, T5 1.5, T6 1, T7 1.5, T8 0.5, docs 0.5 | B2 adds the atomic writer, with ordering and the bulk-rated file. B1 adds the pixel canary. The re-pointed tests add churn. 1.3×, under the 2× abort line. |
| Plan | Opus 5.5 · `xhigh` (this session) | The brief. |
| Execution | **Opus 5.5 · `medium`** for T1, T4, T5, T6. **Sonnet 5.5 · `medium`** for T2, T3, T7. **T8 by the controller.** | T1 (per-target ordering, own-tmp cleanup), T4 (slots, timeouts, abort), T5 and T6 (a token check after every `await`) are the concurrency tasks. T2, T3 and T7 are spelled out: a move, a copied measured route, and the E2E. A RED test that passes, in any task, escalates to Opus. T8 reads a real folder and needs judgment. |
| Final review | **Deep (`max`)**: the `regression-checker` agent on `media-viewer.js`, then an Opus `max` whole-branch review. The PR's `/code-review` runs **in a separate chat** (memory `feedback_ask_before_in_chat_code_review`). PR 2 touches `main.js`, so the user also starts `/claude-security` → *Scan changes* (the norm since G1 leg 2). | It changes how every hash is computed, and two writers that hold user data. |

---

## Task 1: Atomic folder-file writes (main)

**Files:**
- Create: `atomic-write.js`, `tests/atomic-write.test.js`
- Modify: `main.js` (`write-folder-cache` ~L791–805, `writeBulkRatedFile` ~L618–628, the writer's construction beside `assertFixedPath` ~L312), `tests/main-hardening.test.js`, `eslint.config.mjs` (block 1), `CLAUDE.md` (§ Architecture tree, § Data Flow item 1, § Cache Management bulk-rated line), `docs/ARCHITECTURE.md` (§ Data Storage, the Image Hashes row)

**Interfaces:**
- Produces (CJS):
  - `createAtomicWriter({ fs, assertPath, withRetries, makeId = () => crypto.randomBytes(6).toString('hex'), now = Date.now })` → `{ writeFileAtomic(targetPath: string, data: string): Promise<void> }`;
  - `tmpPathFor(targetPath, id)` → `path.join(dir, \`${base}.${id}.tmp\`)`;
  - `TMP_SWEEP_MIN_AGE_MS = 600_000`.
- `fs` is `require('fs').promises`; `assertPath` is main's `assertFixedPath`; `withRetries` is `feature-cache-ledger.js`'s `withReadRetries`, injected and not imported, so no third copy of the rename-retry loop appears (BACKLOG [2026-10-21] "`withReadRetries` duplicates write-close's rename retry loop").

`writeFileAtomic`'s contract, in order:
1. Writes to the same `targetPath` run one at a time, in call order. A failed write does not stop the next one.
2. `tmp = tmpPathFor(target, makeId())`. Then `await assertPath(tmp)` and `await assertPath(target)`, both before anything touches the disk.
3. On the first write to this target in this writer: sweep the directory for `^<escaped base>\.[0-9a-f]{12}\.tmp$` regular files whose `mtimeMs` is older than `now() - TMP_SWEEP_MIN_AGE_MS`, and unlink them. Errors are ignored.
4. `fh = await fs.open(tmp, 'wx')`, which marks the tmp as created; then `fh.writeFile(data, 'utf8')`, `fh.sync()` and `fh.close()` (in a `finally`).
5. `await withRetries(() => fs.rename(tmp, target))`.
6. On any failure after step 4's open: unlink the tmp (errors ignored) and rethrow. A tmp **this call did not create** (open threw `EEXIST`) is never unlinked.

- [ ] **Step 1: Write the failing tests** in `tests/atomic-write.test.js`. They use real files in a `mkdtemp` folder and inject `fs` wrappers where a failure must be forced.
  - `writes the new content and leaves no tmp behind`.
  - `a write that fails mid-way leaves the old file intact and removes its tmp`: the handle's `writeFile` writes half of `data`, then throws `ENOSPC`. The target still reads `old`; the directory holds no `*.tmp`.
  - `an interrupted write leaves the old file intact` (the quit-mid-save case): the handle's `writeFile` writes half, then awaits a promise that never settles. While it is pending the target reads `old`. A second writer with `now: () => Date.now() + 11 * 60_000` then writes `newer`: the target reads `newer`, and the orphaned tmp is gone. **Mutation**: replace steps 4–5 with `fs.writeFile(target, data)`; the pending read sees half a file and fails.
  - `a failed rename leaves the old file intact and removes its tmp`.
  - `two overlapping writes to one target land in call order`: call 1's `writeFile` waits on a gate, call 2 is fast; open the gate; the target reads call 2's data. **Mutation**: remove the per-target chain; the target reads call 1's data.
  - `a write after a failed write still runs`.
  - `each write uses a fresh tmp name matching the sweep pattern`: two writes, two distinct `open` paths, each matching `/^\.hash_cache\.json\.[0-9a-f]{12}\.tmp$/` by basename. **Mutation**: a fixed `.tmp` name.
  - `the tmp and the target are checked before anything is written`: `assertPath` is called with both paths before `open`. When it rejects for the tmp, the call rejects, no file is created and the target is unchanged. **Mutation**: drop `assertPath(tmp)`.
  - `an entry already at the tmp name is neither written nor removed`: fixed `makeId`, a planted file at that name with `sentinel`. The call rejects with `EEXIST`, `sentinel` is intact and the target is unchanged. **Mutation**: open with `'w'`.
  - `the sweep removes only old orphans of this target`: an old orphan of the target is removed. A young orphan, an old orphan of another target, and `.hash_cache.json.bak` are kept. A second write to the same target does not sweep again (the `readdir` spy is called once).
  - `a rename that fails with EPERM twice is retried`, through the real `withReadRetries` with an injected `sleep`.
- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/atomic-write.test.js` should fail with "Cannot find module '../atomic-write.js'". Log it.
- [ ] **Step 3: Implement `atomic-write.js`** to the contract above.
- [ ] **Step 4: Run to verify it passes**, then run every named mutation and log RED and GREEN for each.
- [ ] **Step 5: Wire `main.js`.**
  - `const atomicWriter = createAtomicWriter({ fs, assertPath: assertFixedPath, withRetries: withReadRetries });` goes right after `assertFixedPath`. Add `withReadRetries` to the `feature-cache-ledger` require.
  - `write-folder-cache` calls `await atomicWriter.writeFileAtomic(filePath, data)`.
  - `writeBulkRatedFile` calls `await atomicWriter.writeFileAtomic(filePath, JSON.stringify(data, null, 2))`.
  - Remove both handlers' own `assertFixedPath(filePath)` (the writer asserts it). Keep both return contracts as they are.
- [ ] **Step 6: Source pins** in `tests/main-hardening.test.js`, describe `folder files are written atomically (G2 PR 2, B2)`. The `write-folder-cache` and `writeBulkRatedFile` handler bodies each contain `atomicWriter.writeFileAtomic(` and no `fs.writeFile(`. Verify RED by reverting one handler to `fs.writeFile`. Log it.
- [ ] **Step 7: Docs.**
  - CLAUDE.md: tree line `atomic-write.js # Main's folder-file writer: unique tmp, fsync, rename, per-target order (B2)`; Data Flow item 1 gains "atomic folder-cache and bulk-rated writes"; append to the Cache Management bulk-rated bullet: "`.hash_cache.json`, `.sort_cache.json` and `.bulk_rated.json` are written through `atomic-write.js` (unique tmp, fsync, rename, one write per file at a time)".
  - ARCHITECTURE.md: the Image Hashes row gains "written atomically (tmp + rename)".
- [ ] **Step 8: Verify** with `npx vitest run`, `npm run lint`, and `npx playwright test tests/e2e/security-ipc.test.js` (the planted-link write test and the bulk-rated round trips stay green).
- [ ] **Step 9: Commit** `fix(main): write folder caches and bulk ratings atomically (G2 PR 2 T1, PR #85 review #5)`.

## Task 2: The one `blockhash`, and today's route moved out of the renderer

**Files:**
- Create: `perceptual-hash.js`, `main-thread-hash.js`, `tests/perceptual-hash.test.js`, `tests/main-thread-hash.test.js`
- Modify: `media-viewer.js` (import; `computePerceptualHash` ~L8090–8204 becomes a delegate; delete `blockhash` ~L8206–8240; the comment at ~L9423), `tests/video-release.test.js`, `package.json`, `package-lock.json`, `eslint.config.mjs` (2c), `tests/lint-guard.test.js`, `CLAUDE.md` (tree; § Data Structures), `PROJECT.md`, `README.md:73`, `docs/PROJECT_CONTEXT.md:36`

**Interfaces:**
- Produces: `perceptual-hash.js`: `HASH_CANVAS_SIZE = 256`, `HASH_BITS = 16`, and `blockhash(imageData: { width, height, data }, bits: number): string`, moved **verbatim** from `MediaViewer.blockhash`.
- Produces: `main-thread-hash.js` (imports `blockhash` and `media-url.js`):
  - `MAIN_ROUTE_TIMEOUT_MS = 30_000`;
  - `hashFile(filePath, { isJxl, decodeJxl, releaseVideo }): Promise<string>`: today's `computePerceptualHash` body, with its video branch unchanged, its image branch calling `hashImageUrl(MediaUrl.toMediaUrl(filePath))`, and its JXL branch calling `hashImageUrl(objectUrl)` and revoking the URL once that settles. It keeps the 30 s timeout and every rejection message;
  - `hashImageUrl(url, { wantPixels = false } = {}): Promise<{ hash, pixels? }>`: a new `Image`, then on `load` a **fresh** `<canvas>` 256×256, `getContext('2d')`, `drawImage(img, 0, 0, 256, 256)`, `getImageData(0, 0, 256, 256)` and `blockhash(…, 16)`. On `error` it rejects `Image load error: …`. `pixels` is the read-back's `data`;
  - `makeCanaryImages(): Promise<[{ name: 'canary-jpeg', blob }, { name: 'canary-png', blob }]>`: two 320×240 canvases painted by `paintCanary(ctx, w, h, alpha, seed)`. The JPEG (`alpha=false`, seed 1) comes from `toBlob('image/jpeg', 0.92)`, the PNG (`alpha=true`, seed 4) from `toBlob('image/png')`. `paintCanary` is the B1 probe's `paint()` (a linear gradient, 40 seeded circles, scanlines every 3 px); copy it from `spike/page/canary.js` in this session's scratchpad.
- `MediaViewer.computePerceptualHash(filePath)` becomes `return MainThreadHash.hashFile(filePath, { isJxl: (p) => this.isJxl(p), decodeJxl: (p) => this.decodeJxl(p), releaseVideo: (v) => this._releaseVideo(v) });`.

- [ ] **Step 1: Capture known vectors** from the renderer's current `blockhash` before anything moves. Use a one-off node script that extracts it from `media-viewer.js` at `bf5ec84` as the glue tests do. Run it on three fixed 256×256 inputs: a horizontal gradient, an 8-px checkerboard, and LCG-seeded noise (seed `12345`). Paste the three 256-character results into the test as literals, and log the script's command.
- [ ] **Step 2: Write the failing tests.**
  - `tests/perceptual-hash.test.js`:
    - `blockhash matches the renderer's on the known vectors` (the three literals).
    - `blockhash is defined in exactly one file`: scan every top-level `*.js` (not `node_modules`/`vendor`) for a definition, either `/function\s+blockhash\s*\(/` or a method header `/^\s*blockhash\s*\([^)]*\)\s*\{/m`. Calls such as `blockhash(data, 16)` do not match. The only hit is `perceptual-hash.js`.
    - `both routes import the one blockhash`: `main-thread-hash.js` and `hash-worker.js` each contain `from './perceptual-hash.js'`, and `media-viewer.js` contains no `blockhash(`. Write this case with `hash-worker.js` included and marked `it.todo` until T3, then make it a real test in T3 Step 2.
    - `package.json has no blockhash dependency`.
  - `tests/main-thread-hash.test.js` (fake `document`/`Image`):
    - `draws every file on a fresh 256×256 canvas with a default 2D context`: two `hashImageUrl` calls create two canvases, each 256×256. `getContext` receives exactly one argument, `'2d'`. `drawImage` gets `(img, 0, 0, 256, 256)` and `getImageData` gets `(0, 0, 256, 256)`. **Mutation**: `getContext('2d', { willReadFrequently: true })`, or a canvas hoisted to module scope.
    - `an image goes through its media URL`: `img.src === MediaUrl.toMediaUrl(path)`.
    - `a JXL goes through a frame-0 PNG blob URL, revoked after load`.
    - `wantPixels returns the read-back`.
  - In `tests/video-release.test.js`, re-point the 3 `computePerceptualHash — video (G3)` tests to `hashFile(path, { isJxl: () => false, decodeJxl, releaseVideo: extract('_releaseVideo') })`, with `vi.mock('../perceptual-hash.js', …)` standing in for `blockhash`. Keep the assertions.
- [ ] **Step 3: Run to verify they fail** (modules missing) and log it.
- [ ] **Step 4: Implement both modules**, then make the renderer's `computePerceptualHash` delegate and delete `MediaViewer.blockhash`. Add `import * as MainThreadHash from './main-thread-hash.js';`. Re-read the comment at ~L9423, which now has to name `main-thread-hash.js`.
- [ ] **Step 5: Remove the dependency** with `npm uninstall blockhash`. Then grep `require('blockhash'` and `from 'blockhash'` across the repo (excluding `node_modules`): 0 hits.
- [ ] **Step 6: Lint wiring.** Add the two modules to ESLint block 2c and to `RENDERER_FILES`.
- [ ] **Step 7: Docs.**
  - CLAUDE.md tree: `perceptual-hash.js # The one blockhash (both hash routes import it)` and `main-thread-hash.js # Today's hash route (the pool's fallback and parity reference): hashFile, hashImageUrl, makeCanaryImages`.
  - CLAUDE.md § Data Structures: "Perceptual hashing (image similarity)" → "Perceptual hashing (`blockhash` in `perceptual-hash.js`, the one copy both routes import)".
  - `PROJECT.md` External Dependencies: the row becomes `| perceptual hash | Image similarity | the app's own block-mean hash, perceptual-hash.js |`.
  - `README.md:73` and `PROJECT_CONTEXT.md:36`: "blockhash-js" → "own block-mean hash (`perceptual-hash.js`)".
- [ ] **Step 8: Verify** with `npx vitest run` (all green, including `video-release.test.js` and `similarity-sort-glue.test.js`, which still mock `computePerceptualHash`) and `npm run lint`. Measure `wc -l media-viewer.js` and log it.
- [ ] **Step 9: Commit** `refactor: one blockhash module; today's hash route out of the renderer (G2 PR 2 T2)`.

## Task 3: The hash worker (the measured F4 route)

**Files:**
- Create: `hash-worker.js`, `tests/hash-worker.test.js`
- Modify: `eslint.config.mjs` (3a-jxl), `tests/perceptual-hash.test.js` (the `it.todo` becomes real), `CLAUDE.md` (tree)

**Interfaces:**
- Produces (ESM; also loaded as a module worker):
  - `sniffImageType(bytes: Uint8Array): 'jpeg'|'png'|'gif'|'webp'|null`:
    - `FF D8` → jpeg; `89 50` → png; `47 49` → gif;
    - bytes 0–3 `RIFF` with bytes 8–11 `WEBP` → webp;
    - anything else, or too few bytes, → `null`.
  - `isYuvFormat(format: string|null): boolean`: exactly `!!format && /^(I4|NV|I2)/.test(format)`.
  - `hasIccProfile(bytes: Uint8Array, type): boolean`, for the parity report only:
    - JPEG: an APP2 segment starting `ICC_PROFILE\0` before SOS;
    - PNG: an `iCCP` chunk before `IDAT`;
    - WebP: an `ICCP` chunk;
    - GIF: `false`.
  - `hashBytes(buffer: ArrayBuffer, { wantPixels = false } = {}): Promise<{ hash, info: { type, format, icc }, pixels? }>`: the route below. It throws `Error('Unrecognised image bytes')` when `sniffImageType` returns `null`.
- Message protocol:
  - In: `{ type: 'hash', id: number, url?: string, bytes?: ArrayBuffer|Uint8Array, wantPixels?: boolean }`. With `url`, the worker does `fetch(url)`, throws `HTTP <status>` unless `res.ok`, and reads `arrayBuffer()`.
  - Out: `{ type: 'result', id, ok: true, hash, info, pixels? }`, with `pixels` (the read-back's `ArrayBuffer`) transferred; or `{ type: 'result', id, ok: false, error: String(message) }`.
- The handler is installed only in a worker: `if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)`. In Vitest the module imports cleanly.

The route is copied from the measured spike (`spike/page/worker.js`, `w-hybrid`) and narrowed to spec § 5.2:

```
type = sniffImageType(bytes)        // null → throw 'Unrecognised image bytes'
canvas = new OffscreenCanvas(256, 256); ctx = canvas.getContext('2d')
jpeg|webp: decoder = new ImageDecoder({ data: buffer, type: 'image/' + type })
           image = (await decoder.decode({ frameIndex: 0 })).image; format = image.format
           isYuvFormat(format) ? ctx.drawImage(image, 0, 0, 256, 256)
                               : draw createImageBitmap(new Blob([buffer], { type: 'image/' + type }))
png|gif:   draw createImageBitmap(blob)
close image, bitmap and decoder in finally; data = ctx.getImageData(0, 0, 256, 256); hash = blockhash(data, 16)
```

- [ ] **Step 1: Write the failing tests** in `tests/hash-worker.test.js`.
  - `sniffs by the bytes, not the name`: real JPEG, PNG, GIF and WebP buffers from `sharp` (`create` a 16×16 image, then `.jpeg()`, `.png()`, `.gif()`, `.webp()`); WebP bytes sniff `webp` whatever the file is called; `RIFF` followed by `WAVE` → `null`; 3 bytes → `null`.
  - `the YUV test is the measured one`: `I420`, `I422`, `I444` and `NV12` → true; `BGRA`, `BGRX`, `RGBA` and `null` → false.
  - `detects an embedded ICC profile`: `sharp(...).withIccProfile('p3')` JPEG, PNG and WebP → true; the same without a profile → false.
  - `importing the module installs no handler outside a worker`.
  - Source pins on `hashBytes`'s body: it contains `new OffscreenCanvas(256, 256)` and `getContext('2d')`; the file contains no `willReadFrequently`, `resizeWidth` or `desiredWidth`. **Mutation**: add `{ willReadFrequently: true }`; the pin fails (and so does T7's E2E).
  - Make `both routes import the one blockhash` (T2) real.
- [ ] **Step 2: Run to verify it fails** and log it.
- [ ] **Step 3: Implement `hash-worker.js`.**
- [ ] **Step 4: Run to verify it passes.** Add the file to ESLint 3a-jxl and to the CLAUDE.md tree (`hash-worker.js # Module worker: bytes → sniffed type → ImageDecoder YUV frame or createImageBitmap → fresh OffscreenCanvas → blockhash (the measured F4 route)`).
- [ ] **Step 5: Commit** `feat: hash worker on the measured F4 route (G2 PR 2 T3)`.

## Task 4: The hash pool

**Files:**
- Create: `hash-pool.js`, `tests/hash-pool.test.js`
- Modify: `eslint.config.mjs` (2c), `tests/lint-guard.test.js`, `CLAUDE.md` (tree; one Active gotcha)

**Interfaces:**
- Consumes: T3's protocol; T2's `hashImageUrl`/`makeCanaryImages`, injected.
- Produces:
  - `POOL_SIZE`, `WORKER_TASK_TIMEOUT_MS`, `CANARY_TIMEOUT_MS`.
  - `isVideoPath(path)`: `/\.(mp4|webm|mov)$/i`, today's test.
  - `class HashPool`:
    - `constructor({ size = POOL_SIZE, createWorker, hashOnMainThread, hashMainUrlPixels, makeCanaryImages, getJxlPngBytes, isJxl, toMediaUrl, taskTimeoutMs = WORKER_TASK_TIMEOUT_MS, canaryTimeoutMs = CANARY_TIMEOUT_MS })`;
    - `size`: the slots it may run;
    - `mainOnly`: set after a failed canary or a worker that could not be created;
    - `checkCanary(): Promise<{ ok: boolean, detail: string }>`;
    - `hashFiles(paths, { signal = null, route = 'auto' } = {}): AsyncGenerator<HashResult>`;
    - `terminate(): void`, idempotent.
  - `HashResult`: `{ path, hash: string|null, route: 'worker'|'main'|'none', info?: { type, format, icc }, error?: string }`.

Behaviour (the decisions T4's tests pin):
- **Routes**:
  - `'auto'`: a video goes to today's route. An image goes to a worker, unless the pool is `mainOnly`. A worker failure goes on to today's route, and a failure there yields `{ hash: null, route: 'none', error }`.
  - `'worker'` (parity): workers only, even when `mainOnly`. A failure yields `route: 'none'`, and a video yields `{ hash: null, route: 'none', error: 'video' }`.
  - `'main'`: today's route only.
- **Dispatch**:
  - At most `size` worker tasks are in flight. Today's-route calls run one at a time, in their own lane, beside the workers.
  - Results are yielded in completion order and buffered while the consumer awaits something else.
  - Workers are created lazily, one per slot, kept for the pool's life and never shared across pools.
  - An image task posts `{ type: 'hash', id, url: toMediaUrl(path) }`. A JXL task (`isJxl(path)`) first awaits `getJxlPngBytes(path)`, then posts `{ type: 'hash', id, bytes }` **with no transfer list**. A failed JXL decode goes to today's route.
- **Recovery (E9)**: a worker `error` event or a task past `taskTimeoutMs` terminates that slot's worker (the next task respawns it) and re-queues the file at the front, once. A second failure on the same file goes to today's route (`'auto'`) or yields `none` (`'worker'`). If `createWorker()` throws, the pool sets `mainOnly` and sends the file to today's route.
- **Stop**: when `signal` aborts or the consumer stops (`return()`), the pool stops dispatching, terminates every worker and ends the iteration without yielding further results. An in-flight today's-route call is not awaited; its settlement is caught and dropped.
- **Canary (B1)**, run once per pool (memoized):
  - For each `makeCanaryImages()` image, run today's route on `URL.createObjectURL(blob)` through `hashMainUrlPixels(url)` (revoke the URL after), and a worker task `{ bytes: await blob.arrayBuffer(), wantPixels: true }` under `canaryTimeoutMs`.
  - `ok` only if every worker task succeeded, every hash pair is equal, and every pixel pair is byte-equal (262,144 bytes).
  - `detail` reads, per image, `canary-jpeg: <n> bytes differ, <b> bits` or `canary-jpeg: worker error: <message>`, joined with `; `.
  - On failure, set `mainOnly`.

- [ ] **Step 1: Write the failing tests** in `tests/hash-pool.test.js`. A `FakeHashWorker` records `postMessage(message, transfer)`, can `reply(id, result)`, `crash()` and `hang()`, and counts `terminate()`. Fake timers drive the timeouts.
  - `hashes every image through the workers, at most size at a time`: 10 paths, size 3; at most 3 unanswered tasks ever; 10 results, each with route `worker`.
  - `a video goes to today's route and never to a worker`.
  - `a worker failure falls back to today's route; a failure there yields none`.
  - `a crashed worker is replaced and its file re-queued once; a second crash sends it to today's route`.
  - `a worker that does not answer in time is terminated, replaced, and its file re-queued once`.
  - **Review Focus #2** `abort ends the iteration at once and terminates every worker`: 3 hung tasks; abort; `next()` resolves `{ done: true }` within the test's 1 s guard; every fake reports `terminated`; nothing more is posted. **Mutation**: delete the abort listener.
  - `the consumer stopping early terminates every worker and dispatches nothing more`.
  - `route 'worker' never falls back, even when mainOnly; route 'main' never uses a worker`.
  - **Review Focus #3** `JXL bytes are posted as a copy, never transferred`: `getJxlPngBytes` returns a 64-byte `Uint8Array`. The post's transfer argument is `undefined` or empty, and the source still has `byteLength` 64 after posting. **Mutation**: pass `[bytes]` (or `[bytes.buffer]`).
  - `an image is fetched by its media URL`: the posted `url` equals `toMediaUrl(path)` for `C:\\d\\100% #1 фото.jpg`.
  - `a worker that cannot be created sends every file to today's route`.
  - Canary:
    - `the canary passes when hashes and pixels match`;
    - `the canary fails on a one-byte pixel difference even with equal hashes` (B1's case);
    - `fails when a worker errors or times out`;
    - `runs once per pool`;
    - `after a failed canary, 'auto' sends every image to today's route`.
- [ ] **Step 2: Run to verify it fails** and log it.
- [ ] **Step 3: Implement `hash-pool.js`.**
- [ ] **Step 4: Run to verify it passes**, then run Review Focus #2 and #3's mutations and log both runs of each.
- [ ] **Step 5: Wiring and docs.**
  - ESLint 2c and `RENDERER_FILES` gain `hash-pool.js`.
  - CLAUDE.md tree: `hash-pool.js # Per-run pool of hash workers: today's route as the fallback, a pixel-exact canary, crash/timeout re-queue, abort`.
  - New Active gotcha (one line): "The hash route's parity rests on its recipe: a fresh 256×256 canvas, `getContext('2d')` with no options, a stretched `drawImage`, the sniffed type (some `.png` files are WebP), never `willReadFrequently` or a reused canvas. The canary compares pixels, because a raster-path change can leave hashes equal (spec § 17 B1). Never transfer a `jxlFrameCache` buffer to a worker."
- [ ] **Step 6: Commit** `feat: hash pool with fallback, recovery and a pixel canary (G2 PR 2 T4)`.

## Task 5: The run and the placement hash through the pool

**Files:**
- Create: `tests/hash-pool-harness.js`
- Modify: `media-viewer.js` (`handleSortBySimilarity` ~L7352–7363 confirm and ~L7639–7731 hash phase; the perf note ~L7860–7866; `insertNewFilesInSortedOrder` ~L8709–8732 and its header comment ~L8636; new `_createHashPool`, `_reportHashCanaryFailure`), `tests/similarity-sort-glue.test.js`, `tests/media-viewer-utils.test.js`, `tests/integration/cached-sort-path.test.js`, `CLAUDE.md` (§ Async Patterns, the similarity-sort bullets), `docs/ARCHITECTURE.md` (§ Similarity Sorting Flow, first box)

**Interfaces:**
- Consumes: T4's `HashPool`, `POOL_SIZE`, `isVideoPath`; T2's `MainThreadHash.hashImageUrl` and `makeCanaryImages`.
- Produces:
  - `MediaViewer._createHashPool(): HashPool`, which passes:
    - `createWorker: () => new Worker('hash-worker.js', { type: 'module' })`;
    - `hashOnMainThread: (p) => this.computePerceptualHash(p)`;
    - `hashMainUrlPixels: (url) => MainThreadHash.hashImageUrl(url, { wantPixels: true })`;
    - `makeCanaryImages: () => MainThreadHash.makeCanaryImages()`;
    - `getJxlPngBytes: async (p) => (await this.decodeJxl(p)).frames[0].pngBytes`;
    - `isJxl: (p) => this.isJxl(p)` and `toMediaUrl: MediaUrl.toMediaUrl`.
  - `MediaViewer._reportHashCanaryFailure(detail)`: the canary notice plus the `logError` line (Global Constraints).
  - `tests/hash-pool-harness.js`: `fakeHashPool(hashFn, { size = 3, route = 'worker', canary = { ok: true, detail: 'fake' } } = {})` returns `{ size, mainOnly: false, checkCanary: vi.fn(async () => canary), hashFiles: vi.fn(async function* (paths, { signal = null } = {}) { … }), terminate: vi.fn() }`. Its `hashFiles` walks `paths` in order, returns when `signal?.aborted`, and yields `{ path, hash: await hashFn(path), route }`, or `{ path, hash: null, route: 'none', error }` when `hashFn` throws.

The new hash phase. The order is the point; the names are today's. Declare `workerHashes = 0`, `fallbackHashes = 0`, `poolSize = 0` and `canaryFailed = false` beside `newHashes`; the `finally` that builds the perf note reads them.

```js
const toHash = run.snapshot.filter((f) => !this.perceptualHashes.has(f.path)).map((f) => f.path);
let processed = total - toHash.length;
phaseMs.hash = 0;
if (toHash.length > 0) {
    const pool = this._createHashPool();
    poolSize = pool.size;
    const phaseStart = performance.now();
    let savesMs = 0;
    try {
        const canary = await pool.checkCanary();
        this._assertSimilarityRunLive(run);
        if (!canary.ok) { canaryFailed = true; this._reportHashCanaryFailure(canary.detail); }
        for await (const r of pool.hashFiles(toHash, { signal: run.controller.signal })) {
            this._assertSimilarityRunLive(run); // before the result is stored
            // processed++; skipped, or store + newHashes/newSinceSave and worker/fallback counts by r.route;
            // the progress update exactly as today (every 5, and at the end)
            if (r.hash !== null && SimilaritySort.isHashSaveDue({ newSinceSave, lastSaveAt, now: Date.now() })) {
                newSinceSave = 0; // first: a Cancel during this save does not save these hashes again
                lastSaveAt = Date.now();
                // time saveHashes() into the 'save' phase and into savesMs, then _assertSimilarityRunLive(run)
            }
        }
        this._assertSimilarityRunLive(run); // an abort ends the iteration without a throw
    } finally {
        pool.terminate();
        phaseMs.hash += performance.now() - phaseStart - savesMs;
    }
}
```

`insertNewFilesInSortedOrder`'s hash path follows the same pattern before its placement loop:
1. Collect `missing` (new files with no hash).
2. If any: create a pool, `await pool.checkCanary()`, then `assertLive()`; on a failure, call `_reportHashCanaryFailure`.
3. `for await (const r of pool.hashFiles(missing))`: `assertLive()` before the store; progress `{ phase: 'Hashing new files', current, total }` every 10 and at the end. Then `assertLive()` after the loop, and `finally { pool.terminate(); }`.
4. The placement loop is today's, minus its hashing. A file with no hash still goes to the end.

There is no `signal`: the caller's `isLive` is the only check, and a stale placement stops at its next result.

- [ ] **Step 1: Write the failing tests** in `tests/similarity-sort-glue.test.js` (`describe('the run hashes through the pool (PR 2 T5)')`). Give `runCtx` a recording `_createHashPool` built on `fakeHashPool((p) => this.computePerceptualHash(p))`.
  - `hashes the snapshot's unhashed paths through one pool, with the run's signal`: `/f/b` pre-hashed. One pool is made, and `hashFiles` gets `['/f/a', '/f/c']` and `{ signal: ctx.sortAbortController.signal }` (captured during the call).
  - `makes no pool when every file is hashed`: the perf note reads `new 0, worker 0, fallback 0, skipped 0, pool 0`.
  - `counts worker and fallback hashes in the perf note`: the fake yields route `worker` for `/f/a`, `main` for `/f/b`, and `none` for `/f/c`. The note reads `new 2, worker 1, fallback 1, skipped 1, pool 3`.
  - `a failed canary is reported once, and the note says so`: one `⚠️ Background hashing check failed — hashing on the main thread` warning, one `logError`, and the note ends `, canary failed`.
  - `a run made stale during the canary check shows nothing and terminates its pool`.
  - `the pool is terminated on every ending`: done, cancelled, failed and stale (`it.each`).
  - `a Cancel during a periodic save does not save the same hashes twice` (closes the PR 1 deferred note). 1,001 files; the 1,000th result's save aborts the run. `saveHashCache` is called exactly once. **Mutation**: reset `newSinceSave` after the save, not before; it is called twice.
  - `the confirm over 1,000 files says the work runs in the background`: the exact string (Global Constraints).
  - Every existing run context in the file gets the same `_createHashPool`. The perf-note assertion becomes `'new 3, worker 3, fallback 0, skipped 0, pool 3'`.
  - `media-viewer-utils.test.js`: the placement contexts gain `_createHashPool`, plus `placement hashes the missing new files through one pool before it places any`. **Review Focus #4**: the stale-placement test also asserts `pool.terminate` was called. Run mutations A and B and log them.
  - `cached-sort-path.test.js`: `_createHashPool: vi.fn()`, and `expect(ctx._createHashPool).not.toHaveBeenCalled()` in its 3 tests.
- [ ] **Step 2: Run to verify they fail** and log it.
- [ ] **Step 3: Implement** in `media-viewer.js`. Add `import * as HashPool from './hash-pool.js';`. Re-read `insertNewFilesInSortedOrder`'s header comment, which named the hash as one of its awaits.
- [ ] **Step 4: Run to verify they pass.** `npx vitest run` is all green, `tests/like-or-skip-glue.test.js` included.
- [ ] **Step 5: Docs.**
  - CLAUDE.md § Async Patterns, the similarity-sort bullet list, gains one bullet: "Hashing runs in a per-run `HashPool` (B4): the run's loop stores each result only after `_assertSimilarityRunLive(run)`, a failed canary sends the run to today's route with one notice, and the pool is terminated in the hash phase's `finally`".
  - ARCHITECTURE.md's first flow box becomes "Hash workers (pool) hash the snapshot's images; videos and failures fall back to today's route (or load from `.hash_cache.json`)".
- [ ] **Step 6: Measure** `wc -l media-viewer.js` and log it.
- [ ] **Step 7: Commit** `feat: the similarity sort hashes through the worker pool (G2 PR 2 T5)`.

## Task 6: Parity mode (`MV_HASH_PARITY=1`)

**Files:**
- Create: `hash-parity.js`, `tests/hash-parity.test.js`
- Modify: `main.js` (`createWindow`'s `win.loadURL(INDEX_URL)` ~L254; a startup log line), `media-viewer.js` (constructor field; `handleSortBySimilarity`'s parity branch; `_runHashParity`), `tests/similarity-sort-glue.test.js`, `eslint.config.mjs` (2c), `tests/lint-guard.test.js`, `CLAUDE.md` (tree; § Build & Development Commands, one line beside `MV_USER_DATA_DIR`)

**Interfaces:**
- Consumes: `HashPool.hashFiles` with `route: 'worker'` and `route: 'main'`, and `checkCanary`.
- Produces (`hash-parity.js`):
  - `readParityFlag(search: string): boolean`: `new URLSearchParams(search).get('hashParity') === '1'`.
  - `PARITY_MAX_RATE = 0.005` and `MAX_PARITY_DETAIL_LINES = 200`.
  - `runHashParity(pool, paths, { signal, onProgress, isJxl, videos }): Promise<Report>`:
    1. Run `checkCanary()`, recorded but not enforced.
    2. The worker pass: `hashFiles(paths, { signal, route: 'worker' })`, timed.
    3. The main pass: `hashFiles(paths, { signal, route: 'main' })`, timed.
    4. Then `classifyParity`.

    `onProgress(phase, current, total)` reports with the phases `Parity: background route` and `Parity: today's route`. An abort returns the partial report with `outcome: 'cancelled'`; it never throws for an abort.
  - It imports `isYuvFormat` from `./hash-worker.js` and keeps no second copy of the YUV test. Importing that module outside a worker installs no handler (T3).
  - `classifyParity(rows)`, where each row is `{ name, kind, worker: { hash, info } | { error }, main: { hash } | { error } }` and `kind` is `'jxl'` for a JXL path, else the worker's `info.type`. It returns `{ images, compared, identical, diff1, diff2plus, rate, verdict, diffs, workerFailures, mainFailures }`:
    - each diff is `{ name, bits, cls: 'accepted'|'defect', type, format, icc }`;
    - accepted means `bits === 1 && (type === 'jpeg' || (type === 'webp' && isYuvFormat(format)))`;
    - the verdict is `pass` only when no diff is a defect and `rate <= PARITY_MAX_RATE`;
    - `compared` counts rows where both routes produced a hash;
    - `rate = (diff1 + diff2plus) / compared`, or 0 when nothing was compared.
  - `formatParityLines(report, { folder }): string[]`:
    - the summary: `` `Hash parity: outcome=${outcome} verdict=${verdict} images=${images} compared=${compared} identical=${identical} diff1=${diff1} diff2plus=${diff2plus} rate=${(rate * 100).toFixed(2)}% workerFailed=${n} mainFailed=${n} videos=${videos} canary=${pass|fail} | worker=${ms}ms (pool ${size}) | main=${ms}ms | order=worker,main | folder=${folder}` ``;
    - then, in this order: `Hash parity diff: ${name} bits=${bits} class=${cls} type=${type} format=${format ?? '-'} icc=${yes|no}`, `Hash parity worker-failed: ${name} error=${error}` and `Hash parity main-failed: ${name} error=${error}`;
    - at most `MAX_PARITY_DETAIL_LINES` detail lines, then `Hash parity: ${n} more lines not written`.
- `main.js`:
  - `await win.loadURL(process.env.MV_HASH_PARITY === '1' ? \`${INDEX_URL}?hashParity=1\` : INDEX_URL);`;
  - and, when set, `console.log('Hash parity mode: on (MV_HASH_PARITY=1)')` at startup.
  - The navigation lock and the IPC guard stay unchanged: main's `loadURL` fires no `will-navigate`, and `pageId` drops the query (F15).
- `MediaViewer`:
  - `this.hashParityMode = HashParity.readParityFlag(globalThis.location?.search ?? '')` in the constructor;
  - `this.lastHashParityReport = null`;
  - `async _runHashParity()`, called from `handleSortBySimilarity` right after the `< 2` files check, before the 1,000-file confirm.

  `_runHashParity` in order:
  1. Collect the images (`!HashPool.isVideoPath`).
  2. **Always** show the parity confirm; on a decline, return with nothing started.
  3. Dismiss any offer, then take a run: `{ gen: ++this._similarityRunGen, folder, controller }`.
  4. Set `isComputingHashes`, `sortAbortController` and the button's `Cancel` label, as the sort does.
  5. Create the pool, `runHashParity(...)`, and terminate the pool in its `finally`.
  6. If the run is stale, write nothing. Otherwise write each line through `window.electronAPI.logPerf?.(line)`, set `lastHashParityReport`, clear the card, and post the done or cancelled notice.
  7. In `finally`, release the flags and restore the label as the sort does.

  It never calls `saveHashCache`, `saveSortCache`, `runSortingWorker` or `_offerSimilarityOrder`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/hash-parity.test.js`:
    - `readParityFlag`: `'?hashParity=1'` → true; `''` and `'?hashParity=0'` → false.
    - `classifyParity` (B6):
      - all identical → pass;
      - 1 one-bit JPEG in 1,000 → pass, accepted 1;
      - a one-bit PNG → fail;
      - a two-bit JPEG → fail;
      - a one-bit WebP with format `BGRA` → fail, with `I420` → pass;
      - a one-bit JXL → fail;
      - 5 one-bit JPEGs in 1,000 → pass (0.50%, the boundary), 6 → fail (0.60%);
      - rows with a failed route are not compared and are listed.
    - `formatParityLines`: the exact summary for a fixed report; 250 differing rows → 200 detail lines plus `Hash parity: 50 more lines not written`.
    - `runHashParity` with `fakeHashPool`: the worker pass runs before the main pass, with routes `'worker'` then `'main'`; videos are excluded and counted; the canary is recorded, not enforced; an abort mid-pass returns `outcome: 'cancelled'` with the counts so far.
  - In `tests/similarity-sort-glue.test.js`, `describe('parity mode (PR 2 T6)')`:
    - **Review Focus #5** `parity mode always asks first, and declining starts nothing`: 3 files; `confirm` returns false; `_createHashPool` is not called and `isComputingHashes` stays false. **Mutation A**: ask only above 1,000 files.
    - `a parity run writes no cache, sorts nothing and offers nothing`: `saveHashCache`, `saveSortCache`, `runSortingWorker` and `_offerSimilarityOrder` are never called; the summary is passed to `logPerf`; `lastHashParityReport` is set; the done notice is posted.
    - `a stale parity run logs and notifies nothing`.
    - `Cancel posts ❌ Parity check cancelled and logs the partial summary`.
- [ ] **Step 2: Run to verify they fail** and log it.
- [ ] **Step 3: Implement** `hash-parity.js`, the `main.js` flag and the renderer glue. Add `import * as HashParity from './hash-parity.js';`.
- [ ] **Step 4: Run to verify they pass**, then run Mutation A and log both runs.
- [ ] **Step 5: Wiring and docs.**
  - ESLint 2c and `RENDERER_FILES` gain `hash-parity.js`.
  - CLAUDE.md tree: `hash-parity.js # MV_HASH_PARITY=1 diagnostic: both routes on every image, D4 classes, perf-log report`.
  - CLAUDE.md, beside `MV_USER_DATA_DIR`: "`MV_HASH_PARITY=1` makes the next similarity sort a parity check (both hash routes, no cache, report in `media-viewer-perf.log`); unset it before a normal run."
- [ ] **Step 6: Commit** `feat: in-app hash parity diagnostic (G2 PR 2 T6, spec D5)`.

## Task 7: E2E — parity, canary, encoding, responsiveness, parity mode

**Files:**
- Create: `tests/e2e/fixtures/hash-fixtures.js`, `tests/e2e/hash-parity.test.js`
- Modify: `tests/e2e/helpers/electron-app.js` (`launchApp`), `tests/e2e/similarity-sort.test.js` (`gateHashing`)

**Interfaces:**
- Produces: `generateHashFixtures(dir): Promise<string[]>`, the generated file names. It is ported from `spike/gen.js` (this session's scratchpad) using the repo's `sharp`, with the same seeded `photo()` and these files:
  - JPEG: `plain-1200x900.jpg`, `exif-rot3.jpg`, `exif-rot6.jpg`, `exif-rot8.jpg`, `icc-p3.jpg`, `icc-p3-rot6.jpg`, `cmyk.jpg`, `progressive.jpg`, `chroma444.jpg`, `gray.jpg`, `large-6000x4000.jpg`, `pano-8000x2000.jpg`, `odd-257x255.jpg`;
  - PNG: `large-4000x3000.png`, `alpha.png`, `alpha-small.png`, `png16.png`, `palette.png`, `tiny-40x30.png`;
  - WebP and GIF: `lossy.webp`, `alpha.webp`, `still.gif`, `alpha.gif`, `animated.gif`, `animated.webp`;
  - plus `misnamed-webp.png` (the lossy WebP's bytes under a `.png` name), and copies of `static.jxl` and `animated-64x64.jxl` from `tests/e2e/fixtures/`;
  - plus the Review Focus #1 names `100% #1 фото.jpg` and `a&b=c;d.png`.

  Everything is generated at test time into the test's temp folder, so nothing new is committed (the § 14 builder's call). Generation runs once per file, in `beforeAll`.
- `launchApp({ migrationMarker, env = {} } = {})`: the env becomes `{ ...process.env }` with `MV_HASH_PARITY` deleted, then the test's `env` spread over it.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/hash-parity.test.js`. One launch per describe; grant and load the generated folder. Inside `page.evaluate`, a test may `await import('./main-thread-hash.js')` and `new Worker('hash-worker.js', { type: 'module' })` directly.
  - `every fixture hashes the same on both routes`: for each image, `viewer.computePerceptualHash(p)` equals the hash from `viewer._createHashPool().hashFiles([p], { route: 'worker' })` (the pool, so the two JXLs take their frame-0 PNG path). Pixel identity per non-JXL fixture (a direct worker task with `wantPixels`, against `hashImageUrl(…, { wantPixels: true })`) is **recorded** in `test.info().annotations`, not asserted (spec § 11.3).
  - `the canary passes on this machine`: `await viewer._createHashPool().checkCanary()` → `ok: true`.
  - **Review Focus #1** `file names that need encoding are hashed by the worker`: wrap `_createHashPool` to record each result's route; both names → route `worker`, with hashes equal to `computePerceptualHash`'s.
  - `a sort hashes images in the workers and keeps the app usable`:
    1. Gate the pool's results with the `gateHashing` wrapper.
    2. Start the sort; wait for result 2 at the gate.
    3. `nextMedia()` moves the index.
    4. Like the file on screen; it leaves the list.
    5. Open the gate. The run ends in the sticky offer; Show applies.
    6. The liked file is absent from `mediaFiles`. Every recorded route for an image is `worker`, and `computePerceptualHash` was called 0 times for images.
  - `parity mode via MV_HASH_PARITY`:
    1. `launchApp({ env: { MV_HASH_PARITY: '1' } })`, then 6 generated images plus `playable-64x64.mp4`.
    2. `window.confirm = () => true`, then `await viewer.handleSortBySimilarity()`.
    3. `lastHashParityReport` reads verdict `pass`, `compared` 6, `identical` 6, `videos` 1. Neither `.hash_cache.json` nor `.sort_cache.json` exists, the order is unchanged, and there is no `.notification.sticky`.
  - **Review Focus #5 (E2E half)** `a normal launch is not in parity mode even when the shell sets MV_HASH_PARITY`: set `process.env.MV_HASH_PARITY = '1'` in the test process, call `launchApp()`, and expect `hashParityMode` to be `false`; restore the variable in `finally`. **Mutation B**: remove the `delete`.
- [ ] **Step 2: Re-point `gateHashing`** in `tests/e2e/similarity-sort.test.js`: it wraps `viewer._createHashPool` so each pool's `hashFiles` yields result 1 and holds result 2 and later at `window.__hashGate`, counting into `window.__hashCalls`. The file's 11 tests are otherwise unchanged.
- [ ] **Step 3: Run** `npx playwright test tests/e2e/hash-parity.test.js tests/e2e/similarity-sort.test.js` and log the results. A test that passes before its feature exists counts as a RED that passed: find out why.
- [ ] **Step 4: The acceptance mutation** (spec § 11.5). In `hash-worker.js`, use `getContext('2d', { willReadFrequently: true })`. **`every fixture hashes the same on both routes` and `the canary passes on this machine` must both fail.** B1 predicts the canary fails; F3 measured 6 of 25 fixtures differing. Log the failing fixture names. Restore with `git checkout -- hash-worker.js`, then run Review Focus #1 and #5's mutations and log them.
- [ ] **Step 5: Stability.** Run `hash-parity.test.js` 3 times, then the full E2E suite (`npx playwright test`; `sort-progress`, `security-csp-walk` and `security-ipc` must pass). Log the totals.
- [ ] **Step 6: Commit** `test(e2e): hash parity, canary, encoding, responsiveness and parity mode (G2 PR 2 T7)`.

## Task 8: Measure the pool size (controller)

No production change unless the measurement moves `POOL_SIZE`. Scratch scripts stay in the session scratchpad.

- [ ] **Step 1: Sample.** Pick 600 image paths from `Liked_3` with a fixed seed: 450 `.jpg`, 120 `.png`, 15 `.gif`, 15 `.webp`. It has no hash cache, and nothing is written there. Read every file once with Node first, so every configuration meets a warm OS cache; "cold" here means a fresh Electron process with empty decode caches (memory `session_2026-10-19-g2-hash-sort-brainstorm`).
- [ ] **Step 2: Measure.** Write a scratch Playwright script on the E2E helpers. For each of `main`, 1, 2, 3 and 4, in **its own fresh `launchApp()`**:
  1. `grantFolder(app, Liked_3)`, with no `loadFolder`.
  2. In the page, create the pool (`new HashPool.HashPool({ size })` through `viewer._createHashPool` with the size patched, or `route: 'main'` for `main`) and hash the sample.
  3. Record the wall time, the main-thread lateness of a 16 ms `setInterval` (p50, p99, max), and the peak working set across `app.getAppMetrics()`, sampled every 500 ms.
- [ ] **Step 3: Decide.** Take the smallest N within 10% of the best throughput, provided its p99 lateness is ≤ 50 ms. Log the table in the Progress Log and spec § 17. If N ≠ 3, change `POOL_SIZE`, run `tests/hash-pool.test.js` and `hash-parity.test.js`, and commit `perf: pool size N, measured (G2 PR 2 T8)`.
- [ ] **Step 4: Estimate the smoke.** From the `main` row, estimate parity mode's frozen second pass on `Liked_2`'s ~15,590 images, and put the figure in the smoke instructions.

## Finish (after Task 8)

- [x] `npx vitest run` passes 2,246, with 1 skipped (pre-commit at `9068c27`).
  - `npm run lint`: 0 errors, plus 2 warnings that were already there. One error appears only inside another session's `.claude/worktrees/v2-modules` copy, which is not part of this branch.
  - Prettier is clean on every changed file.
- [x] Full `npx playwright test` on the final code (`9068c27`; later commits change docs only): **220 passed, 6 skipped, 0 failed, 13.3 min**. The full log is in the session scratchpad, `e2e-full-final.log`. T7's earlier run, at `0e1f335`, under load, was 219 passed in 29.4 min.
- [x] `wc -l media-viewer.js`: **11,879 at `bf5ec84` → 11,904 at `9068c27` (net +25).**
  - Out: the hash route (`computePerceptualHash`'s body and `blockhash`, ~150 lines).
  - In: the pool and canary orchestration, the parity glue (+81) and the bulk-rated save warning.
  - The new hashing code is in its own modules: `hash-pool.js` 555, `hash-worker.js` 186, `hash-parity.js` 211, `main-thread-hash.js` 206, `perceptual-hash.js` 40, `atomic-write.js` 101.
- [x] Grep sweep: done by the final fix wave (F9). Its re-review grepped `[Tt]oday['’]s` repo-wide and found no route mention left in code, tests or `CLAUDE.md`.
- [x] The `regression-checker` and the final whole-branch review (Opus · `max`) ran, then one fix wave (`9068c27`) and its scoped re-review. All findings were addressed. Three new minors are parked for BACKLOG (Progress Log).
- [ ] Push with `git push -u origin g2-pr2-background-hashing` (pre-push runs E2E). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [ ] Open the PR: spec and plan links; B1–B9; RED → GREEN and the mutation runs per task; the T8 table; test deltas; `wc -l`; the Residuals. **Ask the user** before any `/code-review` here (default: a separate chat at `max`), and ask them to start `/claude-security` → *Scan changes*. Merge only on the user's go-ahead, after the smoke passes.

## The user's smoke (`Liked_2`, ~15,649 files, cold) — on the branch, before merge

**On the branch head after the review fixes** (review round 1, 2026-10-24): it changes the pool and the run's hashing code, so a smoke on an earlier head would not test what merges. It has not run yet: no `Hash parity:` line is in the perf log as of 2026-10-24.

**When**: set for **Friday 2026-10-23** at plan approval (the user's choice), and not run then; now on a date the user sets, on the head after the review fixes. WEEKLY had planned Thursday 2026-10-22, the day this plan was written, when PR 2 was not built yet. If the branch is not ready on Friday, tell the user before Friday ends and agree a new date; the WEEKLY G2 entry then gets a `**Spillover**` line.

1. **Parity.** `$env:MV_HASH_PARITY='1'; npm start` → open `Liked_2` → Sort by Similarity (VP-Tree) → confirm → wait. Then read the `Hash parity:` lines in `%APPDATA%\media_viewer\logs\media-viewer-perf.log`.
   - The first pass runs on workers and stays responsive: about 47 ms per image at pool 3 (T8), so **~12 minutes**.
   - The second pass runs on the main thread and **freezes the app**: about 95 ms per image (T8), so **~25 minutes**.
   - Reading `Liked_2` cold from disk may add time to both, since T8 measured with a warm OS cache.
   - Do not cancel. A cancelled run logs `verdict=incomplete` and has to be run again.
   - **Pass**: all of `outcome=done`, `verdict=pass`, and every `Hash parity diff:` line `class=accepted`. Also note `workerFailed=`: each worker failure becomes a main-thread hash in a normal run. A `canary=fail` line comes with a `Hash parity canary:` line giving the reason.
2. **Close the app, then `$env:MV_HASH_PARITY=$null`** (or open a new shell).
3. **Normal run, cold.** `npm start` → open `Liked_2` → Sort by Similarity. While it hashes:
   - browse;
   - rate a few files and undo one;
   - switch to compare and back;
   - change K.

   Keep Task Manager open on the memory column (R2).
   - A short hitch about every 1,000 hashes is the periodic hash-cache save (about 5 MB of JSON late in the run). Note whether you feel it.
   - Afterwards, the session log (`%APPDATA%\media_viewer\logs\media-viewer-<date>.log`) names each file that fell back to the main-thread route (`Hash worker: … -> hashed on the main route`) or failed (`Hash failed:`), at most 20 per run plus a count. A long list is a finding.
   - **Pass**: no stall you notice; "Similarity order ready — Show" appears at the end; Show applies the order; the rated files are absent; the undone file is present.
4. **Timing.** Compare the `Similarity sort:` line of step 3 (`hash=… (new …, worker …, fallback …, pool …)`) against step 1's `worker=`/`main=` times. `fallback` includes `Liked_2`'s 60 videos, which always use the main-thread route. A fallback count far above 60 means images fell back too.

A failure at step 1 is a D4 finding: stop and decide with the user (R1's option B is the known remedy). A stall at step 3 makes T8's pool size, or R3, the first suspect.

## Improvements (minimum 2 required before Extract)

1. **Re-check the canary during a long run.** It runs at the start of each run only. A GPU-process restart mid-run (a driver reset) could move the workers' canvases to another raster path for the rest of the run, unseen. A re-check at each periodic save (about every 1,000 hashes, ~100 ms) would bound the exposure to one save interval. 🟤 candidate.
2. **Move the other two tmp + rename writers onto `atomic-write.js`.** `writeTournamentState` and `write-ml-model-cache` still use one fixed `.tmp`, which is safe today only because their callers serialize. `writeTournamentState` writes the source folder and can share main's writer. `write-ml-model-cache` writes `userData`, which `assertFixedPath` refuses (it is no granted folder), so it needs a second writer instance with its own link check (PR #87 review, held back). Together they close BACKLOG "Three atomic-write IPC handlers share one fixed `.tmp` path" (the feature-cache writer stays on its streaming path). Effort: S. 🟤 candidate.
3. **The off-thread decoder for the AI sort** (spec § 12; `loadMediaAsImageData` on the main thread). Needs its own parity proof on feature vectors. 🟤 candidate.

## Residuals for Extract (found while designing and planning — not fixed here)

- **Videos still hash on the main thread** (spec non-goal). `Liked_2` holds 60, so each run spends a few seconds of main-thread work on them, spread across the run. → BACKLOG 🟤 only if the smoke shows a stall.
- **Bulk-rated saves can still land out of order** (T1 review, minor 1; pre-existing) → BACKLOG 🟤, flagged as irreplaceable data.
  - The renderer fires an un-awaited `saveBulkRatedFile()` from `removeFileFromList` (`media-viewer.js:1491`), and a later save can overtake it. The IPC guard's async `grantedPath` check runs before the writer's per-target chain, so two overlapping saves can reach the chain in the opposite order.
  - The next save rewrites the whole in-memory map, so a newest rating is lost only if the app quits first.
  - Fix: a coalescing single-flight `saveBulkRatedFile` in the renderer.
- **The committed 1×1 E2E PNG fixtures are malformed** (found in T5; pre-existing) → BACKLOG 🟤.
  - `red-1x1.png` and `green-1x1.png` have a bad IDAT CRC and an invalid zlib stream. `blue-1x1.png` cannot even be walked as chunks.
  - Chromium's `<img>` tolerates them, but `createImageBitmap` rejects them ("The source image could not be decoded"). So the worker falls back on them, as designed, and every E2E built on them exercises only today's route.
  - Fix: regenerate them in `tests/e2e/fixtures/generate.js` with correct CRCs and deflate (`zlib.deflateSync`), then re-run the E2E suite.
- **From the final reviews → BACKLOG 🟤, one entry per line** (whole-branch review M-numbers, regression check R-numbers):
  - M7: only the first worker is canary-checked. Slots 2–3, and replacement workers after a crash, never are. Fold into Improvement #1: run the canary JPEG on each new worker.
  - ~~M9 / R1: the cache-hit placement's pool gets no abort signal.~~ **Fixed in review round 1** (PR #87 review #10, #11; spec B14): not for BACKLOG.
  - M11: the worker reads a whole file before it checks the type. A misnamed huge video is read in full, twice with the retry.
  - M12: nothing stops repeated worker crashes. After K crashes in a row, set `mainOnly` and log once.
  - M14: the periodic `saveHashCache` costs ~50–150 ms of main-thread time late in a 15.6k run (5 MB of JSON plus 15.6k bridge calls). Watch for it in the smoke, then decide.
  - M10: the perf note's `fallback` count includes videos. Split it out.
  - R3: the 1,000-file confirm says "keep using the app", but acting turns the auto-apply into Show, and some actions refuse. It is the spec's approved copy (my call 8), so reword only if the user wants it.
  - M6's companion: the bulk-rated warning now exists (F8). The ordering Residual above still stands.
  - The fix wave's re-review: three comments (`hash-pool.js` at `checkCanary()` and `terminate()`; the test "terminate() settles a pending canary as failed") give a false reason for `terminate()` settling a canary. It is defence in depth; R-F4a's timeout is what bounds the wait.
  - The fix wave's re-review: `tests/e2e/hash-parity.test.js:355` (`state.after > 0`) races the cancellation's own close. It can fail loudly, never falsely.
  - The fix wave's re-review: `terminate()` leaves an armed canary timer and its slot live for ≤ `canaryTimeoutMs` on a dead pool. (Its second half, "a Cancel during the canary waits ≤ ~25 s", is fixed **for the sorts** by review round 2 #3: `hashThroughPool` races that wait with the signal. A Cancel during the **parity check's** canary still waits ≤ ~25 s, because `runHashParity` awaits it unraced. That is accepted, since parity mode is a bounded diagnostic (review round 3 #1).)
  - The deferred task-loop minors the whole-branch review triaged as BACKLOG: T1–T7 (the SDD ledger's list, copied at closeout).
- **A ratings save fails while another program blocks writing to `.bulk_rated.json`** (the user's ruling 2026-10-24: record it, no change in PR #87) → BACKLOG 🟤, flagged as irreplaceable data.
  - Measured 2026-10-24, 3 saves each: a reader sharing read only fails every save with `EBUSY`, and a read-only file fails every save with `EPERM`. The overwrite fallback (B12) helps only a holder that allows writing. Before this PR every save failed the same way.
  - The user sees one warning per folder visit, naming the folder. The ratings stay in memory and the next rating retries, but ratings since the last good save are lost if the app closes first. Today's remedy: close the other program, then rate again.
  - A constraint on the `userData` candidate (review round 3): its merge on load must respect ratings cleared or undone after the fallback copy was written. An absent-only merge would bring them back, the PR #84 trap (memory `feedback_idempotent_is_not_retry_safe`).
  - Fix candidates: retry a failed save every few seconds until it succeeds, in the renderer's `saveBulkRatedFile` (S), so closing the other program is enough. Or keep a fallback copy in `userData` when the folder save fails and merge it on the next load (M; touches `main.js` IPC, so it needs a security pass).
- **The pool on a network share** (PR #87 review #3; recorded, not fixed) → BACKLOG 🟤. Plausible, not measured: T8 sized the pool on a local folder.
  - If a share drops mid-sort, each of the 3 worker reads and the main lane holds one of main's 4 libuv threads in `fs.realpath` for the ~21 s SMB timeout, so every other filesystem call in main (moves, cache reads and writes) waits until they return. The one-at-a-time loop held one.
  - On a ~1–2 MB/s link, three concurrent reads can push a 15–25 MB photo past the 30 s task timeout; it is read again, then skipped.
  - No data is harmed: a skipped file is placed at the end, uncached, and hashed again by the next sort.
  - First step: measure on a real share (a dropped one and a slow one). Candidate remedies, after measuring: one worker for a network folder, or a fetch timeout separate from the decode's.
- **B7's ruling** → append to BACKLOG [2026-10-21] "A per-run hash map".
- **BACKLOG [2026-10-11] "Make `write-folder-cache` atomic"** → check it off at closeout, if T1 ships.
- **BACKLOG "Three atomic-write IPC handlers share one fixed `.tmp` path"** → append: `write-folder-cache` and `writeBulkRatedFile` now use unique names (B2), and Improvement #2 covers the remaining two.
- **BACKLOG [2026-10-21] "A Cancel during a hash save re-saves the same entries"** → check it off at closeout if T5's test ships.
- **Spec § 12's "to file at closeout" items, not yet in BACKLOG** (checked 2026-10-22; PR 1's closeout did not file them) → BACKLOG 🟤:
  - today's hashes depend on the GPU raster path and drift across Chromium updates (F3, F6);
  - `insertNewFilesInSortedOrder`'s placement loop scans the whole list per new file on the main thread (my call 12);
  - the off-thread decoder for the AI sort, which is Improvement #3.

## Closeout (after the merge, on `main`)

- [ ] **Extract**: Improvements and Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] From: G2 PR 2 closeout`. Check off the entries T1 and T5 closed, in the closeout commit.
- [ ] **Transition**: TODO 🔴 "Speed up AI / similarity sorting…" → PR2 slice done; the item closes if PR1–PR3 are all in (its note). DONE.md entry. WEEKLY: G2's Summary-Table Status → `✅ PR #N`, plus its Daily-Schedule rows. GOALS Objective 1's 🔴 KR is for G5 to record.
- [ ] **Archive** this plan (`git mv` to `docs/archive/plans/`, indexed under Archived Plans); remove its Active rows.
- [ ] **Spec**: § 17 gains a post-implementation note for anything the code departed from.
- [ ] **Propagation check**: re-read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `PROJECT.md` and the changed comments for a late correction that did not reach them.
- [ ] **Memory**: a session file and its MEMORY.md line; durable lessons only.
- [ ] **Next**: G3 (ZoomManager), which waits for this merge.

## Progress Log

- **2026-10-22** — Branch `g2-pr2-background-hashing` from `bf5ec84` (PR #86 merged `654fb3e` 2026-10-22). `wc -l media-viewer.js` = 11,879 at `bf5ec84` (12,190 at PR 1's merge `f668611`).
- **2026-10-22** — Planning measurements, each in a fresh Electron 39.1.2 process, GPU `2d_canvas`/`rasterization` enabled:
  - **Canary probe (B1).** Seven canvas-encoded candidates (JPEG 320×240/1024×768/512×512, alpha PNG 320×240/1024×768, opaque PNG 640×480, WebP 640×480). Worker vs today's route: 0 bytes differ, on all seven. Worker with `willReadFrequently` vs today's: 122,380 / 129,995 / 94,659 / 122,572 / 238,796 / 101,984 / 115,941 bytes differ, with hashes differing on only 2 of 7 (2 and 4 bits).
  - **Minimized window (E15).** Worker vs today's: 0 bytes differ on all seven.
  - **F4 re-check.** The spike's 25 fixtures, `A` vs `w-hybrid`: 25/25 pixels, 25/25 hashes.
  - **The real folders**, counted read-only:
    - `Liked_1`: 13,211 files, with a hash cache;
    - `Liked_2`: 15,649 files, no hash cache (11,254 jpg, 3,748 png, 436 jpeg, 141 gif, 60 mp4, 7 webp);
    - `Liked_3`: 16,270 files, no hash cache.
- **2026-10-22** — The user relayed a side agent's note: `.bulk_rated.json` is written with a plain `fs.writeFile` (`main.js:618-628`, verified), and its ratings exist nowhere else. Folded into T1 (B2), with per-target write ordering.
- **2026-10-22** — **Plan approved** by the user ("Looks good"), with bulk-rated in the atomic writer and the npm `blockhash` removal. Execution is subagent-driven (the brief's model split). **Smoke set for Friday 2026-10-23** (the user agreed to Friday).
- **2026-10-22** — **T1** `ba6a9f9` (Opus · medium; the controller commits).
  - RED: `Cannot find module '../atomic-write.js'`.
  - The 5 named mutations each failed their named test: a direct write, no per-target chain, a fixed tmp name, no `assertPath(tmp)`, and `'w'` for `'wx'`. Reverting either handler to `fs.writeFile` failed its source pin.
  - Unit: 2,084 passed, 1 skipped. `security-ipc.test.js`: 23 passed, 0 skipped, the planted-link write included. `ml-retrain-skip.test.js` (bulk-rated round trips): 5 passed.
  - Review: approved, with 5 minors deferred. One became a Residual: the renderer's order of bulk-rated saves.
- **2026-10-22** — **T2** `19b81cd` (Sonnet · medium).
  - Known vectors came from the renderer's `blockhash`. `media-viewer.js` is unchanged between `bf5ec84` and `f9914d6`, the capture point.
  - RED: the modules were missing. Both named mutations (`willReadFrequently`, a hoisted canvas) failed the canvas-recipe test.
  - Unit: 2,124 passed, 1 skipped, 1 todo (the worker half of the single-source test, for T3). `app-launch` E2E: 5/5, so the page boots with the new modules.
  - **`wc -l media-viewer.js`: 11,879 → 11,736.**
  - Review: approved, with 7 minors deferred. The largest: the JXL test does not pin that the URL is revoked after load.
- **2026-10-22** — **T3** `2ce6ab6` (Sonnet · medium).
  - RED: the module was missing. The `willReadFrequently` mutation failed the canvas pin and the banned-options pin.
  - Unit: 2,131 passed, 1 skipped.
  - **The controller's runtime smoke** ran in the real app with a scratch E2E, deleted afterwards:
    - a PNG through its app-scheme URL hashed the same as `computePerceptualHash`;
    - a canvas JPEG sent as bytes decoded as `I420`, with 0 of 262,144 pixel bytes different and the same hash;
    - junk bytes returned `Unrecognised image bytes`.
  - **Finding**: Chromium's canvas JPEG encoder embeds an sRGB ICC profile in an APP2 segment, so spec § 9.2's "no color profile" is wrong as a fact. B1 had already measured that JPEG pixel-exact, so the canary design stands (spec note at closeout).
  - Review: approved, with 6 minors deferred.
- **2026-10-22** — **T4** `6d253db` + review fix `7179365` (Opus · medium).
  - RED: the module was missing. Review Focus #2's mutation (no abort listener) timed out at the 1 s guard. #3's mutation (`[bytes]` and `[bytes.buffer]` transfer lists) failed the copy assertion.
  - **The task review found a hang** (Important, probe-confirmed): a freed slot woke only the run that freed it, so a second run on a shared pool waited forever.
    - Ruling R-T4a: every freed slot wakes every live run, at completion, at a stopped run's early return and in the canary's release.
    - Also pulled in: the canary could reject instead of failing safe (R-T4b), and "`ok:false` is not retried" asserted nothing that could fail (R-T4c).
  - Fix round 1:
    - 5 new tests, each RED on `6d253db`.
    - The canary now holds one slot across both images and waits for one when every slot is busy.
    - The scoped re-review found all three findings addressed, plus 3 new minors that apply only when a run overlaps the canary. The worst: a failed canary releases its slot before it sets `mainOnly`.
    - The planned order (canary first, on a fresh pool) never overlaps them.
  - Unit: 2,177 passed, 1 skipped. `hash-pool.js` is 460 lines; the review judged that size warranted.
- **2026-10-22** — **T5** `f0a9c23` (Opus · medium).
  - RED: 12 glue tests and 2 utils tests failed, the PR 1 double save among them ("got 2 times"). All three named mutations failed their tests.
  - Unit: 2,190 passed, 1 skipped. `sort-progress` E2E: 2 passed, but with `worker 0, fallback 3`.
  - **Finding**: the 1×1 fixtures are malformed PNGs, so the worker rejects them and falls back (Residuals). T7 uses sharp-made fixtures and asserts the worker route.
  - **`wc -l media-viewer.js`: 11,810** (11,879 at the base).
  - **The task review found the post-loop liveness check unpinned** (Important, probe-confirmed). The plan specified a fake that yields after an abort, which the real pool never does, so every Cancel test was caught by the in-loop check instead. Deleting the post-loop check broke no test, yet it brought back the double save and let a stale run write the hash cache.
  - Ruling R-T5a: the fake now follows the pool's contract, and two production-shaped run tests pin the check. Both fail with the check deleted. R-T5b–d pulled in three minors.
  - Fix `eae61f7` touches tests and one doc line only. Unit: 2,193 passed, 1 skipped. The re-review verified every mutant independently.
- **2026-10-22** — **T6** `c6fe9d5` (Opus · medium).
  - RED: 28 tests failed. Mutation A (confirm only above 1,000 files) failed Review Focus #5's unit test.
  - **Pre-review correction R-T6a**, from the implementer's own concern: the plan's verdict rule let a run that compared nothing read `verdict=pass`, a false pass at the smoke. `pass` now also needs `compared > 0`; dropping that conjunct fails the new test.
  - `tests/ipc-guard.test.js`'s `loadURL` pin was re-pinned to the parity ternary. The review confirmed it still guards "the page main loads is the page the guard trusts".
  - Unit: 2,236 passed. `media-viewer.js`: 11,891 (+81 lines of parity glue).
  - Review: approved, with 7 minors. Two are flagged to fix before the smoke: a cancelled report can read `verdict=pass`, and the canary's failure detail is dropped in parity mode.
- **2026-10-22** — **T7** `0e1f335` (Sonnet · medium).
  - 30 fixtures are generated at test time: 28 are compared, 26 of them non-JXL.
  - New and re-pointed E2E: 17/17. Three stability runs of `hash-parity.test.js`: 6/6 each. Full E2E: **219 passed**, 6 skipped, in 29.4 min. The tournament flake did not occur.
  - Pixel identity: 26 of 26 non-JXL fixtures identical (recorded, not asserted).
  - **Acceptance mutation** (`willReadFrequently` in the worker): the parity test failed on 7 of 28 fixtures (`icc-p3.jpg`, `large-6000x4000.jpg`, `pano-8000x2000.jpg`, `odd-257x255.jpg`, `alpha.png`, `alpha-small.png`, `alpha.webp`), and the canary failed. The Review Focus #1 and #5-B mutations failed as intended.
  - **Gate blocker**: the pre-commit Vitest gate refused the commit. 4–5 git-spawning hook tests timed out, a different set on each run, because another session's model benchmarks held the CPU at 100%; 5 git calls took 4.1 s. Fixed in `bb6f4d8` with BACKLOG [2026-10-11]'s own remedy, a 30 s timeout on those two describes, rather than skipping the check.
  - Review: 1 Important. The re-pointed gate made an unchanged Cancel test depend on which of three workers answers first. Fix round 1 is running.
- **2026-10-22** — **The final reviews** of `bf5ec84..5a33a87`.
  - The `regression-checker` (Opus) found no Critical or Important issue, with 693 focused tests passing. Its 3 minors include one it could not measure: a worker terminated mid-`fetch` might leave a file open, so a later move fails with `EBUSY`.
  - The whole-branch review (Opus · `max`) returned **with fixes**: 0 Critical, 1 Important and 14 minors. The Important finding: a cancelled parity run logged `verdict=pass`, the smoke's own pass word. Two of its minors were mine to correct:
    - the end-of-phase save still double-saved on a Cancel, because T5 fixed only the periodic site;
    - the canary had no end-to-end time limit, so the "bounded" reasoning I accepted at T5 was wrong.
  - It also triaged every deferred minor.
- **2026-10-22** — **The final fix wave** `9068c27` (Opus · medium), F1–F9:
  - verdict `incomplete` for a cancelled parity run;
  - a canary detail line;
  - the end save resets its counter first;
  - the canary is bounded end to end, and `mainOnly` is set before its slot is released;
  - `gray.jpg` is truly 1-component;
  - a failed bulk-ratings save warns once per folder visit;
  - the "today's route" wording sweep.
  - Two measurements came out clean:
    - **F6**: a 16,500-px panorama hashes identically on both routes (`I420`), so it stays as a fixture.
    - **F7**: a 256 MB read cut off by `terminate()` closed 6–8 ms later in 3 runs, and the file then moved. A control showed that an unread 300 MB response stays open, so the check can fail.
  - Unit: 2,246 passed, 1 skipped. E2E (`hash-parity` + `similarity-sort`): 18/18.
- **2026-10-22** — **T8**, pool size, run by the controller at 12:23 once the machine was quiet. The other session's model benchmarks had held the CPU at 100% for about 2 hours.
  - The sample was 597 `Liked_3` images, read-only and pre-read with Node: 450 jpg, 120 png, 15 gif, and 12 webp (all `Liked_3` has).
  - Each configuration ran in a fresh `launchApp()`. The grant went to the throwaway E2E store: no `loadFolder`, nothing written to the folder.

    | Config | Wall | Per image | Lateness p99 / max | Peak working set |
    | --- | --- | --- | --- | --- |
    | main-thread route only | 56.9 s | 95 ms | 325 / 487 ms | 858 MB |
    | pool 1 | 59.2 s | 99 ms | 15 / 91 ms | 1,017 MB |
    | pool 2 | 34.2 s | 57 ms | 15 / 187 ms | 1,332 MB |
    | pool 3 | 28.0 s | 47 ms | 15 / 197 ms | 1,640 MB |
    | pool 4 | 22.9 s | 38 ms | 14 / 120 ms | 2,041 MB |

  - Every worker image took the worker route. The canary passed at every size, with 0 bytes differing.
  - **Ruling: `POOL_SIZE` stays 3**, against Step 3's rule, which picks 4.
    - Why: the rule weighs throughput and lateness but not memory, which is spec risk R2. Pool 4 costs about 400 MB more at peak, on a 15.2 GB machine with 1.2 GB free during the run. Pool 3 is still 2× the main-thread route's throughput, at the same p99.
    - Cost if wrong: a cold `Liked_2` run takes about 2 minutes longer, and it is one constant to change.
  - Smoke estimate from these figures: worker pass ≈ 12 min, frozen main-thread pass ≈ 25 min.
- **2026-10-22** — Line references in the brief: BACKLOG.md:617 → the entry is at :644 ("Make `write-folder-cache` atomic"); BACKLOG.md:801 → :828 ("Three atomic-write IPC handlers share one fixed `.tmp` path"). Cited by title from here on (memory `feedback_cite_backlog_by_title`).
- **2026-10-22** — Pushed; **PR #87** opened. Another session's research commit (`96d9b22`), made in this checkout, had reached it; with the user's approval it moved to its own branch, `research/local-ai-sorting`, and the PR branch went back to `b7e07f9` (a PR comment says so).
- **2026-10-24** — **Review round 1** (`/code-review max`, a separate chat; 15 findings, 8 held back, plus one remark found only in the reviewer's session text: a cache hit's placement hashes were not saved on a Cancel). Commits: `e3c2fae` (full E2E: 221 passed, 6 skipped, 0 failed), then `8683896`, the recovery copy (224 passed, 6 skipped, 0 failed). Both full runs were the pre-push hook's. Spec § 17 B11–B14.
  - **#1 JXLs**: hash-initiated JXL decodes queue in the renderer (`_decodeJxlForHash`), and a run puts one JXL on its workers at a time (B11). Each turn is bounded at the main route's 30 s, found on my own re-read: `decodeJxl` arms its timer only at the post, after the worker's init, which has no timeout, and a decode that never settled would have held the queue for the session. Not measured on a real large JXL (none in the folders; the E2E JXLs are 64×64); pinned by unit tests instead.
  - **#2 a held-open target**: reproduced first-hand. With another process holding `.bulk_rated.json` open, the rename failed with `EPERM` after 648–664 ms, whether or not the reader shared it for delete; an in-place write succeeded both times. After the fix the same probe saved in 681 ms and left no tmp (B12). The flush is best effort (held back #8).
    - **The user's ruling (2026-10-24)**: a side agent pointed out that the in-place fallback is not crash-safe. Of the three options offered, the user chose "Overwrite + recovery copy" over "Plain overwrite" and "Fail with a warning".
      - The writer keeps its whole tmp until the in-place write is complete.
      - `readBulkRatedFile` reads the newest tmp that parses when `.bulk_rated.json` does not, never when it is missing.
      - The renderer writes a recovered file back at once.
      - The sweep runs only after a successful write.
    - Tests: 4 unit tests and a new E2E, `bulk-rated-recovery.test.js` (3 tests). Mutations: 5 unit and 3 E2E, all failing their tests. My first missing-file mutant was the wrong shape (it removed the early return, but recovery was still gated on `SyntaxError`); it survived, and the corrected one, which recovers on `ENOENT`, fails the test.
  - **#3 network shares**: recorded, not fixed (Residuals): plausible, unmeasured, and no data at risk.
  - **#4–#15**: fixed as the reviewer proposed. Each fix has a test that fails with the fix removed:
    - #4: the non-YUV frame and its decoder close before `createImageBitmap`.
    - #5: `media-url.test.js` now derives the set of files the page loads, and fails on the reviewer's mutant.
    - #6: `icc-p3-rot6.jpg` now carries the same P3 profile as `icc-p3.jpg`. With it, the `willReadFrequently` acceptance mutation fails 8 of 28 fixtures instead of 7: `icc-p3-rot6.jpg` is the new one.
    - #7: each worker fallback and failure is logged, with its file and reason.
    - #8: the bulk-ratings warning belongs to the visit its save started in.
    - #9: every spelling of `MV_HASH_PARITY` is dropped. The old code put a lowercase launch into parity mode (measured).
    - #10: every gen bump aborts the old gen's placement pools.
    - #11: one pool sequence, `HashPool.hashThroughPool`, used through the run's hooks (B14).
    - #12: one run per pool, and the canary as the `'auto'` run's first step. This replaces R-T4a (B13); the six multi-run tests became the one-run tests.
    - #13: the canary uses `HASH_CANVAS_SIZE` and the shared `countDifferences`. At a canvas size of 128, the fix passes and the old literal fails 2 tests.
    - #14: `hashFile` imports `isVideoPath`.
    - #15: the HTML-sink guard covers the module workers.
  - **Held back**:
    - fixed: the parity check shares the run's button state; Improvement #2's text; the `CLAUDE.md` CJS rule; the BACKLOG pointer; the duplicated draw recipe; the flush.
    - pushed back: the sweep's three `readdir`s run once per file per launch, in main's async I/O; buffered results dropped on a Cancel are intended.
  - **Mutations**: every named mutation failed its test.
    - 36 ran through the runner in the session scratchpad (`mutate.cjs`): it applies one, runs the suite, restores the file, and prints a sentinel. This count includes the pool-sequence mutations run again after the code moved to `hash-pool.js`.
    - 3 ran by hand: the canvas size, the env spelling, and the acceptance mutation.
  - Unit: 2,246 → **2,285** passed, 1 skipped. `hash-parity` + `similarity-sort` E2E: 19/19.
  - **`wc -l media-viewer.js`: 11,904 → 11,935 (+31).** The shared pool sequence lives in `hash-pool.js` (555 → 668 lines), with a delegate in the renderer.
- **2026-10-24** — **Review round 2** (the re-review of `26874e2`): 8 findings and 18 held back. The reviewer accepted 21 of round 1's 23 answers and partly re-raised two, as round-2 findings #2 and #3. Each fix went RED first: its test failed on `26874e2`.
  - **#1 tmps left by a failed open**: reproduced the class by unit test (3 failed saves left 3 tmps). Fixed: the in-place write opens the target first (`'w'`), and the tmp becomes the recovery copy only after that open succeeds. A first-hand probe after the fix, 3 saves each:
    - a reader sharing read only: `EBUSY`, 0 tmps;
    - a read-only file: `EPERM`, 0 tmps;
    - a reader sharing write: saved in place, 0 tmps.
  - **#4 no flush before the tmp goes**: fixed in the same shape. The target's handle is flushed (best effort) before the tmp is removed, and a test pins the order.
  - **#2 the JXL queue moves on at frame 0**: fixed. The queue now waits for the entry's `whenComplete`, bounded at 30 s like the frame. Pinned with a fake pending stream; the real-body timing model was the reviewer's.
  - **#3 a stop-wake that cannot fire**: fixed. `hashThroughPool` races its own wait for the canary with the signal (`untilAborted`), so a Cancel during a sort's canary ends the call at once; that retires the Residual's "≤ ~25 s" half for the sorts. The parity check still awaits its canary unraced, which is accepted: it is a bounded diagnostic. The race inside `hashFiles` is removed, its wait made plain and bounded, and its test now pins that behaviour.
  - **#5–#8, docs**:
    - "the one way" now names the parity check as the other caller;
    - B10's last bullet is back under B10;
    - the status lines in `docs/README.md`, `plans/README.md`, this plan's header and spec line 5 are updated;
    - CLAUDE.md is trimmed by 477 bytes (65,886 at `b7e07f9`, 67,055 at `26874e2`, 66,578 now), with the history parenthetical gone.
  - **Held back**: 1 fixed (a throwing `onProgress` left `onResult`'s promise unawaited). The rest are pushed back, agreeing with the reviewer's own drop or doubt, with reasons in the PR comment.
    - My first test for that fix passed on the old code, so it covered nothing. Every save rejected, so the call failed at the first result, before the throwing progress call at the fifth. Only the fifth save fails now, and the old code fails the test.
  - **Mutations**: 7 named, run through the runner, all failing their tests:
    - the flag set before the open;
    - no flush;
    - the tmp removed on a cut-short write;
    - the queue moving on at frame 0;
    - the stream wait unbounded;
    - the canary wait not raced;
    - the save left unawaited, which failed its test only once the test was fixed.
  - Unit: 2,285 → **2,292** passed, 1 skipped. Full E2E at `bd515b2` (the pre-push hook): **224 passed**, 6 skipped, 0 failed.
  - `wc -l media-viewer.js`: **11,942** (+38 over `b7e07f9`).
- **2026-10-24** — **Review round 3** (the re-review of `8f7eb87`): all of round 2's answers accepted, 1 new finding, 5 held back.
  - **#1**: two records called the canary-Cancel fix complete, though it covers the sorts only. Both now say "for the sorts" and record the parity check's accepted wait (≤ ~25 s, a bounded diagnostic), so Extract carries it: this plan's Residual and log, spec B13, and two test comments. Comments and docs only.
  - The reviewer's note on the new Residual is recorded there: a `userData` fallback's merge must respect ratings cleared or undone since its copy was written.
  - Held back: all 5 pushed back, as the reviewer dropped or doubted them.

## Key Discoveries

- **A hash-equality canary cannot see a raster-path change.** The CPU path changed ~100k bytes of every candidate's read-back, but a median-split 256-bit hash absorbs most ±1 shifts: 5 of 7 hashes stayed identical, including both images the spec named. The detector has to compare what the change touches, the pixels, not the summary the change mostly leaves alone (B1).
- **Unique tmp names stop a tear, not a reorder.** Two overlapping saves with distinct tmps each rename whole, but the older one can land last. For `.bulk_rated.json` that loses the newer rating, so the writer also serializes per target (B2).
