const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // createReadStream/createWriteStream for streaming the feature cache
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');
const { isMediaFile, getMimeType } = require('./media-formats');
const { packFeatureChunk } = require('./feature-cache-transport');
const { pathToFileURL } = require('url');
const { createGrantStore, createTempDirRegistry, isInsideDir } = require('./path-grants');
const { createIpcGuard, tierAssignmentsKind, normalizeFileUrl } = require('./ipc-guard');

// Per-folder cache files the renderer may read and write by NAME (G1): main joins the file
// name, so the renderer never names a file path for these channels.
const FOLDER_CACHE_FILES = Object.freeze({
    hash: '.hash_cache.json',
    sort: '.sort_cache.json',
    feature: '.feature_cache.json',
});

// The one page this app shows, loaded AND authorized from this constant (final review I1).
// loadFile() with a relative name resolves against app.getAppPath(), which keeps a link in the
// launch path, while __dirname is the resolved real path: two expressions meant the window's URL
// and the URL the IPC guard expected differed whenever the app was launched through a link.
const INDEX_HTML = path.join(__dirname, 'index.html');

// Streaming JSON reader for the feature cache (parse a 250MB+ file with a tiny memory
// footprint instead of fs.readFile + JSON.parse, which peaks past ~1GB and kills the process).
const { parser: jsonParser } = require('stream-json');
const { pick: jsonPick } = require('stream-json/filters/Pick');
const { streamObject: jsonStreamObject } = require('stream-json/streamers/StreamObject');

// ffprobe for video metadata extraction
let ffprobePath;
try {
    ffprobePath = require('ffprobe-static').path;
    console.log('ffprobe loaded from:', ffprobePath);
} catch (e) {
    console.warn('ffprobe-static not available:', e.message);
    ffprobePath = null;
}

// ffmpeg for video keyframe extraction
let ffmpegPath;
try {
    ffmpegPath = require('ffmpeg-static');
    console.log('ffmpeg loaded from:', ffmpegPath);
} catch (e) {
    console.warn('ffmpeg-static not available:', e.message);
    ffmpegPath = null;
}

const execFileAsync = promisify(execFile);

// Every ffmpeg/ffprobe run is pinned to the file protocol (G1): a media file is opened by path,
// and nothing it references (a playlist entry, a concat list) may reach the network or another
// protocol. Measured on the bundled builds: real files, keyframe extraction and Windows drive
// paths are unaffected. tests/main-hardening.test.js pins that no call bypasses this wrapper.
function runMediaTool(toolPath, args, options) {
    return execFileAsync(toolPath, ['-protocol_whitelist', 'file', ...args], options);
}

// CLIP model for semantic embedding extraction (lazy-loaded)
let clipProcessor = null;
let clipVisionModel = null;
let clipModelLoading = false;
let clipModelError = null;

async function loadClipModel(event) {
    if (clipVisionModel) return { success: true };
    if (clipModelError) return { success: false, error: clipModelError };
    if (clipModelLoading) {
        // Wait for in-progress load
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (!clipModelLoading) {
                    clearInterval(check);
                    resolve(clipVisionModel ? { success: true } : { success: false, error: clipModelError });
                }
            }, 200);
        });
    }

    clipModelLoading = true;
    try {
        const { AutoProcessor, CLIPVisionModelWithProjection } = await import('@huggingface/transformers');

        clipProcessor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32', {
            progress_callback: (progress) => {
                if (progress.status === 'progress' && event && !event.sender.isDestroyed()) {
                    event.sender.send('clip-download-progress', {
                        progress: Math.round(progress.progress || 0),
                        file: progress.file || '',
                    });
                }
            },
        });

        clipVisionModel = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', {
            dtype: 'q8',
            progress_callback: (progress) => {
                if (progress.status === 'progress' && event && !event.sender.isDestroyed()) {
                    event.sender.send('clip-download-progress', {
                        progress: Math.round(progress.progress || 0),
                        file: progress.file || '',
                    });
                }
            },
        });

        clipModelLoading = false;
        return { success: true };
    } catch (error) {
        clipModelLoading = false;
        clipModelError = error.message;
        return { success: false, error: error.message };
    }
}

let mainWindow;
let isQuitting = false; // set true once the user confirms, to let the re-issued close() through

