# G2 Hash Sort Off the Renderer Thread — Design Spec

**Task Reference**: WEEKLY.md Oct 19–23 § G2 (🔵 🏆, 8 SP → **~13 SP**, see § 13) ← TODO 🔴 [2026-06-18] "Speed up AI / similarity sorting on large folders (24k+ files)", slice PR2 (manual testing; user priority "speed these up first")
**Created**: 2026-10-19
**Status**: Approved by the user on 2026-10-19 ("Design looks right"), my calls 1–12 included. Brainstormed with the user the same day (decisions D1–D7, § 3). The builder check is done: its four questions were answered as my calls 3, 11 and 12 and as D7. Amended at PR 1 planning (§ 15, A1–A9). **PR 1 implemented: PR #85, merge `f668611` (2026-10-20)**; the execution notes are in § 16. **PR 2 planned 2026-10-22** on `g2-pr2-background-hashing`; its planning amendments are § 17 (B1–B9).
**Branch**: `g2-hash-sort-off-renderer` (from `main` @ `bfc4cbf`) for PR 1; PR 2 on a new branch after PR 1 merges (D7, § 13.1)

Items marked **(my call)** were decided by Claude during the brainstorm. They were not put to the user, and are listed together at the end of § 3 for review.

---

## 1. Goal

When the similarity sort (VP-Tree, MST, Simple) meets images with no saved hash, it hashes them one by one on the
renderer's main thread. On a large folder that freezes the app for many minutes, in stalls of up to a second per
image (F2). Move that work to background workers, so the app stays fully usable while a sort hashes.

