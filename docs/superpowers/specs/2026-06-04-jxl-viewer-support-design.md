# JXL + Animated-JXL Viewer Support — Design

**Status:** Approved design, ready for implementation planning.
**Date:** 2026-06-04
**Branch:** `feature/jxl-viewer-support`
**Group:** A (Weekly Challenge 🏆, 8 SP) — part 1 (audit + WASM eval, Tue) + part 2 (decode/render/tests, Wed)
**Source:** 🔵 User-Flagged (urgent — blocks opening files the user already produces)

---

## 1. Context

The user runs a sibling project, `media_compression`, that losslessly transcodes a personal
media collection to JPEG XL (see `media_compression/docs/superpowers/specs/2026-05-15-jxl-conversion-design.md`).
Media Viewer cannot currently open the resulting `.jxl` files, which blocks the user from
browsing/rating their own converted collection. Chromium dropped native JPEG XL decoding in
2022, so an in-app WASM decoder is required.

This design covers the **full Group A feature** (detection → decode → render → feature
extraction → tests). The implementation **plan** is split across two days: part 1 (format
detection wiring + the WASM decoder spike) on Tuesday, part 2 (decode worker, render
integration, animation, feature extraction, tests) on Wednesday.

### 1.1 Decisions locked during brainstorming

| # | Question | Decision |
|---|---|---|
| Q1 | Spec scope | **Full Group A** in one spec; plan split part 1 / part 2 |
| Q2 | Animated JXL | **Full animation playback** (auto-looping, GIF-style — no play/pause UI) |
| Q3 | Other formats | **JXL only** (MKV / others tracked separately in BACKLOG) |
| Q4 | Decode location | **Renderer Web Worker** (module worker; WASM by path, no IPC pixel payloads) |
| — | Render architecture | **Approach A** — decode-to-PNG-blob in worker, reuse existing render + extraction paths |
| — | CLIP on JXL | **Decoded PNG → existing CLIP path** (new buffer IPC); full 64+512-dim parity |

---

## 2. Format audit — what `media_compression` produces

The converter is **additive** (`<name>.<ext>.jxl` sibling files; originals never deleted),
so a folder can contain both `photo.jpg` and `photo.jpg.jxl`. Both must list and render
independently.

| Source in collection | Converter action | Resulting file the viewer must open | Viewer status today |
|---|---|---|---|
| `.jpg` / `.jpeg` | → JXL (bit-exact) | `name.jpg.jxl` | ❌ unsupported |
| `.png` | → JXL (pixel-exact) | `name.png.jxl` | ❌ unsupported |
| `.gif` | → **animated** JXL | `name.gif.jxl` (multi-frame) | ❌ unsupported |
| `.webp` | skipped | stays `.webp` | ✅ native |
| `.mp4` / `.webm` | skipped | stays as-is | ✅ native |
| `.mkv` | skipped | stays `.mkv` | ❌ unsupported — **out of scope** (Q3) |

**Conclusion:** the only new container is `.jxl`, always as a **double extension**
(`*.jpg.jxl`). `path.extname()` returns `.jxl` for all of them, so detection keys on the
final `.jxl`. GIF-derived files are animated and require multi-frame playback.

---

## 3. WASM decoder evaluation

| Library | Backend | Animation | License | Browser / Worker | Verdict |
|---|---|---|---|---|---|
| **`jxl-oxide-wasm`** | Pure-Rust `jxl-oxide` | ✅ native — `render(keyframeIdx)`, `numLoadedKeyframes`, `animated`, per-frame `.duration` | MIT / Apache-2.0 | ✅ `wasm-bindgen` + `init()` | **Recommended** |
| `@jsquash/jxl` | libjxl (Emscripten) | ❌ single-frame `decode() → ImageData` | BSD-3 + Apache | ✅ | Rejected — no animation |
| `jxl-rs-polyfill` | `jxl-rs` | ✅ but decodes to PNG/APNG **blob** | mixed | ✅ | Rejected — APNG blob, no per-frame control |

