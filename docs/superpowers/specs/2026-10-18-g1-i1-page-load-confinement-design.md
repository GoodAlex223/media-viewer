# G1 (Oct 19–23) — Confine page-side file loads to the granted folders (residual I1)

**Status**: Approved section by section in chat, 2026-10-18. Implemented in PR #84 (merge `4548269`, 2026-10-19), with § 6 amendments (the flush, from the final review; the merge mark, from the PR review), a § 11 residual added at review, and a post-implementation note (§ 15).
**Branch**: `g1-confine-page-file-loads`, cut from `main` at `c50c087`; deleted after the merge.
**Plan**: [2026-10-18_g1-confine-page-file-loads.md](../../archive/plans/2026-10-18_g1-confine-page-file-loads.md) (public stub; the detailed implementation plan stayed local).
**Scheduled**: [WEEKLY.md](../../planning/WEEKLY.md) G1 (Oct 19–23, Mon–Tue) ← TODO 🔴 [2026-10-11] ← 🟤 [2026-10-11] G1 closeout residual I1
**Origin**: [G1 security spec](2026-10-10-g1-security-findings-fix-design.md) § 12, "§10 residual (whole-branch review I1)" and the M-a amendment ("the I1 follow-up's protocol design must decide the same question for page-side loads").

> **Disclosure.** This spec was kept local until the merge (D2, following the G1 spec's D1 precedent), and was published at the closeout on 2026-10-19. Until the merge, everything committed about I1 stayed at stub level (component, class, severity): the plan, the commit messages and the PR body. The measured gaps in § 3 describe `main` before PR #84; every one of them is closed there.

---

## 1. Intent

G1 confined what the **main process** does with a path. The **page** was never confined: it runs from a `file://` URL, and CSP `'self'` matches every `file:` URL. This change closes that gap. Even a compromised page can load only:

- the files the app itself needs, and
- media inside the folders the user granted, under the same symlink rule main applies to content reads (G1 review M-a).

It also closes every measured way out of the renderer that the CSP does not govern.

**Threat model** (unchanged from G1): untrusted *folder content* the user opens, such as a downloaded or shared media pack. Not a hostile local user, and not malware already running as the user. G1's sink fixes closed the known way in, so this is defense in depth, which is why the original residual was Important rather than a regression.

**Success** is all of:
- every confined load class has a test that fails on `main` and passes on the branch (§ 8.1)
- video seeking works through the new handler
- the E2E CSP walk stays green
- the user's existing settings survive the change
- the unit and E2E suites pass, and one manual real-folder session succeeds
- the user's `/claude-security` _Scan changes_ on the branch diff comes back clean for these sites (a clean pass, not a clearance — REVIEW-QUEUE § 5's caveat)

**Assumptions**: Windows comes first, but the code must also be correct on macOS and Linux. The app runs from source (`electron .`), with no packaging and no asar. Electron is 39.1.2.

## 2. Decisions (approved in chat, 2026-10-18)