**Why now**: it is the last open slice of the user's June "speed these up first" report and GOALS Objective 1's
only 🔴 Key Result. The user does not use the similarity sort day to day (F8). The payoff is closing that item and
making the sort usable on big folders, not a speed-up the user will feel in daily use (the user's framing).

**Success**:
- During a cold-cache hash of a 15k-image folder, the user can browse, rate, undo, switch between single and compare,
  and change settings with no stalls.
- The hashes match today's under the D4 bar.
- The finished order waits behind a "Show" button.
- No file the user moved during the run comes back, and none goes missing.

---

## 2. Findings that shaped the design

Code references are to `main` @ `bfc4cbf`. The spike measurements were taken on 2026-10-19 with a throwaway
Electron 39.1.2 harness. It reproduced the app's scheme privileges and `webPreferences`, with no extra
command-line switches (the app sets none). It read 1,020 real images from the user's `Liked_1` and `Liked_2`
folders (read only) and 25 generated fixtures. GPU feature status: `2d_canvas`, `gpu_compositing` and
`rasterization` all `enabled`.

| #   | Finding | Consequence |
| --- | ------- | ----------- |
| F1  | **Today's route** (`computePerceptualHash`, `media-viewer.js:7457`): `<img>` (or `<video>` seeked to 0.1 s; JXL via `decodeJxl` → frame-0 PNG → object URL → `<img>`) → a **fresh** 256×256 `<canvas>`, default 2D context → `drawImage` stretched → `getImageData` → `blockhash(imageData, 16)` (`:7573`) → a 256-character `0`/`1` string. Files are hashed one at a time (`:7319`), and the cache is saved only after the whole loop (`:7365`), so a cancel loses every hash computed. | The reference the new route must match. |
| F2  | **The freeze, measured** (595 `Liked_1` images, cold, own process): `drawImage` + `getImageData` block the main thread for a median **37 ms** (p90 114 ms, p99 355 ms, max **0.93 s**). 220 of 595 images block for over 50 ms, ≈ 1 minute of blocking per 1,000 images. The decode happens inside that synchronous draw. | The work to move. |
| F3  | **Today's hashes depend on the GPU raster path.** Forcing the CPU path (`willReadFrequently: true`) changed 6 of 25 fixture hashes. | Parity can only be defined between two routes run on the same machine, build and session (D4, D5). |
| F4  | **The measured route.** In a worker, WebCodecs `ImageDecoder` turns a JPEG or lossy WebP into a YUV `VideoFrame` (`I420`/`I422`/`I444`), drawn onto a fresh `OffscreenCanvas` (the GPU converts, as for an `<img>`). Any other frame format (`BGRA`/`BGRX`: PNG, GIF, alpha WebP, CMYK JPEG) is decoded with `createImageBitmap(blob)` instead. **Results**: fixtures 25/25 pixel-exact; `Liked_1` 592/592 hashes identical; `Liked_2` 399/400 (one **1-bit** difference). About 95% of images are pixel-exact. The rest differ by **at most 1 level**, of two kinds: (a) JPEGs with an embedded color profile, mostly in blue across the whole image; (b) a few edge pixels, often only the bottom row. | D4's accepted exception; D6's route. |
| F5  | **Routes that fail.** `createImageBitmap(blob)` alone: JPEGs off by up to 19 levels, 32/595 hash misses. `createImageBitmap(img)` transferred to a worker: software path, 11/25 exact, and it blocks the main thread for up to 175 ms. `img.decode()` before the draw: **no** reduction in block time (median 38 ms, max 1.1 s, cold), because the canvas decodes again. An `OffscreenCanvas` on the main thread drawing an `<img>` is pixel-exact: the source, not the canvas type, decides. | No main-thread shortcut exists; drop it. |
| F6  | **Today's route is not fully repeatable.** Two processes: pixels 589/595, hashes 595/595. Against `Liked_1`'s `.hash_cache.json` (written December 2025 by an older build): **581/595** hashes. Twelve differ by 1–4 bits (Chromium updates); two differ by a lot (likely edited files). | No stored cache can be the parity reference (D5). |
| F7  | **Extensions lie.** Three `Liked_1` files named `.png` are lossy WebP. `ImageDecoder` needs the real type: with the extension's type it fails; with the type sniffed from the first bytes, all three are pixel-exact. | Sniff, never trust the extension (§ 5.2). |
| F8  | **Usage.** The user's perf log (Oct 13–15) holds 10 AI sorts and no similarity sort. Only `Liked_1` (~13.2k files) has a `.hash_cache.json`; `Liked_2` (~15.6k) and `Liked_3` (~16.3k) have none. | The smoke runs on `Liked_2`, cold (§ 11.4). |
| F9  | **Nothing stops the user during a run today**, apart from the freeze. Only the bulk dislike (`:5045`), a `skipBatch` undo (`:5317`), Tournament entry (`:5650`) and the AI sort (`:9572`) refuse while `isComputingHashes`. The loop walks the **live** `this.mediaFiles` (`:7319`), which a move splices mid-iteration. | A responsive UI makes every one of these races real (§ 7). |
| F10 | **The run's end paths resurrect files.** Cancel or failure restores the pre-sort snapshot (`:7424`), which brings back files moved during the run. Restore Order (`:7163`) restores `originalMediaFiles` **unfiltered**, which brings back files moved after the sort (the AI path at least filters, `:9585`). The result is applied without `_waitForRenderIdle` (`:7396`, `:7448`). These are BACKLOG 🟤 [2026-10-12] G2-closeout items 14, 19 and 20. | Closed by construction (§ 7, § 8). |
| F11 | **A folder switch during a run.** `loadFolder` aborts through the shared `sortAbortController` (`_abortInFlightPredictionSort`, `:3167`). The similarity sort's `catch` then writes `this.mediaFiles` (`:7425`), and its saves read `this.baseFolderPath` at write time. If the in-flight image outlasts the new folder's listing, the old snapshot lands in the new folder. | A run token on every write (§ 6.4). |
| F12 | **Settings are read late.** `this.sortAlgorithm` is read after hashing (`:7384`) and again at the save (`:7401`). K is read from `localStorage` (`:7379`). A change mid-run sorts with one algorithm and saves under another's key. | Capture at start (§ 7). |
| F13 | The cache-hit path's new-file placement (`insertNewFilesInSortedOrder`, `:7976`) also hashes on the main thread. | Same route (§ 6.5). |
| F14 | **No new IPC is needed.** The app scheme serves any top-level `.js` (`app-protocol.js` `TOP_LEVEL_FILE`). The CSP has `worker-src 'self'` and `connect-src 'self'`, so a worker can `fetch` `app://media-viewer/@fs/…` through the same media-read rule as `<img>`. | No `main.js` or `preload.js` change for the route itself. |
| F15 | `ipc-guard.js` compares the sender URL without its query or fragment (`:16`), so `main.js` can load `INDEX_URL` with a query flag. | The parity switch needs no `preload.js` change (§ 9). |
| F16 | VP-Tree and MST are deterministic given the hashes (the vantage point is `items[0]`). Simple samples with `Math.random()` (`sorting-worker.js:336`). | An order comparison is meaningful for VP-Tree/MST only. |
| F17 | `showNotification(msg, type, { actionButton, actionCallback })` exists (`:1290`), but `info`/`success` toasts close after 2 s. | The "Show" message needs a sticky option (§ 8). |

---

## 3. Decisions (2026-10-19 brainstorm)

| #  | Question | Ruling |
| -- | -------- | ------ |
| D1 | Spend the slot on the similarity sort, given the user only uses the AI sort? Its waits are dominated by cache re-reads (~108 s of a 165 s sort, BACKLOG 🟤 "`MlTrainingManager` retains no vectors…" and "source-folder feature cache load ~25 s"). | **Yes, the similarity sort** (user): the AI-sort waits stay in BACKLOG until planned. |
| D2 | What may the user do while a run hashes? | **Everything, as usual** (user): rate/move, skip, undo, switch single↔compare, change settings. |
| D3 | What happens when the run finishes mid-use? | **Nothing moves** (user approved the proposal): the order is saved, and a sticky **"Similarity order ready — Show"** message appears. Show applies it, starting from the file that was current when Sort was pressed. Dismissed, it costs nothing: pressing Sort later loads the saved order instantly. |
| D4 | What does "quality must not change at all" (the user's 2026-06-19 constraint) mean? | **Zero hash differences expected** between today's route and the new route on a whole real folder, run the same day on the same build. **Accepted exception** (user ruling, option A, after F4): a 1-bit difference on a JPEG or lossy WebP, traced to the ±1 color rounding of F4. **Defect**: any difference of 2 or more bits; any difference on a PNG, GIF or JXL; or more than 0.5% of the folder's images differing. |
| D5 | How is D4 checked on Thursday? | **In-app parity diagnostic** (user agreed), not the December cache (F6): one launch hashes the folder both ways and writes the comparison to the perf log (§ 9). |
| D6 | Which route? | **The F4 route** (my call, from the measurements): in a worker pool, `ImageDecoder` → YUV frame drawn directly; non-YUV → `createImageBitmap(blob)`. Any failure falls back to **today's route** for that file, never to the other worker sub-route. Videos stay on today's route. |
| D7 | The estimate grew to ~13 SP against 8 planned. One PR with G3 slipping, or a split? | **Two PRs** (user ruling, option B; § 13.1). PR 1 has the end-of-sort fixes on today's hashing route; they fix bugs reachable today and ship safely alone. PR 2 has the background route, the parity mode and the Thursday smoke. Doing it the other way round has no safe seam: the background route alone would make F9–F11 reachable. G3 (ZoomManager) is expected to slip a day or two. |

**My calls** (not put to the user; each is open to their review):
1. The decoder is its own module, reusable by the AI sort later, but **not wired** into the AI path (that would need its own parity proof on feature vectors).
2. The "Show" message stays until Show, ×, a folder switch, a new sort or Tournament entry; Show refuses in Tournament mode.
3. **When Show is used** (revised after the builder check). A run that **computes** an order ends with Show if, since Sort was pressed, the file on screen changed, `moveHistory` changed, or the mode changed. Otherwise the user was waiting, and the order applies directly. A computing run is a hash run, a CLIP run, a forced re-sort or an algorithm switch. A cache hit applies directly. Both routes go through the **one apply function** of § 8. The rule follows D3's why: nothing jumps under a user who is busy, and a user who sat waiting gets the order at once. The user was explicitly fine with either an instant apply or a button.
4. Hashes are saved periodically and on cancel, so a cancelled run keeps its work (§ 6.3).
5. A **canary** at the start of each run checks both routes on two generated images; on any difference, that run uses today's route (§ 9.2).
6. The parity switch is an environment variable, `MV_HASH_PARITY=1` (§ 9.1).
7. Pool size: measured by the builder, starting at 3.
8. The "> 1000 files … could freeze the application" confirm (`:7147`) is reworded: the run is background work that may take several minutes.
9. One perf-log line per similarity sort (§ 6.6).
10. The sorted-order check on Thursday is dropped (§ 11.4).
11. **CLIP shares the end-path model** (builder check). The CLIP branch of `handleSortBySimilarity` uses the same run token, captured settings, no-restore cancel and § 8 apply as the hash branch. Its long extraction wait leaves the F10 and F11 races reachable today, and two end-path models in one handler would leave § 12's entries half-open.
12. **The cache-hit placement loop stays as it is** (builder check). `insertNewFilesInSortedOrder` places each new file by scanning the whole list on the main thread, yielding every 25 files. This is a known exception to "no stalls": it bites only when a saved order is far behind the folder. It is filed 🟤 at closeout, not moved into `sorting-worker.js` here.

---

## 4. Goals, non-goals, anti-goals

**Goals**: no main-thread decode during a similarity sort's hashing (images, JXL); full use of the app while it runs
(D2); D3's arrival; the D4 bar, checkable in-app (D5); no resurrected or vanished files on any end path; the
hashing code outside `media-viewer.js`, and the renderer's net line change reported at closeout (the week's theme).

**Non-goals**:
- The AI sort's waits (D1).
- The O(n·K) neighbor-graph build (BACKLOG 🟤 "Decide how to close the visual-similarity graph-build floor").
- Changing the hash itself (algorithm, size or bits).
- The cache-hit path's main-thread placement loop (my call 12).
- Refreshing old caches: `Liked_1`'s December entries stay valid, as today.
- Off-thread video hashing.
- Moving `blockhash` callers outside the similarity sort.

**Anti-goals** (would make this a failure even if it works):
- A rating key press landing on a file the user has not seen.
- A file moved during a run reappearing in the list.
- Any hash difference the D4 exception does not cover, shipped unreported.
- A second copy of `blockhash` that can drift from the first.
- A new IPC channel or a `preload.js` change.

---

## 5. Architecture

### 5.1 Modules

- **`hash-worker.js`** (new, top-level, module worker `{ type: 'module' }`): one file → one hash, by the F4 route.
- **`hash-pool.js`** (new, pure-ish ESM, imported by `media-viewer.js` as a namespace):
  - spawns and terminates the workers;
  - queues paths and returns results;
  - runs the canary and the parity mode;
  - routes each file to the worker or to the fallback;
  - takes today's route as an **injected callback**, so it holds no DOM code it does not need. **(Builder's call:** whether today's `computePerceptualHash` moves into this module, with its DOM use, or stays in the renderer as the callback.)
- **`blockhash`**: **one source**, imported by both the worker and the main-thread route, e.g. a small shared module. The renderer's method becomes a call to it. This is a hard requirement: the parity guarantee rests on both routes running the same function.
- **`media-viewer.js`** keeps the orchestration in `handleSortBySimilarity` (progress card, Cancel, the run token, the apply) and loses `computePerceptualHash`/`blockhash` bodies if they move.

### 5.2 The worker route (measured, F4)

```
bytes  = fetch(MediaUrl.toMediaUrl(path))            // same read rule as <img> (F14)
type   = sniff(first bytes)                          // FFD8 → jpeg, 89 50 → png, 47 49 → gif, RIFF…WEBP → webp (F7)
if type in {jpeg, webp}:
    frame = new ImageDecoder({ data, type }).decode({ frameIndex: 0 }).image
    if frame.format is YUV (I420/I422/I444/NV12…): draw frame          // GPU converts, like <img>
    else: close it; bitmap = createImageBitmap(blob); draw bitmap      // CMYK JPEG, alpha WebP
else if type in {png, gif}:
    bitmap = createImageBitmap(blob); draw bitmap
else (unrecognised bytes, e.g. a misnamed file of another kind):
    report failure                                   // today's route decides, as it does now
draw   = a FRESH OffscreenCanvas(256, 256), getContext('2d') with NO options,
         drawImage(src, 0, 0, 256, 256), getImageData(0, 0, 256, 256)
hash   = blockhash(imageData, 16)
any throw / timeout → report failure; the pool runs today's route for this file
```

Never `willReadFrequently`, never a reused canvas (F3: the CPU path changes hashes, and Chromium may drop
acceleration from a canvas read back often). **JXL**: the renderer's existing `decodeJxl` produces frame 0 as PNG
bytes, and the pool sends those bytes to the worker's PNG branch. **Videos** (`/\.(mp4|webm|mov)$/i`, as today) go
straight to today's route.

---

## 6. The hashing run

### 6.1 Start

`handleSortBySimilarity` keeps its guards (tournament, prediction sort, file-op guard, `< 2` files). At start it
captures:

- the algorithm and K;
- the current file's path (the sort's start file);
- `baseFolderPath`;
- a **run token** (§ 6.4);
- a **snapshot** of the paths needing a hash: the snapshot of `mediaFiles` minus the loaded cache.