function createWindow() {
    isQuitting = false; // re-arm the close confirm for this window (macOS dock-activate re-creates it)
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false, // Changed from true to false
        },
        title: 'Media Viewer',
    });

    mainWindow.loadFile(INDEX_HTML);

    // Navigation lock (G1 § 6.2): the window only ever shows the app's own index.html, the same
    // page the IPC guard authorizes. A page-initiated navigation anywhere else, and every
    // window.open, is refused and logged. Reloading the app page itself stays allowed.
    const appUrl = normalizeFileUrl(pathToFileURL(INDEX_HTML).href);
    mainWindow.webContents.on('will-navigate', (event, legacyUrl) => {
        const url = event.url ?? legacyUrl;
        if (normalizeFileUrl(url) === appUrl) return;
        event.preventDefault();
        logger.warn('navigation', `Blocked navigation to ${String(url).slice(0, 200)}`);
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        logger.warn('navigation', `Blocked window.open of ${String(url).slice(0, 200)}`);
        return { action: 'deny' };
    });

    // Enable DevTools toggle with F12 or Ctrl+Shift+I
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
        }
    });

    // Confirm before close when a tournament is in progress. Every close path — the window
    // "X", app.quit() (via window-all-closed), and the Alt+F4 globalShortcut (which calls
    // focusedWindow.close()) — fires this 'close' event, so one handler covers them all.
    // preventDefault, ask the renderer (which owns tournament state), and proceed only when
    // it replies via 'app-close-allow'.
    mainWindow.on('close', (e) => {
        if (isQuitting) return; // already confirmed → let the re-issued close() through
        const wc = mainWindow.webContents;
        if (wc.isDestroyed() || wc.isCrashed()) return; // dead renderer → never trap the app
        e.preventDefault();
        wc.send('app-close-requested');
    });
}