**Recommendation: `jxl-oxide-wasm`.** Only candidate giving per-frame access *and* frame
durations (required by Q2), pure-Rust (no Emscripten glue), permissively licensed, and
instantiates in a Web Worker via `init()`.

**Confirmed API** (from `crates/jxl-oxide-wasm/src/lib.rs`):
- `JxlImage`: `feedBytes(bytes)`, `tryInit() → bool`, `width`, `height`, `animated`,
  `numLoadedKeyframes`, `numLoops`, `render(keyframeIdx?) → RenderResult`.
- `RenderResult`: `encodeToPng()`, `duration` / `durationNumerator` / `durationDenominator`,
  `iccProfile`.

**To confirm during the part-1 spike:** (a) `jxl-oxide-wasm` loads as a module worker under
Electron's `file://` and `init()` accepts an explicit `.wasm` URL; (b) whether `RenderResult`
exposes a raw-RGBA accessor (else PNG-blob → `ImageBitmap` round-trip, which is acceptable);
(c) measured `.wasm` bundle size.

---

## 4. Architecture

Render path today (grounding):
- `showSingleMedia()` (media-viewer.js:2627) builds an `<img>` or `<video>` from `file.type`
  (MIME) and sets `.src = pathToFileURL(file.path)`. For `.jxl`, today's `getMimeType` returns
  `application/octet-stream`, so neither image nor video branch fires → `currentMedia` is
  undefined → crash. JXL must be (a) detected as an image-class file, and (b) routed through
  the decoder instead of a direct `<img src=*.jxl>` (which renders nothing in Chromium).
- Existing workers are **classic** workers (`new Worker('sorting-worker.js')`).
- `window.electronAPI.readFile` returns **text** (used for JSON caches) — not usable for binary.

### 4.1 Component table

| # | Unit | New / changed | Part |
|---|---|---|---|
| 1 | Format detection | `main.js` `isMediaFile` / `getMimeType`; renderer `isJxl()` | **1** |
| 2 | Binary read IPC | new `read-file-buffer` handler + `readFileBuffer()` exposure | 1 |
| 3 | `jxl-decode-worker.js` | new **module** Web Worker wrapping `jxl-oxide-wasm` | 2 |
| 4 | `decodeJxl()` + frame cache | renderer helper: read bytes → worker → cached frames | 2 |
| 5 | Static render branch | JXL branch in `showSingleMedia` / `showCompareMedia` | 2 |
| 6 | Animation playback | Canvas render-loop driver (auto-loop, GIF-like) | 2 |
| 7 | Feature extraction | frame-0 ImageData → hand-crafted; decoded PNG → CLIP IPC | 2 |
| 8 | Tests | unit (detection) + E2E smoke (fixture `.jxl`) | 1 + 2 |

### 4.2 Format detection (part 1)

- `main.js` `isMediaFile()`: add `.jxl` to the extension list.
- `main.js` `getMimeType()`: map `.jxl` → `image/jxl` so the renderer treats it as image-class.
- Renderer: `isJxl(p) = /\.jxl$/i.test(p)`. The video regex `/\.(mp4|webm|mov)$/i` is untouched.

This makes `*.jpg.jxl` files **list** in folders and arrive as `type: 'image/jxl'`. Detection
is independent of the source extension embedded in the double extension.

### 4.3 Binary read IPC (part 1)

New `read-file-buffer` IPC handler in `main.js` returning the file bytes (`Buffer` →
ArrayBuffer), exposed as `window.electronAPI.readFileBuffer(path)`. `preload.js` change →
**security review** per project policy (path passed straight to `fs.readFile`; mirror the
validation posture of the existing `read-file` handler).

### 4.4 Decode worker (part 2)

New `jxl-decode-worker.js`, instantiated as a **module worker**
(`new Worker('jxl-decode-worker.js', { type: 'module' })` — the one new wrinkle vs the
existing classic workers). Loads `jxl-oxide-wasm` via `init(wasmUrl)`.