| #   | Decision | Ruling |
| --- | --- | --- |
| D1  | Approach | **Serve the whole app from a custom scheme** (`app://media-viewer/`). Rejected: `protocol.handle('file')` and a `webRequest` gate, because neither sees dedicated-worker requests (§ 3.1); a loopback HTTP server, because it exposes a port to other local processes and to DNS rebinding. |
| D2  | Where the spec lives | **Local** until merge (WEEKLY ruling; G1 D1 precedent). A stub plan is committed. |
| D3  | Which app files are served | **An allowlist pattern**, not the whole checkout: the checkout holds `.mcp.json` (an API key), `.git/`, `.claude/` and the local `CLAUDE-SECURITY-*` report folders. Not an exact list either: v2.0 keeps adding top-level modules. |
| D4  | Main's keyframe temp folders | **Not served.** The page never loads a keyframe; only main reads them (CLIP). The TODO's "tracked temp folders" scope is dropped as unneeded. |
| D5  | Where media is served from | **Same origin, under a path prefix**, so canvas reads (hashing, features) stay untainted. Media-path content can't run as a script because of the MIME type plus `nosniff`. Rejected: a separate media host with CORS (`crossOrigin` at ~10 load sites, for one extra layer behind the MIME check). |
| D6  | Path encoding in media URLs | **The whole path in one `encodeURIComponent` segment.** It round-trips exactly, so UNC, drive-letter and POSIX paths stay unambiguous. |
| D7  | `localStorage` | **A one-time migration** from the `file://` origin, driven by main in the main window. Keys are written only where absent, a marker file records completion, and the old store is left untouched. |
| D8  | CSP | **A response header** from one constant, on every app-file response, so workers get a policy at all (§ 3.3). The meta tag is removed. |
| D9  | WebRTC | **`disable_non_proxied_udp` plus a dead session proxy**, with `<-loopback>`: zero packets measured (§ 3.4). |
| D10 | Lucide | **Vendored** to `vendor/lucide/` (user's choice). The renderer then makes zero network requests. |
| D11 | Other egress | **A session `webRequest` allowlist** that cancels every `http(s)` and `ws(s)` request and logs it. |
| D12 | The shared media-read rule | **One function** used by `ipc-guard` and the handler. It **also checks the resolved target's extension** (§ 4.3), which tightens today's IPC kind. |
| D13 | Where the pre-merge manual session runs (added 2026-10-18 at planning, from a side-agent note) | **A copy of the profile**, via a `MV_USER_DATA_DIR` override in `main.js`. The real profile migrates at its first launch after the merge. Rejected: testing on the real profile, which migrates at test time; every older build run afterwards writes only to the old store, and a second copy never overwrites (D7), so the merged version would show test-time settings. Also rejected: overwriting when the marker is absent (changes D7), and testing just before the merge with no other build run in between (discipline, not a control). |

## 3. Spike evidence (Electron 39.1.2, Windows, 2026-10-18)

Throwaway probes in the session scratchpad (never in the repo). Every row was measured, not inferred.

### 3.1 Load classes: a file outside the allowed set

| Load class | `file://`, no gate (= `main`) | `file://` + `protocol.handle('file')` | `file://` + `webRequest` gate | `app://` custom scheme |
| --- | --- | --- | --- | --- |
| page `<img>` (file URL and raw `C:\…` path) | loads | blocked | blocked | blocked by Chromium ("Not allowed to load local resource") |
| page `fetch` / XHR | leaks | blocked (403) | blocked | blocked (origin + `connect-src`) |
| page `<script>` / CSS / `import()` | loads/runs | blocked | blocked | blocked |
| page `<video>` | loads | blocked | blocked | blocked |
| **worker `fetch`** | leaks | **leaks** | **leaks** | blocked |
| **worker `importScripts`** | runs | **runs** | **runs** | blocked |
| **worker script itself** (`new Worker(file:///…)`) | runs | **runs** | **runs** | blocked |
| blob: worker | blocked (CSP `worker-src 'self'`) | blocked | blocked | blocked |
| `app://` traversal (`..`, `%2e%2e`, `..%5C`, another host) | — | — | — | blocked |

Neither `file:` gate ever saw a worker request: dedicated workers load through a separate path ("PlzDedicatedWorker"). Electron's tracker shows this area breaking repeatedly (electron#43556, #47374).

### 3.2 Video, storage, canvas, cost

- **Video:** Chromium's first media request is `Range: bytes=0-`.
  - `net.fetch` passthrough, with the request object or with the headers copied, answered **200 with no `Content-Range`**, and the video failed outright with `MEDIA_ELEMENT_ERROR: Format error`.
  - A handler that serves the bytes itself (206, `Content-Range`, `Accept-Ranges`) played and seeked both 40 s, 50 MB clips, faststart and moov-at-end, to 1 s before the end. The seeks made range requests deep into the file, for example `bytes=42205184-`.
  - With the `app://` scheme the same held, but `net.fetch` passthrough for media could not seek: `currentTime` snapped back to 0.
- **`localStorage`:** all `file://` paths share one origin, so a page in another folder saw the keys. The `app://` origin starts empty. In one window, reading through `executeJavaScript` from a `file://` page and writing through `executeJavaScript` on an `app://` page carried the values over, non-ASCII included.
- **Canvas:** reading pixels from same-origin `app://` media worked for images and video frames.
- **Cost:** handler median 0.85 ms per image request (p95 1.15 ms). 200 sequential image loads took 992 ms with the custom scheme against 914 ms with no gate.

### 3.3 Workers have no CSP

A worker gets its policy from its own script response. `file:` responses carry no headers, and neither do handler responses unless the handler adds one. With the page CSP in a meta tag only, a worker's `fetch`, `importScripts` and WebSocket to a loopback listener **all arrived**. The worker saw "Failed to fetch" only because the response lacked CORS headers; the URL had already left. With the policy sent as a response header on the worker script, nothing arrived. The `webRequest` allowlist also saw these worker requests (`xhr`, `script`, `webSocket`) and cancelled them.

### 3.4 WebRTC and other channels the CSP does not govern

| Control | STUN over UDP | TURN over TCP | Notes |
| --- | --- | --- | --- |
| none | arrives (LAN address) | connects and sends | the CSP does not govern WebRTC |
| `disable_non_proxied_udp` | blocked | **still connects** | |
| `disableBlinkFeatures: 'RTCPeerConnection,WebRTC'` | arrives | connects | no effect |
| delete the constructors in the main world (preload `executeInMainWorld`) | arrives | connects | a script-made `about:blank` iframe brings them back; `frame-src 'none'` does not block that iframe |
| dead session proxy only | arrives | blocked | |
| **`disable_non_proxied_udp` + dead proxy** | **blocked** | **blocked** | zero bytes of any kind arrived; worker HTTP blocked too |

`<link rel=preconnect>` opened no connection to loopback. Prefetch was blocked. **DNS prefetch and preconnect to a remote host are unmeasured** (there's no remote listener), so § 7 treats them as residual defense, not as measured closure.

## 4. The scheme and its authorization

### 4.1 Registration

`protocol.registerSchemesAsPrivileged` runs at the top level of `main.js`, before `ready`, with scheme `app` and privileges `standard`, `secure`, `supportFetchAPI`, `stream` and `codeCache`. It is **not** registered with `bypassCSP`, `corsEnabled` or `allowServiceWorkers`. The handler is registered with `protocol.handle('app', …)` in `whenReady`, before the window loads.

### 4.2 `app-protocol.js` (new, CommonJS, no Electron import)

Unit-tested with Vitest via `createRequire`, like `path-grants.js`. It uses Node 22's global `Response` and `ReadableStream`, and its dependencies are injected: `createAppProtocol({ appRoot, grants, isMediaFile, getMimeType, csp, logger, fs })` returns `{ handle(request) → Promise<Response> }`.

**Routing:**
1. The method must be GET or HEAD; anything else gets 405.
2. The host must be `media-viewer`; anything else gets 404.
3. A pathname starting `/@fs/` goes to **media** (§ 4.3); anything else goes to **app file** (below).

**App files:**
- **`appRoot`** is the realpath of the folder holding `main.js`, resolved once at startup (the same G1 lesson as `INDEX_HTML`).
- **Allowed:** top-level files whose names don't start with `.` and end in `.html`, `.css` or `.js`; anything under `vendor/jxl-oxide-wasm/` or `vendor/lucide/`; anything under `node_modules/@vladmandic/face-api/dist/` or `.../model/`.
- **Resolution:** the decoded pathname segments are joined under `appRoot`. A `.` or `..` segment, after decoding, is refused, and so is any segment holding a separator or NUL. The realpath must **equal** the joined path, so no link is followed inside the app tree.
- **Refused (404):** everything else, including dotfiles and folders (`.mcp.json`, `.git`, `.claude`), `docs/`, `tests/`, `CLAUDE-SECURITY-*`, `package.json`, `*.md` and the rest of `node_modules`.
- **Content-Type** comes from a small fixed map: `.html` text/html, `.css` text/css, `.js` text/javascript, `.json` application/json, `.wasm` application/wasm, otherwise application/octet-stream.

### 4.3 The media door and the shared rule

- **Decoding:** the path is `decodeURIComponent` of the single segment after `/@fs/`. More than one segment, or a decode error, gets 404.
- **The shared rule:** `resolveMediaRead(p)` lives in `path-grants.js` (or beside it) and returns the **canonical target** or `null`. It is the one rule for page-side and main-side content reads (D12):
  - `p` must be a clean absolute path, and its **name** must have a media extension, **and**
  - either its canonical form lies inside a grant, or (the M-a link case) `resolveEntry(p)` succeeds, meaning its parent is granted, **and**
  - the **canonical target's** extension is a media extension.
- **The tightening (D12):** today's in-grant branch (`isMediaName(v) && allowed(v)`) checks only the requested name. A link named `x.jpg` inside a granted folder that points at a non-media file in the same folder passes as media, for main-side IPC reads as well. The new rule refuses it. `ipc-guard`'s `grantedMediaRead` and the media half of `grantedOrTempMediaRead` call `resolveMediaRead`; the temp-folder branch is unchanged.
- **What gets served:** the handler serves the **canonical target**, so the check and the read concern the same resolved file. That narrows, but doesn't remove, the race in § 11.

### 4.4 Serving

- **Media responses:** `Content-Type: getMimeType(ext)` (only media types, so never executable), `X-Content-Type-Options: nosniff`, `Accept-Ranges: bytes` and `Content-Length`.
- **App-file responses:** `Content-Type` from § 4.2's map, `nosniff`, `Content-Security-Policy: <csp>` (D8), and on `.html` also `X-DNS-Prefetch-Control: off`.
- **`Range`, single range only:**
  - `bytes=a-b`, `bytes=a-` and `bytes=-n` get **206** with `Content-Range: bytes s-e/size` and the matching `Content-Length`.
  - An unsatisfiable range (start ≥ size, or start > end) gets **416** with `Content-Range: bytes */size`.
  - A malformed or multi-range header is ignored, and the whole file goes back as **200** (HTTP allows ignoring `Range`).
- **Body:** `Readable.toWeb(fs.createReadStream(target, { start, end }))`. HEAD returns the same headers with no body.
- **Handle release, measured in the plan:** when the renderer cancels a request (a video released or seeked), the read stream must close its file handle. Node opens files with `FILE_SHARE_DELETE` on Windows, so a leaked handle wouldn't normally block a rename, but a held handle on a cross-volume move (copy, then unlink) is untested. The move-after-play E2E covers it (§ 8.2).
- **Refusals:** 404 with an empty body, logged as `warn` with the URL truncated to 200 characters, the same way `ipc-guard` logs.

### 4.5 Renderer

- **`media-url.js`** is a new pure ESM module exporting `toMediaUrl(path)` → `` `app://media-viewer/@fs/${encodeURIComponent(path)}` ``.
- It replaces the renderer's `pathToFileURL` method (`media-viewer.js` ~L958–969, deleted) at the 4 display sites: `showSingleMedia`, both sides of `showCompareMedia`, and `_buildTournamentSide`. It also replaces the raw-path `src` assignments in `computePerceptualHash` (video and image), `computeFeatures` (video and image) and `loadMediaAsImageData` (video and image). Those raw paths only work today because a `file:` base URL resolves `C:\…` as a relative URL.
- **Unchanged:** workers (`new Worker('…-worker.js')`) and face-api (`./node_modules/@vladmandic/face-api/…`) resolve against the page URL as they do now; JXL `blob:` URLs; and the wasm bytes, which still arrive over IPC.

## 5. Trust anchors

- **One constant:** `INDEX_URL = 'app://media-viewer/index.html'` drives `mainWindow.loadURL`, the IPC guard's expected sender and the navigation lock. This keeps G1's final-review I1 lesson: one expression for both the page we load and the page we trust.
- **IPC guard** (`ipc-guard.js`): `isTrustedSender` requires a top-level frame whose URL parses to protocol `app:`, host `media-viewer` and pathname `/index.html`, ignoring query and fragment. `normalizeFileUrl` and its tests are **deleted**: it existed only because `file:` paths have many spellings (an 8.3 alias, a junction, drive-letter case, escaping), and an `app://` URL has one canonical form. Every hit is swept from source, tests and comments (CLAUDE.md § Best Practices).
- **Navigation lock** (`createWindow`): `will-navigate` allows only `INDEX_URL`, so reloads still work, and `setWindowOpenHandler` stays deny. Main's own `loadURL`/`loadFile` calls do not fire `will-navigate`, so the migration (§ 6) needs no hole in the lock.

## 6. `localStorage` migration

The renderer keeps 14 settings in `localStorage`, among them `customLikeFolder`, `customDislikeFolder`, `customSpecialFolder`, `customShortcuts`, `recentFolders` and `sortAlgorithm`. The new origin starts empty (§ 3.2). Folder grants live in main's own file, so they're unaffected.

**Sequence** (in `createWindow`, before `INDEX_URL`, in the main window only, so Playwright's `firstWindow()` is unaffected):
1. Resolve the marker path: `process.env.MV_E2E_MIGRATION_MARKER` if set, else `userData/storage-migration.json`. If the marker exists, skip to step 6.
2. `loadFile(<appRoot>/migrate.html)`. This is a static page with no scripts, loaded under the `file://` origin, which shares the old store. Its body carries the app's background colour inline, so the one-time step shows no white flash.
3. Read the store through `executeJavaScript` as a JSON string of `[key, value]` pairs. **Validate** it in a pure function in a new `storage-migration.js`, unit-tested: an array of string pairs, at most 200 keys, at most 5 MB in total. Anything else counts as a failure (step 7).
4. `loadURL('app://media-viewer/migrate.html')`, the same static file under the new origin. Write each pair **only if the key is absent** (`getItem(k) === null`), through `executeJavaScript` with the pairs embedded as a JSON literal, so it never overwrites a newer value. The same script then sets a merge mark (`storageMigrationMerged`), last, and does nothing at all on a store that already holds the mark. **Amended 2026-10-19 (PR #84 review):** without the mark, a re-run after a completed write (the marker write failed) brought back any carried key the user had removed in between, since "absent" can't tell never-set from removed. Then flush storage to disk and wait 1 s before step 5. **Amended 2026-10-18 (final review):** Chromium holds `localStorage` writes in memory for a few seconds, so a marker written straight after could outlive the data it records.
5. Write the marker `{ version: 1, migratedAt, keys: <count>, written: <count> }`.
6. `loadURL(INDEX_URL)`.
7. **On any failure** in steps 2–5: log a `warn`, write no marker (so it retries next launch), and continue to step 6. The migration never blocks startup.

The old `file://` store is **left untouched**: checking out an older commit still finds its settings, frozen at migration time. Only the app writes to that store, and the renderer already treats everything in it as untrusted (G1's kinds validate every path it holds).

**E2E isolation:** `launchApp()` sets `MV_E2E_MIGRATION_MARKER` to a pre-written marker in its temp folder, so the migration is skipped. Without that, the shared E2E profile's old `file://` store, which holds leftovers from earlier runs, would leak into tests. Production and E2E take the same code path; only the marker location differs.

## 7. CSP and egress

- **CSP** (D8): one constant in `main.js`, sent by the handler on every app-file response:
  `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'`
  Compared with today's policy, it drops `file:` (img, media) and the Lucide URL, and adds `frame-ancestors`, which works only as a header. The meta tag and its comment in `index.html` are removed, and the measurement history moves to this spec. The renderer's `securitypolicyviolation` forwarding is unchanged; the CSP walk measures the result.
- **Lucide** (D10): `vendor/lucide/lucide.min.js` (1.14.0) plus its ISC `LICENSE`. It is downloaded once with a generic User-Agent and **verified against the current SRI** (`sha384-jB6ZXxyEV94yzTxgLMvrwwNbn/pTTqwrMDI+v8FV5o5FnId/yn3DJwSdrDujU9A7`) before it is committed. `index.html` loads `vendor/lucide/lucide.min.js`, and its `integrity` and `crossorigin` attributes are dropped (same origin). The E2E Lucide CDN stub (`page.route('**/unpkg.com/**')`) is deleted.
- **WebRTC** (D9): `mainWindow.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` and `session.defaultSession.setProxy({ proxyRules: '127.0.0.1:9', proxyBypassRules: '<-loopback>' })`, the latter awaited before the window loads. `<-loopback>` removes Chromium's implicit loopback bypass; without it, a TURN or WebSocket attempt to a local service would go direct. The main process is unaffected, since CLIP model downloads use Node's global `fetch`, not the session. Port 9 is the discard port, and nothing normally listens there. If something did, it would receive proxy `CONNECT` attempts on loopback and fail them, since it isn't an HTTP proxy, so nothing would reach a remote host.
- **Allowlist** (D11): `session.defaultSession.webRequest.onBeforeRequest` cancels every `http:`, `https:`, `ws:` and `wss:` request and logs a `warn` with the resource type and the URL truncated. Every other scheme passes (`app:`, `blob:`, `data:`, `devtools:`).
- **Also:** `webPreferences.spellcheck = false`, so no dictionary download. `X-DNS-Prefetch-Control: off` on the page (§ 4.4) is unmeasured, and stated as such.

## 8. Testing

### 8.1 RED-first E2E (each must fail on `main`)

The new `tests/e2e/security-page-loads.test.js` uses a granted fixture folder and a secret folder outside every grant (`createTempFixtureDir` plus a second temp folder holding `secret.txt`, `secret.png`, `evil.js`, `evil.mjs`, `evil.css`, `evil-worker.js` and `secret.mp4`). Each probe runs in the page through `page.evaluate`, with a worker where noted, and asserts that the load **fails**:

- **From the page:** `<img>` by file URL and by raw path; `fetch`; XHR; `<script>`; CSS `<link>`; `import()`; `<video>`.
- **From a worker:** the probe spawns one of the app's own workers from the page (`new Worker('ml-worker.js')`), takes it from `page.waitForEvent('worker')`, and runs `fetch` and `importScripts` inside it with Playwright's `worker.evaluate`. That's the app's own code with attacker-equivalent calls, so no attacker script needs to exist. Separately: a worker whose script is itself a file URL. The plan's first E2E task confirms that `worker.evaluate` attaches to an Electron page's dedicated worker; if it doesn't, stop and re-plan this probe rather than weaken it.
- **The app folder:** `.git/HEAD` and `package.json` (by file URL on `main`, by `app://` on the branch).
- **The media door:** a media file outside the grants; a non-media file inside a grant; and a media-named link inside a grant pointing at a non-media file (D12). Links are created the way `security-ipc.test.js` already does: `symlink(…, 'file')`, with `test.skip(err.code === 'EPERM', …)` where Windows lacks Developer Mode.
- **Egress:** loopback listeners in the test process; nothing must arrive. Worker `fetch` and WebSocket to `127.0.0.1:<port>` (arrive on `main`); a WebRTC TURN connection over TCP to `127.0.0.1:<port>` (connects on `main`).

**Regression only, labelled as such**, because they are already blocked on `main`: page `sendBeacon`, page WebSocket, blob worker.

### 8.2 Behaviour (not RED: these pass on `main` and must keep passing)

- **Video through the handler:** a clip of several MB generated at test time with `ffmpeg-static` into the temp fixture folder (no binary fixture committed) plays in single mode, then seeks past the buffered range (`seeked` fires, a frame draws). The file is then moved with Like, and the move succeeds, which shows the handle was released (§ 4.4).
- **Migration:** launch 1, with migration skipped, seeds the `file://` store through a hidden window that `electronApp.evaluate` creates: real `C:\…` folder paths, `customShortcuts` JSON, non-ASCII `recentFolders`, and one key also pre-set in the `app://` origin. Launch 2, with a fresh marker path, finds the values, keeps the pre-set key's newer value, and has written the marker. A third launch writes nothing. (As built: launch 2 ends in a hard kill, and a fifth launch, after the marker is deleted and one carried key removed, leaves that key absent.)
- **Existing suites:** unit and E2E green. The CSP walk (`security-csp-walk.test.js`) is green with the header policy and no Lucide stub. Of the tests that reference `file:` URLs:
- `security-render.test.js`'s navigation-lock test navigates to a `file://` page and keeps passing unchanged (on the branch, Chromium and the lock both refuse it). It gains an `app://media-viewer/other.html` case, because the lock must refuse another page on the app's own origin too.
- `ipc-guard.test.js` changes per § 8.3.
- `clip-image.test.js`'s `pathToFileURL` imports a Node module in the test process and doesn't involve the page (checked), so it is unchanged.

### 8.3 Unit (Vitest)

- **`app-protocol.test.js`:**
  - methods and host
  - the allowlist: served (`index.html`, `styles.css`, a top-level `.js`, files under each vendor and face-api subtree); refused (dotfiles, `.git/HEAD`, `docs/x.md`, `tests/…`, `CLAUDE-SECURITY-x/…`, other `node_modules`, `package.json`, a link inside the app tree)
  - traversal: `..`, `%2e%2e`, `..%5C`, an encoded NUL
  - media decoding: a UNC path, a drive letter, POSIX, `%5C`, `%2F`, non-ASCII, more than one segment
  - the media rule through the real `createGrantStore` over temp folders: granted media; ungranted media; a non-media file in a grant; a link to media; a link to non-media; a media-named link to non-media (D12, RED)
  - every `Range` shape and its status code
  - headers: media types only, `nosniff`, the CSP on app files, prefetch-off on `.html`
  - HEAD with no body
- **`ipc-guard.test.js`:** the exact `INDEX_URL` sender is accepted; a `file://…/index.html` sender is **refused** (RED); query and fragment are ignored; another host or path, and a subframe, are refused. `grantedMediaRead` refuses a media-named link to non-media (D12, RED). The `normalizeFileUrl` tests are deleted with the function.
- **`storage-migration.test.js`:** the validator's caps and shapes; the write script is built as a JSON literal (backslashes, quotes, U+2028).
- **`media-url.test.js`:** `toMediaUrl` round-trips through the handler's decoder (ESM import plus CJS `require`).
- **A source check:** no renderer file (`media-viewer.js`, the ES modules, the workers) contains `file://` or a raw-path `src` assignment. This is a control, not a convention (memory `feedback_convention_is_not_a_control.md`).

### 8.4 Manual (user, one real-folder session)

The session runs on a copy of the profile (D13). Afterwards the copy holds the migration marker and the real profile doesn't. After the merge, the first launch on the real profile is checked once for current settings.

Images, video with seeking, JXL, compare, tournament, and AI sort with CLIP. Icons render from the vendored file, the real settings survived the migration (like/dislike/special folders, shortcuts, recent folders), and the session log shows no refusals and no cancelled requests.

## 9. Acceptance

1. Every § 8.1 RED test fails on `main` (shown, not assumed) and passes on the branch.
2. § 8.2 behaviour tests pass, including video seeking and the migration.
3. The unit and E2E suites pass, and the CSP walk is green.
4. The user's _Scan changes_ comes back clean for these sites.
5. The § 8.4 manual session succeeds.

## 10. Error handling

- **Handler refusal:** 404 plus a `warn` log. The renderer's existing paths handle the failed load: the load-error toast, `_skipFailedTournamentFile`, compare's bounded retry and single-mode fallback.
- **Cancelled network request:** `warn` log.
- **Migration failure:** `warn` log, no marker, retry next launch; startup continues.
- **Handler exception:** caught, answered with 500, logged as `error`. It never throws into Electron.

## 11. Residuals and out of scope

- **The check-then-read race inside a granted root** (G1 § 3.1): narrower, because the handler serves the resolved target, but a component swapped for a link between `realpath` and `open` would still be followed. It needs write access at the right instant, which is outside the threat model.
- **DNS prefetch and preconnect to remote hosts:** mitigated (the dead proxy, prefetch-control off) but **unmeasured**.
- **A compromised page can still read** every granted folder's media and the public app source, which is what the app displays. What closes is every measured way out (§ 3.4).
- **`sandbox: false`** stays (G1 § 10).
- **The old `file://` `localStorage` copy** stays on disk, by design (§ 6).
- **A migration that fails before its write** (added 2026-10-19, PR #84 review) leaves the session on an empty store. If the user sets a carried setting in that session and then removes it (a folder's clear button, the shortcut reset), the retry at the next launch writes the old value back. Accepted: skipping the merge whenever the new store holds keys would drop every carried setting for a user who changed any one of them in the failed session. The remedy, if it bites, is for the four removal sites to leave a tombstone instead of removing the key.
- **A build from before the merge, run after it** (a branch cut earlier, an older commit) reads and writes only the old store, so its setting changes never reach the new version. This is accepted: after the merge the user runs merged builds. If it bites, the remedy is a deliberate re-copy, not built now.
- **Main-process network** (CLIP model download) is unaffected, by design.
- **Drag-and-drop folder loading** is still dead (a G1 residual, BACKLOG 🟤).

## 12. Estimate and models

- **SP: about 7** against 5 planned (WEEKLY re-estimated I1 once already, from ~1.5–2.5 to 5). That's inside the 2× abort line. G1 runs into Wednesday, and the WEEKLY drop order (G4, then G5) absorbs it.

| Area | SP |
| --- | --- |
| `app-protocol.js`: routing, allowlist, `Range`, shared media rule | 1.5 |
| Trust anchors (IPC guard, navigation lock, `INDEX_URL`), `normalizeFileUrl` deletion | 0.75 |
| `localStorage` migration | 1 |
| Renderer `toMediaUrl` (10 sites) | 0.5 |
| CSP header, egress, Lucide vendoring | 0.75 |
| Unit tests | 0.75 |
| E2E: RED suite, video, egress, migration | 1.5 |
| Docs (CLAUDE.md, ARCHITECTURE.md) | 0.25 |

- **Execute:** Opus · `high` for `app-protocol.js`, the shared rule and the trust anchors (the security core, as G1 did); Opus · `medium` for the renderer, migration, egress and E2E tasks. The plan confirms or revises this.
- **Review:** deep (`max`), plus the user's _Scan changes_.

## 13. Docs to update at closeout

- **`CLAUDE.md` § Security:** I1 closed. Replace "the `file://` page itself can load any `file:` URL" with the scheme, the media door, the header CSP and the egress controls. Add `app-protocol.js`, `media-url.js`, `storage-migration.js`, `migrate.html` and `vendor/lucide/` to the Architecture tree.
- **`CLAUDE.md` § Active gotchas:** the Lucide CDN/SRI/CSP bump gotcha becomes a vendored-file note. Add "media URLs go through `toMediaUrl`; never `file:`", and note the migration marker's environment variable in the E2E bullets.
- **`CLAUDE.md` § Testing (E2E):** the Lucide CDN stub bullet goes; add `MV_E2E_MIGRATION_MARKER`.
- **`docs/ARCHITECTURE.md`:** the protocol and data-flow change.
- **The committed G1 spec** (`docs/superpowers/specs/2026-10-10-g1-security-findings-fix-design.md`) § 12 I1 residual: add a "closed by" note pointing here.
- **Planning:** TODO 🔴 item → DONE; the WEEKLY G1 row; this spec moves to `docs/superpowers/specs/` and is indexed in `docs/README.md`.

## 14. Session record: the `onFailure` trial vehicle (not part of I1)

The REVIEW-QUEUE § 5 trial ran at the start of this session, per the WEEKLY ruling.
- **Precondition met:** the terminal CLI was updated to 2.1.302 by the user. The auto-mode classifier refused the guard-script rename as self-modification, so the user ran it in their own terminal.
- **Probe:**
  - with the field unset and the script missing, a harmless command **ran** (the control)
  - with `"onFailure": "block"` added, the same command was **blocked** (`failed; blocking because onFailure is "block"`, `MODULE_NOT_FOUND`)
  - the script was restored with Read and Write, and commands ran again
  - `git` showed only the 2-line `.claude/settings.json` change
- **Still open:** the trial question's other half, zero spurious blocks over the rest of the session, is read out at G6. The settings change is committed on this branch with the stub plan.
- **Evidence for that read-out (closeout, 2026-10-19):** the session transcript holds exactly two hook events, the probe's own (the non-blocking control, then the forced-failure block, both at 04:19 on 2026-10-18), and none after them through the closeout, 2026-10-19 02:30. The probe's block appearing in the same search shows the search can see one. Recorded in REVIEW-QUEUE § 5.

## 15. Post-implementation note (2026-10-19)

**Shipped as designed**, in PR #84 (15 commits, merge `4548269`). Every confined load class had an E2E test that failed on `main` first; § 8's other tests each passed a mutation check. Unit 1555 → 1666 (1 skipped); E2E 163 → 194 passed (6 skipped).

**Where the build departed from the plan** (each a ruling in the execution ledger; the archived plan lists them):
- **The page-side "media name, non-media link target" test** passed on `main`: Chromium's Windows `file:` loader serves a file symlink as 200 with an empty body. It stays as a guard on the branch. The class's RED test is the main-side read (§ 8.1), which did fail on `main`.
- **`READ_SCRIPT`** enumerates through `localStorage.length` and `key(i)`. The planned `Object.keys(localStorage)` failed its own unit test against a Storage-shaped fake.
- **The video test's clip is ~43 MB**, not "several MB" (§ 8.2). A smaller clip was buffered whole, so seeking still worked with range support forced off. The test asserts the size as a precondition.
- **The WebRTC test asserts that ICE gathering finds no UDP candidate**, not that no datagram arrives. A loopback datagram probe saw nothing even with both controls removed, so it could not fail (its positive control failed). The candidate check fails when the policy line is removed.

**Review history:**
- **Final whole-branch review** (fresh reviewer): no confinement break; two Important findings, both fixed with failing-first tests. The settings move now flushes storage to disk before its marker (§ 6 step 4; measured: a kill 2 s after the write lost it). And the two network controls gained tests that fail without them.
- **_Scan changes_** (user): no findings, which is a clean pass, not a clearance.
- **A background per-commit review** raised the check-then-read race. It is § 11's first residual, present on `main` with the same split and narrowed here. Two hardening follow-ups went to BACKLOG: pass the canonical target to the content-read handlers, and refuse a dangling link leaf in `canonicalize`.
- **PR review, round 1** (user, separate chat): one finding, the retry case now covered by § 6's merge mark. Its open trade-off is the new § 11 residual. Every claim in the PR description was confirmed or accepted.

**Manual session** on a copy of the profile (D13): the copy's marker recorded 11 keys, all written; images, video, compare, tournament and AI sort behaved normally. The real profile migrates at its first launch after the merge (a user check, carried in TODO.md).