// App lifecycle
app.whenReady().then(async () => {
    // Initialize file logger
    logger.init(app.getPath('logs'));

    // Intercept console methods to also write to log file
    const formatArgs = (args) => args.map((a) => (a instanceof Error ? a.stack || String(a) : String(a))).join(' ');
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = (...args) => {
        originalLog(...args);
        logger.log('main', formatArgs(args));
    };
    console.warn = (...args) => {
        originalWarn(...args);
        logger.warn('main', formatArgs(args));
    };
    console.error = (...args) => {
        originalError(...args);
        logger.error('main', formatArgs(args));
    };
    // First line through the intercepted console, so every kept session log says which build wrote it.
    console.log(
        `Media Viewer ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'dev'}) — session log: ${logger.getLogPath()}`
    );

    // Folder grants (G1): every privileged file IPC acts only on paths inside a folder the user
    // picked in main's own dialog. MV_E2E_GRANTS_FILE gives each E2E launch a fresh store and
    // exposes it to electronApp.evaluate (main process only — the renderer cannot reach it).
    const grants = createGrantStore({
        storePath: process.env.MV_E2E_GRANTS_FILE || path.join(app.getPath('userData'), 'folder-grants.json'),
    });
    const grantLoad = await grants.load();
    console.log(`Folder grants: ${grantLoad.ok ? `${grantLoad.count} loaded` : grantLoad.reason}`);
    if (process.env.MV_E2E_GRANTS_FILE) {
        global.__mvGrants = grants;
    }
    const tempDirs = createTempDirRegistry();
    const guard = createIpcGuard({
        ipcMain,
        grants,
        tempDirs,
        expectedUrl: pathToFileURL(INDEX_HTML).href,
        logger,
        isMediaFile, // lets a symlinked media file be read (review M-a); see ipc-guard's grantedMediaRead
    });
    const { kinds, int, optional, oneOf, arrayOf, shape } = guard;

    // A fixed-name file inside a granted folder can itself be a planted link out of it (final
    // review I2): the folder argument passed the guard, but readFile/writeFile would follow a link
    // at the joined name. Every concrete path a handler opens is checked here: it must not be a
    // link (the app never creates one), and it must resolve inside a granted folder. Throws, so
    // each handler's existing catch turns it into that channel's usual failure value.
    async function assertFixedPath(p) {
        try {
            if ((await fs.lstat(p)).isSymbolicLink()) {
                throw new Error(`Not permitted: ${path.basename(p)} is a link`);
            }
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }
        if ((await grants.resolveAllowed(p)) === null) {
            throw new Error(`Not permitted: ${path.basename(p)}`);
        }
    }

    createWindow();

    // Renderer's verdict on a close confirm (no tournament, or Save & leave / Discard chosen).
    // Registered once here (not in createWindow) so it does not accumulate when a window is
    // re-created via the macOS dock-activate path. It closes over the module-level mainWindow,
    // which createWindow reassigns, so it always targets the current window.
    // Trusted by sender identity, not the page URL: closing is not privileged, and the close
    // handler has already called preventDefault — a refusal here would trap the window.
    guard.on(
        'app-close-allow',
        () => {
            // mainWindow is never nulled, so guard on isDestroyed() (symmetric to the close
            // handler's send-side guard) — calling close() on a destroyed window would throw.
            if (mainWindow && !mainWindow.isDestroyed()) {
                isQuitting = true;
                mainWindow.close();
            }
        },
        { isTrusted: (event) => !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents }
    );

    // Register Alt+F4 to close the focused window (Windows compatibility)
    globalShortcut.register('Alt+F4', () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.close();
        }
    });

    // Handle folder selection. The ONLY place a folder is granted (G1): the user picked it here.
    guard.handle(
        'open-folder-dialog',
        [optional(kinds.string)],
        async (_event, defaultPath) => {
            try {
                const options = {
                    properties: ['openDirectory'],
                    title: 'Select Media Folder',
                    buttonLabel: 'Select Folder',
                };
                if (typeof defaultPath === 'string' && path.isAbsolute(defaultPath)) {
                    options.defaultPath = defaultPath; // re-pick opens at the saved folder
                }
                const result = await dialog.showOpenDialog(mainWindow, options);
                if (result.canceled) {
                    return null;
                }
                const picked = result.filePaths[0];
                const granted = await grants.grant(picked);
                if (!granted.path) {
                    console.warn('Folder grant failed for', picked);
                    return null;
                }
                if (!granted.persisted) {
                    console.warn('Folder grant not persisted (session only):', picked);
                }
                return picked;
            } catch (error) {
                console.error('Dialog error:', error);
                return null;
            }
        },
        { rejectValue: null }
    );

    // Which of these paths are granted (G1 re-pick flow). Reveals grant membership only.
    guard.handle(
        'get-grant-status',
        [arrayOf(kinds.string, 16)],
        // true = granted, false = not granted (re-pick), 'unreachable' = granted but nothing on the
        // path resolves, e.g. its drive is absent (review M-b). Reveals grant membership only.
        async (_event, paths) =>
            Promise.all(
                paths.map(async (p) => {
                    const s = await grants.status(p);
                    return s === 'granted' ? true : s === 'unreachable' ? 'unreachable' : false;
                })
            ),
        { rejectValue: null }
    );

    // Load media files from folder
    guard.handle('load-folder', [kinds.grantedPath], async (event, folderPath) => {
        try {
            console.log('Loading folder:', folderPath);
            const files = await fs.readdir(folderPath);
            const mediaFiles = [];

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                try {
                    const stats = await fs.stat(filePath);

                    if (stats.isFile()) {
                        const ext = path.extname(file).toLowerCase();
                        if (isMediaFile(ext)) {
                            mediaFiles.push({
                                name: file,
                                path: filePath,
                                size: stats.size,
                                mtimeMs: stats.mtimeMs,
                                type: getMimeType(ext),
                            });
                        }
                    }
                } catch (fileError) {
                    console.warn(`Could not process file ${file}:`, fileError.message);
                    continue;
                }
            }

            console.log(`Found ${mediaFiles.length} media files`);
            return { success: true, files: mediaFiles };
        } catch (error) {
            console.error('Load folder error:', error);
            return { success: false, error: error.message };
        }
    });

    // File operations
    guard.handle(
        'move-file',
        [shape({ sourcePath: kinds.grantedEntry, targetFolder: kinds.grantedPath, fileName: kinds.basename })],
        async (event, data) => {
            try {
                const { sourcePath, targetFolder, fileName } = data;
                await fs.mkdir(targetFolder, { recursive: true });
                const targetPath = path.join(targetFolder, fileName);
                await fs.rename(sourcePath, targetPath);
                return { success: true, targetPath };
            } catch (error) {
                console.error('File move error:', error);
                return { success: false, error: error.message };
            }
        }
    );

    // Tournament state persistence
    guard.handle('readTournamentState', [kinds.grantedPath], async (_event, folderPath) => {
        try {
            const statePath = path.join(folderPath, '.tournament_state.json');
            await assertFixedPath(statePath);
            const text = await fs.readFile(statePath, 'utf-8');
            const json = JSON.parse(text);
            return { success: true, state: json };
        } catch (err) {
            if (err.code === 'ENOENT') {
                return { success: true, state: null };
            }
            return { success: false, error: err.message };
        }
    });

    guard.handle('writeTournamentState', [kinds.grantedPath, kinds.any], async (_event, folderPath, state) => {
        const statePath = path.join(folderPath, '.tournament_state.json');
        const tmpPath = statePath + '.tmp';
        try {
            await assertFixedPath(tmpPath);
            await assertFixedPath(statePath);
            const text = JSON.stringify(state, null, 2);
            await fs.writeFile(tmpPath, text, 'utf-8');
            await fs.rename(tmpPath, statePath); // atomic replace — no torn file on crash mid-write
            return { success: true };
        } catch (err) {
            await fs.unlink(tmpPath).catch(() => {}); // best-effort cleanup of the temp file
            return { success: false, error: err.message };
        }
    });

    guard.handle('deleteTournamentState', [kinds.grantedPath], async (_event, folderPath) => {
        try {
            const statePath = path.join(folderPath, '.tournament_state.json');
            await fs.unlink(statePath);
            return { success: true };
        } catch (err) {
            if (err.code === 'ENOENT') {
                return { success: true };
            }
            return { success: false, error: err.message };
        }
    });

    // ---- ML model cache (app data, keyed by training-set fingerprint) ----
    // Lives in userData, NOT in a media folder: the model is a function of the like/dislike
    // folders and is reusable from every source folder, which is the whole point of the
    // fingerprint. See docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md.
    const mlModelCachePath = () => path.join(app.getPath('userData'), 'ml-model-cache.json');

    guard.handle('read-ml-model-cache', [], async () => {
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

    guard.handle('write-ml-model-cache', [kinds.any], async (_event, store) => {
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

    guard.handle('readBulkRatedFile', [kinds.grantedPath], async (_event, folderPath) => {
        try {
            const filePath = path.join(folderPath, '.bulk_rated.json');
            await assertFixedPath(filePath);
            const text = await fs.readFile(filePath, 'utf-8');
            const json = JSON.parse(text);
            return { success: true, data: json };
        } catch (err) {
            if (err.code === 'ENOENT') {
                return { success: true, data: null };
            }
            return { success: false, error: err.message };
        }
    });

    guard.handle('writeBulkRatedFile', [kinds.grantedPath, kinds.any], async (_event, folderPath, data) => {
        try {
            const filePath = path.join(folderPath, '.bulk_rated.json');
            await assertFixedPath(filePath);
            const text = JSON.stringify(data, null, 2);
            await fs.writeFile(filePath, text, 'utf-8');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    guard.handle(
        'applyTournamentResults',
        [kinds.grantedPath, tierAssignmentsKind({ isMediaFile })],
        async (_event, folderPath, tierAssignments) => {
            const moved = [];
            const failed = [];

            // Belt-and-braces (G1): the guard already refused anything that could leave the folder;
            // this re-checks the paths actually built, so a future change to how they are built
            // cannot silently reopen it.
            const root = path.resolve(folderPath);
            // isInsideDir, not `startsWith(root + sep)`: that form rejected every path on a
            // drive-root folder such as E:\ (final review I4).
            const insideRoot = (p) => isInsideDir(path.resolve(p), root);
            const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
            let realRoot;
            try {
                realRoot = await fs.realpath(root);
            } catch (err) {
                return { success: false, error: `Failed to resolve ${root}: ${err.message}`, moved, failed };
            }

            const tiers = new Set(Object.values(tierAssignments));

            // Each tier becomes a path segment (`_Tier-<tier>`), and it is rebuilt from the folder's own
            // .tournament_state.json, which anyone who can write to the folder controls. Only the engine's
            // win count — a non-negative integer — is a safe single segment; a string such as '/../../x'
            // would let path.join climb out of folderPath. Refuse the whole batch before any mkdir/rename.
            for (const tier of tiers) {
                if (!Number.isSafeInteger(tier) || tier < 0) {
                    return { success: false, error: 'Invalid tier value in tournament results', moved, failed };
                }
            }

            for (const tier of tiers) {
                const tierDir = path.join(folderPath, `_Tier-${tier}`);
                if (!insideRoot(tierDir)) {
                    return { success: false, error: 'Tier folder outside the media folder', moved, failed };
                }
                try {
                    await fs.mkdir(tierDir, { recursive: true });
                } catch (err) {
                    return {
                        success: false,
                        error: `Failed to create ${tierDir}: ${err.message}`,
                        moved,
                        failed,
                    };
                }
                // mkdir(recursive) succeeds silently on an existing _Tier-N, and rename would follow
                // it if it were a link or junction planted in the folder: each tier folder must
                // resolve to exactly itself, directly inside the real folder. Checked for every tier
                // before the first rename, so a refusal moves nothing.
                try {
                    const realTier = await fs.realpath(tierDir);
                    if (fold(realTier) !== fold(path.join(realRoot, `_Tier-${tier}`))) {
                        return { success: false, error: `Tier folder is a link: _Tier-${tier}`, moved, failed };
                    }
                } catch (err) {
                    return { success: false, error: `Failed to check ${tierDir}: ${err.message}`, moved, failed };
                }
            }

            for (const [srcPath, tier] of Object.entries(tierAssignments)) {
                try {
                    const tierDir = path.join(folderPath, `_Tier-${tier}`);
                    const baseName = path.basename(srcPath);
                    let destPath = path.join(tierDir, baseName);

                    let counter = 1;
                    const ext = path.extname(baseName);
                    const stem = path.basename(baseName, ext);
                    while (
                        await fs
                            .access(destPath)
                            .then(() => true)
                            .catch(() => false)
                    ) {
                        destPath = path.join(tierDir, `${stem} (${counter})${ext}`);
                        counter++;
                    }

                    if (!insideRoot(destPath)) {
                        failed.push({ path: srcPath, error: 'Destination outside the media folder' });
                        continue;
                    }
                    await fs.rename(srcPath, destPath);
                    moved.push({ srcPath, destPath });
                } catch (err) {
                    failed.push({ path: srcPath, error: err.message });
                }
            }

            if (failed.length === 0) {
                try {
                    await fs.unlink(path.join(folderPath, '.tournament_state.json'));
                } catch (_err) {
                    // state file may not exist — ignore
                }
            }

            return { success: failed.length === 0, moved: moved.length, failed };
        },
        { rejectValue: () => ({ success: false, error: 'Not permitted', moved: 0, failed: [] }) }
    );

    guard.handle(
        'check-folder-exists',
        [kinds.grantedPath],
        async (event, folderPath) => {
            try {
                await fs.access(folderPath);
                return true;
            } catch {
                return false;
            }
        },
        { rejectValue: false }
    );

    guard.handle(
        'check-file-exists',
        [kinds.grantedEntry],
        async (event, filePath) => {
            try {
                await fs.access(filePath);
                return true;
            } catch {
                return false;
            }
        },
        { rejectValue: false }
    );

    guard.handle('create-folder', [kinds.grantedPath], async (event, folderPath) => {
        try {
            await fs.mkdir(folderPath, { recursive: true });
            return { success: true };
        } catch (error) {
            console.error('Create folder error:', error);
            return { success: false, error: error.message };
        }
    });

    // Fixed-name per-folder caches (G1): replaces the generic read-file/write-file, which acted
    // on any path the renderer named.
    guard.handle(
        'read-folder-cache',
        [kinds.grantedPath, oneOf('hash', 'sort', 'feature')],
        async (_event, folderPath, name) => {
            try {
                const filePath = path.join(folderPath, FOLDER_CACHE_FILES[name]);
                await assertFixedPath(filePath);
                return await fs.readFile(filePath, 'utf8');
            } catch (_error) {
                return null; // missing or unreadable — same contract as the old read-file
            }
        },
        { rejectValue: null }
    );

    guard.handle(
        'write-folder-cache',
        [kinds.grantedPath, oneOf('hash', 'sort', 'feature'), kinds.string],
        async (_event, folderPath, name, data) => {
            try {
                const filePath = path.join(folderPath, FOLDER_CACHE_FILES[name]);
                await assertFixedPath(filePath);
                await fs.writeFile(filePath, data, 'utf8');
                return { success: true };
            } catch (error) {
                console.error('Write folder cache error:', error);
                return { success: false, error: error.message };
            }
        }
    );

    // Read any file as raw bytes (no encoding) and return an ArrayBuffer. Used by the JXL
    // decode pipeline, which needs the original compressed bytes rather than a UTF-8 string.
    guard.handle(
        'read-file-buffer',
        [kinds.grantedMediaRead],
        async (_event, filePath) => {
            try {
                const data = await fs.readFile(filePath); // Buffer (no encoding)
                // Slice out exactly this Buffer's view — Node Buffers can be windows into a larger
                // pooled ArrayBuffer, so returning data.buffer directly would leak unrelated bytes.
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            } catch (_error) {
                return null;
            }
        },
        { rejectValue: null }
    );

    // Read the vendored jxl-oxide decoder wasm and return its bytes as an ArrayBuffer. Passing
    // explicit wasm bytes to the decode worker avoids fetch(file://) resolution issues.
    guard.handle(
        'read-jxl-wasm',
        [],
        async () => {
            try {
                const wasmPath = path.join(__dirname, 'vendor', 'jxl-oxide-wasm', 'jxl_oxide_wasm_bg.wasm');
                const data = await fs.readFile(wasmPath);
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            } catch (_error) {
                return null;
            }
        },
        { rejectValue: null }
    );

    // ---- Streaming feature-cache reader ----
    // The .feature_cache.json can grow to hundreds of MB on large folders; transferring it as
    // one string + JSON.parse on EITHER process peaks past ~1GB and kills it. Instead we
    // stream-parse the file with stream-json (SAX-style, tiny footprint), accumulate the
    // entries here, and let the renderer pull them in small batches via feature-cache-chunk.
    let featureCacheSession = null; // Array<[filename, entry]> between open and close

    // Read just the top-level "version" field cheaply from the file head (our own writer
    // always emits it as the first key, so it lives in the first few dozen bytes).
    const readCacheVersion = (filePath) =>
        new Promise((resolve) => {
            try {
                const s = fsSync.createReadStream(filePath, { encoding: 'utf8', start: 0, end: 255 });
                let buf = '';
                s.on('data', (c) => {
                    buf += c;
                });
                s.on('end', () => {
                    const m = buf.match(/"version"\s*:\s*(\d+)/);
                    resolve(m ? parseInt(m[1], 10) : null);
                });
                s.on('error', () => resolve(null));
            } catch (_e) {
                resolve(null);
            }
        });

    guard.handle('feature-cache-open', [kinds.grantedPath], async (_event, folderPath) => {
        const filePath = path.join(folderPath, FOLDER_CACHE_FILES.feature);
        try {
            await assertFixedPath(filePath);
        } catch (err) {
            featureCacheSession = null;
            return { success: false, error: err.message };
        }
        try {
            // Fail fast if the file is missing (avoids a dangling stream).
            await fs.access(filePath);
        } catch (_e) {
            featureCacheSession = null;
            return { success: false, notFound: true };
        }

        const version = await readCacheVersion(filePath);

        return new Promise((resolve) => {
            const entries = [];
            const pipeline = fsSync
                .createReadStream(filePath)
                .pipe(jsonParser())
                .pipe(jsonPick({ filter: 'features' }))
                .pipe(jsonStreamObject());

            pipeline.on('data', ({ key, value }) => {
                entries.push([key, value]);
            });
            pipeline.on('end', () => {
                featureCacheSession = entries;
                resolve({ success: true, version, count: entries.length });
            });
            pipeline.on('error', (err) => {
                featureCacheSession = null;
                resolve({ success: false, error: err.message });
            });
        });
    });
    guard.handle(
        'feature-cache-chunk',
        [int(0, Number.MAX_SAFE_INTEGER), int(1, 100000)],
        async (_event, offset, limit) => {
            if (!featureCacheSession) return { entries: [] };
            return packFeatureChunk(featureCacheSession.slice(offset, offset + limit));
        },
        { rejectValue: () => ({ entries: [] }) }
    );
    guard.handle('feature-cache-close', [], async () => {
        featureCacheSession = null; // release the parsed array
        return { success: true };
    });

    // ---- Streaming feature-cache writer ----
    // Mirrors the reader: the renderer sends entries in small batches and main appends them to
    // a temp file as monolithic JSON (same format the reader expects), then atomically renames
    // into place. Avoids the renderer building a ~130MB JSON string + IPC'ing it every 30s.
    let featureCacheWriter = null; // { stream, tmpPath, finalPath, first }
    guard.handle('feature-cache-write-open', [kinds.grantedPath, kinds.any], async (_event, folderPath, header) => {
        const filePath = path.join(folderPath, FOLDER_CACHE_FILES.feature);
        try {
            // Close any leftover writer from an aborted save.
            if (featureCacheWriter) {
                try {
                    featureCacheWriter.stream.destroy();
                } catch (_e) {
                    // ignore
                }
                featureCacheWriter = null;
            }
            const tmpPath = filePath + '.tmp';
            await assertFixedPath(tmpPath);
            await assertFixedPath(filePath);
            const stream = fsSync.createWriteStream(tmpPath, { encoding: 'utf8' });
            const h = header || {};
            const prefix =
                `{"version":${JSON.stringify(h.version ?? null)},` +
                `"featureDim":${JSON.stringify(h.featureDim ?? 64)},` +
                `"clipDim":${JSON.stringify(h.clipDim ?? 512)},"features":{`;
            stream.write(prefix);
            featureCacheWriter = { stream, tmpPath, finalPath: filePath, first: true };
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    guard.handle('feature-cache-write-chunk', [kinds.any], async (_event, entries) => {
        // Capture the module-level writer into a local so a concurrent
        // feature-cache-write-open swapping/destroying it during the 'drain'
        // await cannot make us operate on stale state (documented required
        // pattern for long-running IPC handlers; mirrors the close handler).
        const writer = featureCacheWriter;
        if (!writer) return { success: false, error: 'no open writer' };
        try {
            let buf = '';
            for (const [key, value] of entries) {
                buf += (writer.first ? '' : ',') + JSON.stringify(key) + ':' + JSON.stringify(value);
                writer.first = false;
            }
            if (buf) {
                // Respect backpressure so a slow disk can't balloon the write buffer.
                const ok = writer.stream.write(buf);
                if (!ok) {
                    await new Promise((resolve) => writer.stream.once('drain', resolve));
                }
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    guard.handle('feature-cache-write-close', [], async () => {
        if (!featureCacheWriter) return { success: false, error: 'no open writer' };
        const writer = featureCacheWriter;
        featureCacheWriter = null;
        try {
            // Write the closing braces, end the stream, and wait for the OS flush ('finish').
            await new Promise((resolve, reject) => {
                writer.stream.once('error', reject);
                writer.stream.once('finish', resolve);
                writer.stream.end('}}');
            });
            // Atomic replace so a crash mid-write never corrupts the live cache. On Windows the
            // rename can transiently fail with EPERM/EACCES/EBUSY if something briefly holds the
            // destination open (antivirus, Explorer thumbnailer, a lingering read handle) — retry
            // a few times before giving up.
            let lastErr;
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    await fs.rename(writer.tmpPath, writer.finalPath);
                    return { success: true };
                } catch (err) {
                    lastErr = err;
                    if (['EPERM', 'EACCES', 'EBUSY'].includes(err.code) && attempt < 4) {
                        await new Promise((r) => setTimeout(r, 150));
                        continue;
                    }
                    throw err;
                }
            }
            throw lastErr;
        } catch (error) {
            try {
                await fs.unlink(writer.tmpPath);
            } catch (_e) {
                // ignore
            }
            return { success: false, error: error.message };
        }
    });

    // Video probing using ffprobe
    guard.handle('probe-video', [kinds.grantedMediaRead], async (_event, videoPath) => {
        if (!ffprobePath) {
            return { success: false, error: 'ffprobe not available' };
        }

        try {
            const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath];

            const { stdout } = await runMediaTool(ffprobePath, args, {
                timeout: 10000, // 10 second timeout
                maxBuffer: 1024 * 1024, // 1MB buffer
            });

            const data = JSON.parse(stdout);

            // Extract video stream info
            const videoStream = data.streams?.find((s) => s.codec_type === 'video');
            const audioStream = data.streams?.find((s) => s.codec_type === 'audio');
            const format = data.format || {};

            // Calculate FPS from frame rate string (e.g., "30/1" or "29.97")
            let fps = 0;
            if (videoStream?.r_frame_rate) {
                const parts = videoStream.r_frame_rate.split('/');
                if (parts.length === 2) {
                    fps = parseFloat(parts[0]) / parseFloat(parts[1]);
                } else {
                    fps = parseFloat(videoStream.r_frame_rate);
                }
            }

            // Get bitrate in kbps
            const bitrate = format.bit_rate ? Math.round(parseInt(format.bit_rate) / 1000) : 0;

            return {
                success: true,
                info: {
                    duration: parseFloat(format.duration) || 0,
                    fps: Math.round(fps * 100) / 100,
                    hasAudio: !!audioStream,
                    bitrate: bitrate,
                    width: videoStream?.width || 0,
                    height: videoStream?.height || 0,
                    codec: videoStream?.codec_name || 'unknown',
                    audioCodec: audioStream?.codec_name || null,
                },
            };
        } catch (error) {
            console.error('Video probe error:', error);
            return { success: false, error: error.message };
        }
    });

    guard.handle(
        'extractKeyframes',
        [kinds.grantedMediaRead, optional(int(1, 100))],
        async (_event, videoPath, maxFrames = 20) => {
            if (!ffmpegPath) {
                return { success: false, error: 'ffmpeg not available' };
            }

            const os = require('os');
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mv-keyframes-'));
            tempDirs.add(tempDir); // cleanupKeyframes may remove only directories main made (G1)

            try {
                // Scene-change detection: extract frames where scene score > 0.3
                const outputPattern = path.join(tempDir, 'frame-%03d.png');
                await runMediaTool(
                    ffmpegPath,
                    [
                        '-i',
                        videoPath,
                        '-vf',
                        `select='gt(scene,0.3)',setpts=N/FRAME_RATE/TB`,
                        '-frames:v',
                        String(maxFrames),
                        '-vsync',
                        'vfr',
                        outputPattern,
                    ],
                    { timeout: 60000 }
                );

                // Read extracted frames
                const files = await fs.readdir(tempDir);
                const framePaths = files
                    .filter((f) => f.endsWith('.png'))
                    .sort()
                    .map((f) => path.join(tempDir, f));

                // Fallback: if scene detection yielded < 3 frames, sample uniformly
                if (framePaths.length < 3) {
                    // Clean up scene-detected frames
                    for (const fp of framePaths) {
                        await fs.unlink(fp).catch(() => {});
                    }

                    // Get duration for uniform sampling
                    let duration = 10; // default fallback
                    if (ffprobePath) {
                        try {
                            const probeResult = await runMediaTool(ffprobePath, [
                                '-v',
                                'error',
                                '-show_entries',
                                'format=duration',
                                '-of',
                                'default=noprint_wrappers=1:nokey=1',
                                videoPath,
                            ]);
                            duration = parseFloat(probeResult.stdout.trim()) || 10;
                        } catch (_e) {
                            // Use default duration
                        }
                    }

                    // Extract first, middle, last frames.
                    // Clamp timestamps inside the duration so very short videos don't seek past EOF
                    // (ffmpeg can exit with code 0 yet skip writing the output file in that case).
                    const safeDuration = Math.max(0.1, duration);
                    const timestamps = [0, safeDuration / 2, Math.max(0, safeDuration - 0.1)];
                    const fallbackPaths = [];
                    for (let idx = 0; idx < timestamps.length; idx++) {
                        const outPath = path.join(tempDir, `fallback-${idx}.png`);
                        try {
                            await runMediaTool(
                                ffmpegPath,
                                [
                                    '-ss',
                                    String(timestamps[idx]),
                                    '-i',
                                    videoPath,
                                    '-frames:v',
                                    '1',
                                    '-q:v',
                                    '2',
                                    outPath,
                                ],
                                { timeout: 15000 }
                            );
                            // ffmpeg sometimes exits 0 without writing the file — verify before reporting.
                            // Without this, downstream RawImage.read throws 404 and accumulates native
                            // allocations in transformers.js/ONNX Runtime that the renderer can't see.
                            await fs.access(outPath);
                            fallbackPaths.push(outPath);
                        } catch (_e) {
                            // Skip failed frame (ffmpeg error OR file not written)
                        }
                    }

                    return { success: true, framePaths: fallbackPaths, tempDir };
                }

                // Defense in depth: also verify scene-detected frames exist. Normally they do
                // (readdir saw them), but if ffmpeg races a write or the file is unlinked between
                // readdir and access, we'd otherwise return a broken path.
                const verifiedFramePaths = [];
                for (const fp of framePaths) {
                    try {
                        await fs.access(fp);
                        verifiedFramePaths.push(fp);
                    } catch (_e) {
                        // Skip missing
                    }
                }
                return { success: true, framePaths: verifiedFramePaths, tempDir };
            } catch (error) {
                // Clean up temp dir on error
                await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
                tempDirs.delete(tempDir);
                return { success: false, error: error.message };
            }
        }
    );

    guard.handle('cleanupKeyframes', [kinds.trackedTempDir], async (_event, tempDir) => {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
            tempDirs.delete(tempDir);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // CLIP model IPC handlers
    guard.handle('loadClipModel', [], async (event) => {
        return loadClipModel(event);
    });

    guard.handle('unloadClipModel', [], () => {
        if (clipModelLoading) {
            return { success: false, reason: 'loading' };
        }
        clipProcessor = null;
        clipVisionModel = null;
        clipModelError = null;
        return { success: true };
    });

    guard.handle('extractClipEmbedding', [kinds.grantedMediaRead], async (event, imagePath) => {
        // Load model if needed
        const loadResult = await loadClipModel(event);
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        // Capture local refs to survive a concurrent unloadClipModel during await
        const processor = clipProcessor;
        const model = clipVisionModel;
        if (!processor || !model) {
            return { success: false, error: 'CLIP unavailable' };
        }

        try {
            const { RawImage } = await import('@huggingface/transformers');

            // Read image file and create RawImage
            const image = await RawImage.read(imagePath);

            // Process through CLIP vision encoder
            const inputs = await processor(image);
            const output = await model(inputs);

            // Extract and normalize embedding
            const embedding = output.image_embeds.data;
            const dim = 512;
            const result = new Float32Array(dim);

            let norm = 0;
            for (let i = 0; i < dim; i++) {
                norm += embedding[i] * embedding[i];
            }
            norm = Math.sqrt(norm);
            for (let i = 0; i < dim; i++) {
                result[i] = norm > 0 ? embedding[i] / norm : 0;
            }

            return { success: true, embedding: Array.from(result) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    guard.handle('extractClipEmbeddingFromBuffer', [kinds.binary], async (event, pngBytes) => {
        // Load model if needed
        const loadResult = await loadClipModel(event);
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        // Capture local refs to survive a concurrent unloadClipModel during await
        const processor = clipProcessor;
        const model = clipVisionModel;
        if (!processor || !model) {
            return { success: false, error: 'CLIP unavailable' };
        }

        try {
            const { RawImage } = await import('@huggingface/transformers');

            // Build RawImage from decoded PNG bytes (JXL frame-0) instead of a path
            const blob = new Blob([Buffer.from(pngBytes)], { type: 'image/png' });
            const image = await RawImage.fromBlob(blob);

            // Process through CLIP vision encoder
            const inputs = await processor(image);
            const output = await model(inputs);

            // Extract and normalize embedding
            const embedding = output.image_embeds.data;
            const dim = 512;
            const result = new Float32Array(dim);

            let norm = 0;
            for (let i = 0; i < dim; i++) {
                norm += embedding[i] * embedding[i];
            }
            norm = Math.sqrt(norm);
            for (let i = 0; i < dim; i++) {
                result[i] = norm > 0 ? embedding[i] / norm : 0;
            }

            return { success: true, embedding: Array.from(result) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    const clipBatchPaths = arrayOf(kinds.grantedOrTempMediaRead, 100); // keyframes or (linked) media
    guard.handle('extractClipEmbeddingBatch', [clipBatchPaths], async (event, imagePaths) => {
        // Load model if needed
        const loadResult = await loadClipModel(event);
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        // Capture local refs to survive a concurrent unloadClipModel during await
        const processor = clipProcessor;
        const model = clipVisionModel;
        if (!processor || !model) {
            return { success: false, error: 'CLIP unavailable' };
        }

        try {
            const { RawImage } = await import('@huggingface/transformers');
            const dim = 512;
            const embeddings = [];

            for (const imagePath of imagePaths) {
                try {
                    const image = await RawImage.read(imagePath);
                    const inputs = await processor(image);
                    const output = await model(inputs);

                    const embedding = output.image_embeds.data;
                    const normalized = new Float32Array(dim);
                    let normVal = 0;
                    for (let i = 0; i < dim; i++) {
                        normVal += embedding[i] * embedding[i];
                    }
                    normVal = Math.sqrt(normVal);
                    for (let i = 0; i < dim; i++) {
                        normalized[i] = normVal > 0 ? embedding[i] / normVal : 0;
                    }
                    embeddings.push(Array.from(normalized));
                } catch (err) {
                    console.warn(`CLIP extraction failed for ${imagePath}:`, err.message);
                }
            }

            if (embeddings.length === 0) {
                return { success: false, error: 'No valid embeddings' };
            }

            // Average embeddings
            const averaged = new Float32Array(dim);
            for (const emb of embeddings) {
                for (let i = 0; i < dim; i++) {
                    averaged[i] += emb[i];
                }
            }
            let norm = 0;
            for (let i = 0; i < dim; i++) {
                averaged[i] /= embeddings.length;
                norm += averaged[i] * averaged[i];
            }
            norm = Math.sqrt(norm);
            for (let i = 0; i < dim; i++) {
                averaged[i] = norm > 0 ? averaged[i] / norm : 0;
            }

            return { success: true, embedding: Array.from(averaged), frameCount: embeddings.length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Receive renderer errors for file logging (fire-and-forget). Callers pass a string or
    // { level, message, source }; normalise both (see logger.normalizeRendererLogEntry).
    guard.on('log-renderer-error', (_event, data) => {
        const { level, message, source } = logger.normalizeRendererLogEntry(data);
        const fn = level === 'warn' ? logger.warn : logger.error;
        fn(source, message);
    });

    // Receive renderer perf/diagnostics lines for the persistent perf log (fire-and-forget).
    guard.on('log-perf', (_event, message) => {
        logger.logPerf(String(message ?? ''));
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    logger.cleanup();
});