Message in: `{ type: 'decode', id, buffer }`. Logic:
1. `const img = new JxlImage(); img.feedBytes(new Uint8Array(buffer)); img.tryInit();`
2. If `img.animated`: loop `i` over `img.numLoadedKeyframes`, `const r = img.render(i)`,
   collect `{ pngBytes: r.encodeToPng(), duration: r.duration }`.
3. Else: single `img.render()` → one frame.
4. Post `{ type: 'decoded', id, frames, width: img.width, height: img.height,
   animated: img.animated, numLoops: img.numLoops }` (transfer frame ArrayBuffers).

Errors → `{ type: 'error', id, message }`.

### 4.5 `decodeJxl()` + frame cache (part 2)

Renderer helper: `readFileBuffer(path)` → post to the decode worker (request keyed by `id`)
→ await frames. A small **LRU cache** keyed by file path avoids re-decoding on back/forth
navigation. Cleared in `removeFileFromList()` alongside the other per-file caches, and bounded
on folder switch (mirrors the existing cache-management pattern).

### 4.6 Static render (part 2)

In `showSingleMedia()` / `showCompareMedia()`, when `isJxl(file.path)`:
spinner → `await decodeJxl(path)` → frame-0 PNG → `Blob` → `URL.createObjectURL` → `img.src`
(object URL revoked on cleanup). After decode, JXL is "just another image" for layout, zoom,
overlay controls, etc.

### 4.7 Animation playback (part 2)

Animated JXL behaves **like a GIF**: auto-play, auto-loop, **no video controls** (GIFs today
render in an auto-animating `<img>`). Frames are pre-decoded to `ImageBitmap`s + durations; a
render loop draws them to a `<canvas class="media-display">`, advancing by each frame's
`.duration`, honoring `numLoops` (0 = infinite). A teardown flag stored on the element is
cleared by `cleanupCurrentMedia()` / navigation so loops never leak across files.

### 4.8 Feature extraction (part 2)

- **Hand-crafted (64-dim):** frame-0 ImageData feeds the existing `feature-worker` path. The
  ImageData comes from the decoded frame, not a blank `<img src=*.jxl>`.
- **CLIP (512-dim):** decoded frame-0 PNG bytes go to a **new
  `extractClipEmbeddingFromBuffer(pngBytes)` IPC** that runs the existing `CLIPVisionModel`
  path via `RawImage` from the buffer — no `.jxl` ever reaches `RawImage.read`. Yields full
  64+512-dim parity with native images. The existing `extractClipEmbedding(filePath)` handler
  is unchanged; the new handler shares its model refs and local-capture null-guard pattern.

---

## 5. Error handling & graceful degradation

| Failure | Behavior |
|---|---|
| Decode failure (corrupt / unsupported JXL feature) | Toast + skip the file (same posture as a missing file). Never a hard crash. |
| WASM load failure | JXL files show a "can't display" placeholder; the rest of the app is unaffected (mirrors CLIP graceful degradation). |
| Oversized JXL / OOM | Decode in worker isolates the renderer UI thread; failure path = toast + skip. |
| `readFileBuffer` IO error | Toast + skip; logged via `window.electronAPI.logError`. |

---

## 6. Testing

- **Unit (part 1):** `isMediaFile('.jxl')` true; `getMimeType('.jxl') === 'image/jxl'`;
  `isJxl()` truth table including the double extension `a.jpg.jxl` and negatives
  (`a.jxl.png`, `a.jpg`).
- **Unit (part 2):** frame-loop driver logic (advance/loop/teardown) tested as a pure helper
  with mocked frames + durations (no real WASM), following the project's
  algorithm-replication test pattern.
- **E2E smoke (part 2):** a tiny **static** fixture `.jxl` renders in single mode without
  error. A real animated-JXL E2E is heavier; full animation fidelity is gated on manual
  testing + the unit-tested loop driver, noted explicitly in the plan and the DONE.md entry.

---

## 7. Risks & open items for the part-1 spike

1. **Module worker under Electron `file://`** — confirm `new Worker(url, { type: 'module' })`
   + `import` of `jxl-oxide-wasm` resolves, and `init()` accepts an explicit `.wasm` URL. If
   module workers misbehave, fall back to loading the wasm glue in a classic worker via
   `importScripts` or instantiating the wasm manually.