It never walks the live `mediaFiles` (F9).

### 6.2 Hashing

The pool hashes the snapshot with N workers, plus the fallback for videos and failures. Progress goes through
`updateSortProgress` only (the shared-element gotcha), at the existing cadence. A file that left the list meanwhile
may still be hashed: harmless, it is simply not in the result. Before a result is stored, the run token is checked.

### 6.3 Saving

Hashes are saved:

- periodically, every ~1,000 new hashes or ~60 s **(my call; the builder tunes it)**;
- on cancel;
- at the end.

Each save checks the run token, so a switched folder never receives another folder's hashes. `saveHashCache`
keeps its format and its G1 validation on load.

### 6.4 The run token

The token is a counter bumped on every run start and every folder load, plus the run's `baseFolderPath`. Every
resumption after an `await` checks it. A stale run writes **nothing**: no `mediaFiles`, no caches, no flags, no
card, no message. It only lets its workers go. This closes F11.

### 6.5 The cache-hit path and CLIP

`applyCachedSortOrder` → `insertNewFilesInSortedOrder` hashes new files through the same pool. A cache hit applies
directly through § 8's apply function (my call 3); its placement loop is unchanged (my call 12).

The CLIP branch (my call 11) keeps its own wait (`kickoffBackgroundExtractionIfEnabled`) and its worker sort.
Everything around them follows this section and § 7–8: token, captured algorithm, no-restore cancel and the § 8
ending.