2. **Raw-RGBA accessor on `RenderResult`** — if present, skip the PNG round-trip for display
   and hand-crafted features; if absent, PNG-blob → `ImageBitmap` is the accepted path.
3. **Bundle size** — measure the `.wasm`; if large, document it (no CDN — bundled locally,
   consistent with the project's "bundle, don't CDN" direction).
4. **WASM asset location** — no bundler in this project; the `.wasm` + JS glue must be copied
   to / referenced from a path the module worker can load under `file://`.

---

## 8. Out of scope

- MKV and any non-JXL formats (Q3).
- JXL **encoding** (the viewer only reads; `media_compression` owns conversion).
- Animated-JXL play/pause UI (auto-loop only, GIF parity).
- Preserving JXL ICC profiles / wide-gamut/HDR tone mapping (decode at sRGB 8-bit for v1;
  HDR tracked separately if it ever matters for this collection).

---

## 9. Spike outcome (2026-06-04, Task 1)

Verified `jxl-oxide-wasm@0.12.6` against real `media_compression` output in Node.

**Decode results** (all succeeded, no OOM):

| File | Dims | Animated | Frames | Output |
|---|---|---|---|---|
| `*.png.jxl` (1.48 MB) | 1518×1455 | no | 1 | PNG 2.3 MB |
| `*.jpg.jxl` (388 KB) | 3280×2500 | no | 1 | PNG 3.8 MB |
| `*.gif.jxl` (**27.8 MB**) | 1280×720 | **yes** | **270** | 270 PNGs, ~77 MB total; per-frame `duration` 300–400 ms; `numLoops: 0` (loop forever) |

**Confirmed API:** `init({ module_or_path })` (default export; accepts raw wasm bytes / URL /
`WebAssembly.Module`; `initSync` also exists). `JxlImage`: `feedBytes`, `tryInit`, `render(idx?)`,
getters `width`/`height`/`animated`/`loaded`/`numLoadedKeyframes`/`numLoops`, `forceSrgb` setter,
`renderingRegion`. `RenderResult`: `encodeToPng()`, `duration`/`durationNumerator`/`durationDenominator`,
`iccProfile`.

**Decisions forced by the spike:**

1. **No raw-RGBA accessor.** `RenderResult` yields pixels ONLY via `encodeToPng()`. The
   PNG-blob → `createImageBitmap`/canvas path is therefore **mandatory** (not a fallback).
   Risk #2 resolved: PNG round-trip everywhere.
2. **`encodeToPng()` is terminal on a `RenderResult`.** Reading any getter (e.g. `.duration`)
   or calling `.free()` **after** `encodeToPng()` throws "null pointer passed to rust".
   → The worker MUST read `.duration` (and any other metadata) **before** calling
   `encodeToPng()`, and call `encodeToPng()` exactly once, last, per result. Do not `free()`
   the result afterward.
3. **ESM-only package.** No UMD/CJS build → the decoder cannot load into the existing classic
   workers. A **module worker** (`new Worker(url, { type: 'module' })`) is required (Risk #1
   confirmed). The glue resolves wasm via `import.meta.url` (works under `file://`) but tries
   `instantiateStreaming(fetch(...))` first — `fetch(file://)` fails in Electron, falling back
   to `instantiate(bytes)` (works, with a warning). **Robust path: read the vendored `.wasm`
   bytes and pass them explicitly via `init({ module_or_path: bytes })`** — the exact call that
   worked in the spike — to avoid any `file://` fetch fragility.
4. **Bundle:** `jxl_oxide_wasm_bg.wasm` = **1.62 MB**; vendored under `vendor/jxl-oxide-wasm/`
   (MIT/Apache-2.0, license files included). Risk #3/#4 resolved.

**Contingency:** if the module worker proves troublesome under Electron `file://` during
integration (Task 5/6), fall back to **main-process decode via IPC** (CLIP already runs there) —
the same `init({ module_or_path: bytes })` Node path is proven to work in the main process.