### 6.6 Perf log

One line per similarity sort, beside the AI sort's:

`Similarity sort: outcome=done|cancelled|failed|stale total=… | load=… | hash=… (new N, worker N, fallback N, skipped N, pool P) | save=… | sort=… | files=N`

---

## 7. Using the app during a run (D2)

- **Moves, ratings, undo**: allowed, as today. The run hashes its snapshot. The result is built on the list **at apply time** (§ 8): files gone since are dropped, and files added since (e.g. restored by undo) are placed by similarity, through `applyCachedSortOrder`'s new-file logic.
- **Settings**: the run uses the algorithm and K it captured. Changing them affects the next run only.
- **Single ↔ compare**: allowed. Show applies in either mode.
- **Folder switch**: cancels the run (as today). The token makes the cancellation write-free, and any pending Show message is removed.
- **Tournament entry**: still refused while hashing (`:5650`). After the run, entering Tournament mode removes the Show message.
- **AI sort, bulk dislike, `skipBatch` undo**: still refused while hashing (existing `isComputingHashes` checks).
- **Cancel** (card button or the Sort button): stops the workers, saves the hashes so far, and **leaves the list as it is**. Nothing is restored, because the run never changed the list.
- **Failure** (e.g. fewer than 2 hashable files): same as cancel, plus the error notice.
- **Restore Order** (both the similarity and the AI path's toggle-off): `originalMediaFiles` filtered to files still listed, then the files listed now but missing from the snapshot, appended. This closes BACKLOG item 20 for both paths.

---

## 8. When the run finishes (D3)

1. The order is computed in `sorting-worker.js`, as today, from the captured algorithm, K and start file, and saved to `.sort_cache.json` (token-checked).
2. **Apply directly or offer Show** (my call 3). If the file on screen, `moveHistory` or the mode changed since Sort was pressed, Show is offered. Otherwise the apply function below runs at once.
3. A **sticky** message appears: "Similarity order ready — Show" with Show and ×. It needs a new `showNotification` option, e.g. `{ sticky: true }` (F17). The existing pruning would remove it, so it must be exempt from both prunes: the 5-notification cap and the newest-info-only rule. The sort-progress card is itself an `info` notification.
4. **The apply function**, used by Show, by a direct apply and by a cache hit:
   - refuses in Tournament mode, while a file action holds the guard, and while another sort runs;
   - waits for an in-flight render (`_waitForRenderIdle`);
   - takes the `originalMediaFiles` snapshot **now**, unless the list is already similarity-sorted (a forced re-sort keeps the existing disk-order snapshot, per the comment at `:7182`);
   - applies the run's order through the cache-hit logic (`applyCachedSortOrder` with the run's own algorithm, not the dropdown's), so files moved or restored since are handled;
   - sets `isSortedBySimilarity`, announces `_onOrderChanged('other')`, lands on index 0 (the start file) and renders.
5. **Show uses the in-memory result**, so it does not depend on the cache write having succeeded.
6. **Dismissed or ignored**: the button stays "Sort by Similarity". Pressing it later is a cache hit, which applies immediately (per my call 3).

This closes BACKLOG items 14 and 19 by construction, for every algorithm CLIP included: no run end path writes
`mediaFiles` except through the apply function, and the apply function waits for render idle.

---

## 9. Diagnostics

### 9.1 Parity mode (D5)

`MV_HASH_PARITY=1` makes `main.js` load `INDEX_URL` with `?hashParity=1` (F15). The renderer reads the flag once.
In parity mode, a similarity sort:

- hashes **every image** in the folder both ways, ignoring the loaded cache;
- writes **no** hash cache, sorts nothing, and shows no Show message;
- writes to the perf log:
  - a summary line: files, identical, differing by bits (1, 2+), per-route total time;
  - one line per differing file: name, bits, decoded frame format, sniffed type, embedded color profile yes/no;
- notifies "Parity check done — see the perf log".

Today's route blocks the main thread in this mode; that is accepted for a diagnostic. **(My call:** the per-route
times double as Thursday's before/after timing, so no `main`-branch run is needed.)

### 9.2 Canary (my call 5)

At each run's start, the renderer generates two images:

- a JPEG from `canvas.toBlob('image/jpeg')`: even dimensions, no color profile, 4:2:0, so F4's exact class;
- a PNG with alpha.

It hashes both through both routes: today's via a `blob:` URL, the worker's from the bytes. On any difference, the
run uses today's route for every file, with a notice and a log line. This guards against an environment where the
worker's canvas is not on the same raster path (F3), e.g. after a GPU process fallback. It costs ~100 ms per run.

---

## 10. Edge cases

| #   | Case | Handling |
| --- | ---- | -------- |
| E1  | File moved away mid-run | Hashed or skipped; dropped at apply (§ 7). |
| E2  | File restored by undo mid-run or after it | Placed by similarity at apply (§ 7). |
| E3  | Folder switch mid-run, with an image still decoding | Token: no writes (§ 6.4). |
| E4  | Algorithm/K changed mid-run | Captured values used; Show applies the run's algorithm (§ 8). |
| E5  | Show clicked after more moves, or in compare mode | Apply-time list; renders the pair. |
| E6  | Show clicked in Tournament mode, or during a file action | Refused with the existing notices. |
| E7  | Misnamed file (WebP as `.png`) | Sniffed (F7). |
| E8  | Undecodable in the worker (corrupt, unsupported, `ImageDecoder` error, timeout) | Today's route; if that fails too, skipped, as today. |
| E9  | A worker crashes or hangs | Terminate, respawn, re-queue its file once, then the fallback. |
| E10 | Very large image (e.g. 8000×8000) | Bounded by the pool size; the builder measures peak memory on the smoke (§ 13). |
| E11 | Animated GIF/WebP | Frame 0 (`frameIndex: 0`; `createImageBitmap` takes the first frame), measured exact. |
| E12 | Cancel, then Sort again | Saved hashes reused; only the rest is hashed. |
| E13 | Two runs back to back | The token drops the older run's late results. |
| E14 | Forced re-sort (Shift-click) while sorted, or an algorithm switch on a hashed folder | Hashes nothing but still runs the neighbor-graph build, which can take minutes. Ends by my call 3 (Show if the user acted, else direct), keeping the existing disk-order snapshot. |
| E17 | A CLIP sort while the user rates during its extraction wait | Same token and § 8 ending as a hash run (my call 11). |
| E15 | Hidden or minimized window | The canary still applies. Not measured: whether workers and their `OffscreenCanvas` keep the same raster path and speed while the window is minimized. The builder checks this once; the canary makes a path change safe either way. |
| E16 | Parity mode on a folder with videos | Videos are skipped in the comparison and counted separately. |

---

## 11. Testing and acceptance

### 11.1 Fixtures

Extend `tests/e2e/fixtures/generate.js` (or a sibling generator) with `sharp`-made images for the classes F4
measured:

- EXIF-rotated JPEGs (orientations 3, 6, 8);
- P3- and CMYK-profiled JPEGs;
- progressive and 4:4:4 JPEGs;
- grayscale JPEG;
- 6000×4000 and 8000×2000 JPEGs, plus a 4000×3000 PNG;
- PNGs: alpha, 16-bit and palette;
- 40×30 PNG and 257×255 JPEG;
- WebPs: lossy, alpha and animated;
- GIFs: still, alpha and animated;
- a lossy WebP named `.png`.

Keep the large ones generated at test time, not committed, if their size argues for it **(builder's call)**.

### 11.2 Unit (Vitest)

The pure parts of `hash-pool.js`:

- type sniffing;
- the route choice (frame format → route);
- the fallback chain;
- queue, cancel, token and stale-drop;
- periodic-save scheduling;
- the parity report's classification (1-bit vs 2+, D4's classes).

Also:

- `blockhash` single-source: a test that both import sites resolve to the same function.
- The apply-time list rules: dropped, placed, the Restore Order filter + append.
- The direct-apply vs Show decision (my call 3).
- The CLIP branch's cancel and stale paths writing nothing (my call 11), through `extractAsyncMethod` with a mocked sorting worker. A real CLIP E2E needs the ~87 MB model.
- `like-or-skip-glue.test.js`'s reviewed list of `this.mediaFiles =` assignments, updated deliberately.

### 11.3 E2E (Playwright, real Electron)

- **Parity**: every fixture of § 11.1 is hashed by both routes in the running app. Hashes must be identical. Pixel identity is recorded, not asserted (D4).
- **Canary**: passes on the fixture machine.
- **Responsiveness**: during a run over the fixtures, a navigation and a rating go through; a rating mid-run moves the right file; the moved file is absent after Show.
- **Show**: appears, survives 5 s, applies on click, lands on the start file. Folder switch removes it. Refused in Tournament mode.
- **Cancel**: list unchanged; hashes saved (the cache file contains the finished ones).
- **Folder switch mid-run**: no write to the new folder's caches, and the old folder's files never appear.

### 11.4 The user's smoke (Thursday, `Liked_2`, ~15.6k files, no hash cache)

1. **Parity**: `$env:MV_HASH_PARITY='1'; npm start` → open `Liked_2` → Sort by Similarity (VP-Tree) → wait → read the perf log. **Pass**: D4, every difference listed and of the accepted class.
2. **Normal run, cold**: `npm start` → Sort by Similarity. During hashing:
   - browse;
   - rate a few files and undo one;
   - switch to compare and back;
   - change K.
   **Pass**: no stall the user notices; Show appears at the end; the order applies on click; the moved files are absent; the undone file is present.
3. **Timing**: the perf line of step 2 vs the per-route times of step 1, in `media-viewer-perf.log`.

**(My call 10:)** the WEEKLY's "sorted order unchanged" check is dropped. With identical hashes, VP-Tree/MST order
follows (F16). With accepted 1-bit differences, local order changes are explained by them, and a separate order
diff would add a ~minutes-long second sort for no new information.

### 11.5 Acceptance

- Unit and E2E green.
- The E2E parity test fails on a deliberately wrong route (mutation: `willReadFrequently: true` in the worker), so it is not vacuous.
- Smoke steps 1–2 pass.
- `CLAUDE.md` § Architecture gains the new files, and the Data Structures note on perceptual hashing names the shared `blockhash`.
- The closeout reports `wc -l media-viewer.js` before and after.

---

## 12. Out of scope, and found on the way

- **Closed by this design** (check off at closeout if the tests prove it): BACKLOG 🟤 [2026-10-12] G2-closeout items "The similarity sort's catch restores a stale snapshot", "A similarity-sort result can land under an in-flight render", "Restore Order drops a file whose pre-sort move was undone after the sort" (both paths).
- **Not closed**: "The similarity sort leaves `isSortedByPrediction` set". Show could clear it, but auditing its readers is that entry's job.
- **To file at closeout** (🟤):
  - Today's hashes depend on the GPU raster path and drift across Chromium updates (F3, F6). A GPU or driver change, or an Electron upgrade, can shift up to 2% of cached hashes by 1–4 bits.
  - The off-thread decoder could serve the AI sort's `loadMediaAsImageData` (D1 non-goal; needs its own parity proof on feature vectors).
  - `insertNewFilesInSortedOrder`'s placement loop scans the whole list per new file on the main thread (my call 12). Move it into `sorting-worker.js` if a far-behind cache ever makes it a real stall.

---

## 13. Sizing, model and risks

**Re-estimate: ~13 SP** (planned 8). The extra comes from D2 and D3: the run token, the apply-time list rules, Show,
and the three BACKLOG fixes on the same handler, CLIP branch included. Then come the parity mode and the canary.

| Part | SP |
| ---- | -- |
| Worker, pool, sniffing, fallback, canary | 3 |
| Run integration: token, snapshot, saves, cache-hit path, CLIP branch | 3.5 |
| Show, the apply function, direct-vs-Show rule, Restore Order and cancel fixes, settings capture | 2.5 |
| Parity mode, perf line | 1 |
| Tests: fixtures, unit, E2E | 2.5 |
| Docs | 0.5 |

At ~1.6× the plan, this crosses no abort threshold (2×), but Tue–Thu will not hold it. Hence D7's split.

### 13.1 Delivery: two PRs (D7)

| | PR 1 — end-of-sort fixes (~6 SP) | PR 2 — background hashing (~7 SP) |
| --- | --- | --- |
| **Scope** | § 6.1's captures and snapshot on **today's** sequential route; § 6.3 saves (periodic and on cancel); § 6.4 run token; § 6.5 CLIP branch; § 7 (no-restore cancel, Restore Order on both paths, settings capture); § 8 (the apply function, render-idle wait, the direct-vs-Show rule, the sticky message); § 6.6 perf line (outcome, phases, files) | § 5 (worker, pool, shared `blockhash`, sniffing, fallback); § 6.2 on the pool; § 6.5's new-file hashing through the pool; § 9 (parity mode with its `main.js` flag, canary); my call 8 (the confirm wording); the perf line's worker/fallback counts |
| **Tests** | § 11.2's list rules, decision rule, token and CLIP items; § 11.3's Show, Cancel and folder-switch E2E. "Use the app mid-run" can be exercised during the graph build, which already leaves the UI usable. | § 11.1 fixtures; § 11.2's pool items; § 11.3's parity (with its mutation check), canary and responsiveness E2E |
| **Closes** | The three § 12 BACKLOG entries | TODO 🔴 PR2 slice; GOALS Objective 1's 🔴 Key Result |
| **User step** | none | § 11.4 smoke (Thursday) |
| **Branch** | `g2-hash-sort-off-renderer` (this branch, from `main` @ `bfc4cbf`) | a new branch from `main` after PR 1 merges |

Each PR gets its own plan, its own deep review (`max`), and its own closeout. PR 1's `CLAUDE.md` changes cover the
end-path rules (§ Async Patterns). PR 2 adds the new files to § Architecture.

**Model**: the WEEKLY's first guess stands: `xhigh` for the plan, execute Opus · `medium`, Sonnet · `medium` for
spelled-out steps, deep review (`max`). `sorting-worker.js` is untouched unless the builder needs it, so the Tier 2
plan-review flag may not apply.

**Risks**:
- **R1. The 1-bit rate on the full folder is higher than the sample's ~1/1,000.** D4 caps it at 0.5%; above that, it is a finding, and the fallback for color-profiled JPEGs (option B) is the known remedy.
- **R2. Worker memory on huge images.** Measure peak RSS during the smoke; cap concurrency for large files if needed.
- **R3. GPU contention.** Workers and the visible media share the GPU. The smoke's "no stall" check covers it; lower the pool size if browsing stutters.
- **R4. `ImageDecoder` support changes in a future Electron.** The canary and the fallback contain it.

---

## 14. Left to the builder

- Module boundaries inside § 5.1: where today's route lives, and the shared `blockhash` file's form (ESM vs conditional CJS, as `feature-extractor.js` does).
- Pool size (start at 3, measure 1/2/3/4), the periodic-save cadence, and worker timeouts.
- The sticky notification's API shape.
- How the parity flag travels (`?hashParity=1` or an equivalent that needs no `preload.js` change).
- Whether large fixtures are generated at test time.
- The canary images' exact content.

---

## 15. Planning amendments (PR 1, 2026-10-19)

Measured on `bfc4cbf` while writing the PR 1 plan
([plan](../../archive/plans/2026-10-19_g2-hash-sort-pr1-end-of-sort-fixes.md)). Each refines the approved design;
none changes a user ruling.

- **A1. Tournament entry restores through the same rule (§ 7).** `restoreOriginalOrderForTournament` (`:5702`) filters `originalMediaFiles` without appending, so it drops the same files Restore Order does. One helper (`alignToLive`) serves all three paths.
- **A2. The perf line gains `outcome=offered` (§ 6.6)**, for a run whose order waits behind Show; `done` means it was applied. `_logSortPerf` takes a label and a file count, so both sorts share one formatter.
- **A3. The cancel notice moves to the run's end (§ 7).** Today a press-cancel notifies `❌ Sorting cancelled`, while the card's Cancel shows an error-styled `❌ Error: Sorting cancelled by user` from the catch. The run's end now owns one notice for both.
- **A4. The apply function computes before it commits (§ 8).** `applyCachedSortOrder` and `insertNewFilesInSortedOrder` return the order instead of writing `mediaFiles`. The placement loop yields every 25 files, so a write there could resurrect a file moved during a yield. The apply function waits for render idle, re-checks, then commits synchronously. At the commit:
  - a held file-op guard declines it, and the caller offers Show instead (a direct apply) or puts the offer back (Show);
  - an emptied list is left alone.
- **A5. A stale run releases its own flags (§ 6.4).** It writes nothing that belongs to the folder now open, but still clears `isComputingHashes`, its own abort controller and the button, because nothing else would. The folder switch's invalidation aborts the run and clears its card.
- **A6. Cache I/O is folder-explicit (§ 6.3–6.4).** The hash and sort cache reads and writes take the run's folder.
  - The hash load and save also check that folder against the one open. A load that resolved after a switch would otherwise fill the new folder's map with the old folder's paths, and the next save would write them under the new folder's cache.
  - `saveSortCache` reads and writes one folder, closing the same gap across its own read-before-write.
- **A7. Show also refuses while a folder load is in flight (§ 8).**
- **A8. The end-of-run hash save is skipped when nothing new was hashed (§ 6.3).**
- **A9. "A new sort" includes the AI sort (my call 2).** Its start dismisses a pending Show message.

## 16. Execution notes (PR 1, 2026-10-19)

The plan's Progress Log has the full record. These notes refine or depart from the sections above.

- **§ 8.6, a dismissed forced re-sort.** § 8.6 assumed an unsorted screen. After a Shift+click forced re-sort from the sorted state ends in an offer and the offer is dismissed, the screen is still similarity-sorted, so the button reads **Restore Order**, the honest label. The next press restores; the one after it applies the saved re-sort as an instant cache hit. Raised in the PR #85 code review (#12) and ruled with no code change.
- **§ 8.2, "apply directly or offer Show".** It is decided again at the commit, not only before the apply. `_applySimilarityOrder(entry, signal, mark)` declines `'acted'` when the user acted since the press. This covers a cache hit (my call 3 had assumed it is near-instant) and a computing run whose placement or render wait took long. Code review #3.
- **§ 8.4, the render wait.** `_waitForRenderIdle` reports whether the render settled. On its 2 s cap the apply declines (`'busy'`, so Show is offered or re-offered), and both Restore Order paths refuse with `Wait for the file to finish loading`. They no longer commit under a render. Code review #2. The AI sort's apply was added in Task 7 (user-approved): it waits up to 30 s for the render and any file action, and drops its result with `Could not sort: a file is still loading — sort again` if the file still hasn't loaded.
- **Restore Order.** On both Restore Order buttons it waits for an in-flight render, then re-checks that the order is unchanged (Task 6, user-approved).
- **The perf outcome `declined`.** Added for a run that ends with nothing applied or offered (an emptied list, or a Tournament decline). Final review M5. The AI-sort decline (`'sorting'`) was removed in the follow-up review (#23): the AI sort's start invalidates the run synchronously, so any similarity entry is already stale.
- **Hash-cache saves merge once.** `saveHashCache` merges the on-disk cache into memory once per folder, and only when the load did not parse it; after that it writes memory only (review #20). A read-only folder warns once per run (#18).
- **Out of PR 1 by user ruling (2026-10-19):**
  - the feature-cache emptying on a mid-extraction folder switch (review #1) is a separate PR next;
  - the non-atomic `write-folder-cache` (review #5) moves into PR 2;
  - a degraded order saved as the sort cache (review #9) goes to BACKLOG.

## 17. Planning amendments (PR 2, 2026-10-22)

These were measured on `bf5ec84` while writing the PR 2 plan
([plan](../../planning/plans/2026-10-22_g2-hash-sort-pr2-background-hashing.md)), each in a fresh Electron 39.1.2
process with the GPU raster path enabled. None of them changes a user ruling.

- **B1. The canary compares pixels, not hashes (§ 9.2).**
  - *The probe*: seven canvas-encoded candidates went through both routes. The worker route matched today's route
    byte for byte on all seven, with the window both visible and minimized.
  - *The mutation*: with the worker's context forced to `willReadFrequently: true` (the CPU path), 94k–239k of
    262,144 bytes differed on every candidate, yet the hash differed on only two. The two images § 9.2 describes, a
    320×240 JPEG and a 320×240 alpha PNG, kept **identical hashes**, so a hash-only canary would not have fired.
  - *The rule*: the canary passes only when every byte of both 256×256 read-backs is equal and the hashes are equal.
- **B2. Atomic folder-file writes (§ 16, PR #85 review #5).** `write-folder-cache` and `writeBulkRatedFile` write
  through one helper, `atomic-write.js`:
  - a unique tmp name per write, created exclusively;
  - `assertFixedPath` on both the tmp and the target before anything is written;
  - fsync, then a rename with the lock retry;
  - writes to one file applied in the order main received them;
  - orphaned tmps older than 10 minutes removed on the first write to each file.

  `.bulk_rated.json` is included because its ratings exist nowhere else: a bulk rating moves no file. This came from
  a side agent's note, which the user relayed on 2026-10-22. The ordering rule is needed because unique names alone
  stop a tear but do not stop an older write's rename landing last.
- **B3. Today's route moves to `main-thread-hash.js` (§ 5.1, the builder's call).** `computePerceptualHash` stays
  on `MediaViewer` as a one-line delegate and serves as the pool's fallback. Its image draw becomes `hashImageUrl`,
  which the canary also runs on a `blob:` URL. The error messages are unchanged.
- **B4. One pool per run (§ 6.2, § 6.4).** A run creates a pool, and so does a placement with files to hash; each
  terminates its pool in its `finally`. No worker outlives the run that made it, so § 6.4's "a stale run only lets
  its workers go" holds by construction.
- **B5. Parity mode runs two passes, the worker route first (§ 9.1).**
  - The second pass reads files the first pass already read, so the speed-up it reports is conservative.
  - Parity mode always asks before it starts, because its second pass freezes the app.
  - It writes no cache, and it leaves its report on the viewer for the E2E.
- **B6. D4's classes, as code.** A 1-bit difference is accepted when the bytes sniff as JPEG, or as WebP decoded to
  a YUV frame (lossy). Every other difference is a defect. A differing share above 0.5% of the compared images also
  fails the verdict.
- **B7. PR 1's Improvement #1 (a per-run hash map) is not absorbed.** It stays in BACKLOG, for three reasons:
  - The pool's results reach `perceptualHashes` through a single store in the run's loop, after the token check, so
    the pool adds no write path.
  - The E2 gap the map would close needs a hash computed after a move. The pool cannot produce one, because a moved
    file's read fails on both routes.
  - Adopting the map would rework `saveHashCache`'s merge-once rule (PR #85 #20), which guards the 13k-entry cache
    against shrinking.
- **B8. Re-measured.** F4 still holds: the spike's 25 fixtures were 25/25 pixel-exact and hash-identical, in the
  frame formats BGRA, BGRX, I444 and I420. For E15, both routes stayed pixel-identical with the window minimized, on
  B1's seven candidates.
- **B9. The unused npm `blockhash` dependency is removed.** It is a different algorithm, and nothing imports it. The
  one `blockhash` is `perceptual-hash.js`.
- **B10. The pool size is measured, and stays 3 (§ 14; plan T8, 2026-10-22).**
  - *The run*: 597 `Liked_3` images, read only, each configuration in a fresh process, on a quiet machine.
  - *Main thread vs pool 3*: today's route took 95 ms per image, and its main thread was late by up to 325 ms (p99).
    Pool 3 took 47 ms per image, with a p99 lateness of 15 ms, about one frame.
  - *Pool 4*: 38 ms per image, at a peak working set 400 MB higher (2,041 MB vs 1,640 MB).
  - *Why 3*: risk R2. The machine has 15.2 GB, of which 1.2 GB was free during the run.
  - *Across the measurement*: the canary passed at every size, and every image took the worker route.
