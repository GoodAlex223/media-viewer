// Shared harness for the feature-cache wipe tests (plan docs/planning/plans/2026-10-21_feature-cache-wipe-fix.md,
// Task 1). Not a test file. It runs the real MediaViewer methods (extracted from media-viewer.js) against FakeMain,
// an in-memory disk that answers the six featureCache* calls the way main.js does today: no count checks, and a
// close that replaces the folder's cache with exactly what was written. The trigger tests assert on that disk.
//
// The harness wiring may change as the fix lands; the tests' assertions may not (plan § Global Constraints).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'media-viewer.js'), 'utf-8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable (the technique of similarity-sort-glue.test.js), or null when it is gone. */
export function extract(name) {
    // The parameter list may hold one level of parentheses (a default like `isLive = () => true`).
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(((?:[^()]|\\([^()]*\\))*)\\)\\s*\\{`, 'm'));
    if (!match) {
        return null;
    }
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            const Ctor = match[1] ? AsyncFunction : Function;
            return new Ctor(match[2], source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

export function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Lets every pending microtask and short timer chain run. */
export const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

export function makeFiles(folder, prefix, n) {
    return Array.from({ length: n }, (_, i) => {
        const name = `${prefix}${i}.jpg`;
        return { name, path: `${folder}/${name}`, size: 1000 + i, mtimeMs: 5000 + i };
    });
}

const HOLDABLE = ['featureCacheOpen', 'featureCacheChunk', 'featureCacheWriteChunk', 'featureCacheWriteClose'];

/**
 * Today's main, in memory: one read session and one writer at a time, both global, as in main.js. A cache file is
 * a Map of name → { vector, clipVector, size, mtime }. Chunks use the legacy JSON shape `{ entries: [[name, entry]] }`.
 */
export class FakeMain {
    constructor() {
        this.disk = new Map(); // folder → Map(name → entry)
        this.listings = new Map(); // folder → loadFolder reply
        this.writes = []; // every write-open: { folder, header, entries, closed }
        this.session = null;
        this.writer = null;
        this.counts = Object.fromEntries(HOLDABLE.map((m) => [m, 0]));
        this.holds = new Map(); // `${method}#${nth}` → { gate, reached }
        this.logged = [];
        this.api = this._buildApi();
    }

    /** The loadFolder reply for `folder`: its media files. */
    list(folder, files) {
        this.listings.set(folder, { success: true, files });
    }

    /** Any other loadFolder reply (a failed listing). */
    listReply(folder, reply) {
        this.listings.set(folder, reply);
    }

    /** Writes a valid v4 cache entry for each file: a 64-length vector, its size and mtime, no clip. */
    seed(folder, files) {
        const entries = this.disk.get(folder) || new Map();
        for (const f of files) {
            entries.set(f.name, { vector: new Array(64).fill(0.1), clipVector: null, size: f.size, mtime: f.mtimeMs });
        }
        this.disk.set(folder, entries);
    }

    /** The folder's cache file, or undefined when it has none. */
    entriesOf(folder) {
        return this.disk.get(folder);
    }

    /** The write-opens made for `folder`, in order. */
    writesTo(folder) {
        return this.writes.filter((w) => w.folder === folder);
    }

    /**
     * Holds the nth call of `method` until the returned function is called. `release.reached` resolves when the
     * held call arrives.
     */
    hold(method, nth = 1) {
        if (!HOLDABLE.includes(method)) {
            throw new Error(`not holdable: ${method}`);
        }
        const gate = deferred();
        const reached = deferred();
        this.holds.set(`${method}#${nth}`, { gate, reached });
        const release = () => gate.resolve();
        release.reached = reached.promise;
        return release;
    }

    async _gate(method) {
        const n = ++this.counts[method];
        const h = this.holds.get(`${method}#${n}`);
        if (h) {
            h.reached.resolve();
            await h.gate.promise;
        }
    }

    _buildApi() {
        const main = this;
        return {
            path: {
                basename: (p) => String(p).split('/').pop(),
                join: (...parts) => parts.join('/'),
            },
            logError: (m) => main.logged.push(typeof m === 'string' ? m : m?.message),
            logPerf: () => {},
            async loadFolder(folder) {
                const reply = main.listings.get(folder);
                return reply || { success: false, error: `no listing for ${folder}` };
            },
            async featureCacheOpen(folder) {
                await main._gate('featureCacheOpen');
                const entries = main.disk.get(folder);
                if (!entries) {
                    main.session = null;
                    return { success: false, notFound: true };
                }
                main.session = [...entries].map(([name, e]) => [name, structuredClone(e)]);
                return { success: true, version: 4, count: main.session.length };
            },
            async featureCacheChunk(offset, limit) {
                await main._gate('featureCacheChunk');
                if (!main.session) {
                    return { entries: [] };
                }
                return { entries: main.session.slice(offset, offset + limit) };
            },
            async featureCacheClose() {
                main.session = null;
                return { success: true };
            },
            async featureCacheWriteOpen(folder, header) {
                main.writer = { folder, header, entries: new Map(), closed: false };
                main.writes.push(main.writer);
                return { success: true };
            },
            async featureCacheWriteChunk(batch) {
                const writer = main.writer;
                await main._gate('featureCacheWriteChunk');
                if (!writer) {
                    return { success: false, error: 'no open writer' };
                }
                for (const [name, entry] of batch) {
                    writer.entries.set(name, structuredClone(entry));
                }
                return { success: true };
            },
            async featureCacheWriteClose() {
                const writer = main.writer;
                main.writer = null;
                await main._gate('featureCacheWriteClose');
                if (!writer) {
                    return { success: false, error: 'no open writer' };
                }
                writer.closed = true;
                main.disk.set(writer.folder, writer.entries);
                return { success: true, written: writer.entries.size };
            },
        };
    }
}

// The real methods the harness runs. A name that no longer exists in media-viewer.js is skipped.
const REAL_METHODS = [
    'switchToFolder',
    '_switchToFolderNow',
    'loadFolder',
    '_abortInFlightPredictionSort',
    '_invalidateSimilarityRun',
    '_isStaleSimilarityRun',
    'prioritizeDisplayedFilesExtraction',
    'startBackgroundFeatureExtraction',
    'cancelBackgroundExtraction',
    'cancelPendingFeatureExtractions',
    'enqueueFeatureExtraction',
    'dispatchNextFeatureTask',
    'handleFeatureWorkerMessage',
    'awaitExtractionGate',
    'calculateFeaturePriority',
    'loadFeatureCache',
    '_loadFeatureCacheImpl',
    '_loadFeatureCacheLocked',
    'saveFeatureCache',
    '_saveFeatureCacheImpl',
    '_saveFeatureCacheLocked',
    '_acquireCacheIoLock',
    'startFeatureCacheAutoSave',
    'stopFeatureCacheAutoSave',
];
const compiled = Object.fromEntries(REAL_METHODS.map((name) => [name, extract(name)]).filter(([, fn]) => fn));

const IMAGE_DATA = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

const savedGlobals = {
    window: globalThis.window,
    MediaViewer: globalThis.MediaViewer,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
};
let captured = null; // the autosave interval: { fn, ms }

/**
 * A mock MediaViewer `this` over `main`: the real methods above, the ML pool on (`isMlEnabled`, one fake worker),
 * and a stub for every other `this.*` they touch. No folder is open; open one with openFolder().
 */
export function makeHost(main, { enableClipFeatures = false } = {}) {
    globalThis.window = { electronAPI: main.api };
    globalThis.MediaViewer = { FEATURE_CACHE_VERSION: 4 };
    const label = { textContent: '' };
    const worker = {
        busy: false,
        posted: [],
        postMessage(msg) {
            this.posted.push(msg);
        },
        terminate() {},
    };
    const host = {
        // Folder and list
        mediaFiles: [],
        baseFolderPath: '',
        currentFolderPath: '',
        currentIndex: 0,
        currentMedia: null,
        moveHistory: [],
        originalMediaFiles: [],
        isLoading: false,
        isVideoLoading: false,
        videoEventListeners: [],
        mediaNavigationInProgress: false,
        isBeingCleaned: false,
        isCompareMode: false,
        isTournamentMode: false,
        tournament: { engine: null },
        isSortedBySimilarity: false,
        isSortedByPrediction: false,
        customLikeFolder: null,
        customDislikeFolder: null,
        customSpecialFolder: null,
        sortSimilarityBtn: { querySelector: () => label },
        _fileOpInFlight: false,
        _folderLoadInFlight: false,
        _folderIntentGen: 0,
        _grantRefreshGen: 0,
        _similarityRunGen: 0,
        _hashCacheMergedFolder: null,
        isComputingHashes: false,
        sortAbortController: null,
        sortRunId: 0,
        _mlSortResolve: null,
        _mlSortReject: null,
        // Maps
        featureCache: new Map(),
        clipCache: new Map(),
        featureMetadata: new Map(),
        perceptualHashes: new Map(),
        predictionScores: new Map(),
        // Extraction
        isMlEnabled: true,
        enableClipFeatures,
        mlStats: null,
        clipUnloadTimer: null,
        featureWorkers: [worker],
        featureTaskQueue: [],
        featurePendingTasks: new Map(),
        featureTaskIdCounter: 0,
        isBackgroundExtracting: false,
        backgroundExtractionAbort: null,
        extractionStartTime: null,
        extractionCompletionTimes: [],
        extractionRunId: 0,
        extractionPaused: false,
        extractionResumeResolve: null,
        extractionResumeTimer: null,
        _extractionCachedCount: 0,
        // Feature cache (main's fields; gone once the store owns them)
        featureCacheDirty: false,
        _featureCacheDiskCount: 0,
        _featureCacheLoadPromise: null,
        _featureCacheSavePromise: null,
        _cacheIoLock: null,
        featureCacheAutoSaveInterval: null,
        // Test-only: image loads held by holdImage()
        _testImageHolds: new Map(),
        // Stubs
        _refuseIfFileOpInFlight() {
            return this._fileOpInFlight;
        },
        _refuseIfFolderLoadInFlight() {
            return this._folderLoadInFlight;
        },
        _updateRecentFoldersButton: () => {},
        _dismissSimilarityOffer: () => {},
        _onOrderChanged: () => {},
        _recordRecentFolder: () => {},
        _scheduleClipUnload: () => {},
        showLoadingSpinner: () => {},
        hideLoadingSpinner: () => {},
        showDropZone: () => {},
        hideDropZone: () => {},
        showError: () => {},
        showNotification: () => {},
        clearProgressNotification: () => {},
        exitTournamentMode: () => {},
        showTournamentLeavePrompt: () => {},
        refreshFolderGrants: () => {},
        loadBulkRatedFile: async () => {},
        switchToSingleModeUI: () => {},
        showMedia: async () => {},
        updateFolderInfo: () => {},
        updateSortPredictionButton: () => {},
        cleanupCurrentMedia: async () => {},
        showBackgroundExtractionProgress: () => {},
        hideBackgroundExtractionProgress: () => {},
        recordExtractionCompletion: () => {},
        requestPredictionScores: () => {},
        formatElapsed: () => '0s',
        extractFeaturesFromMediaElement: async () => new Float32Array(64).fill(0.25),
        async extractClipEmbedding() {
            return this.enableClipFeatures ? new Float32Array(512).fill(0.01) : null;
        },
        async loadMediaAsImageData(filePath) {
            const gate = this._testImageHolds.get(filePath);
            if (gate) {
                gate.reached.resolve();
                await gate.gate.promise;
            }
            return IMAGE_DATA;
        },
    };
    for (const [name, fn] of Object.entries(compiled)) {
        host[name] = fn;
    }
    return host;
}

/** Lists `files` for `folder` and opens it through the real loadFolder. */
export async function openFolder(main, host, folder, files) {
    main.list(folder, files);
    await host.loadFolder(folder);
    await settle();
}

/** The user views mediaFiles[index]: its image is on screen, and the render's priority extraction runs. */
export async function view(host, index) {
    host.currentIndex = index;
    host.currentMedia = { complete: true };
    await host.prioritizeDisplayedFilesExtraction();
}

/** Holds loadMediaAsImageData(filePath) until the returned function is called; `release.reached` as for hold(). */
export function holdImage(host, filePath) {
    const gate = deferred();
    const reached = deferred();
    host._testImageHolds.set(filePath, { gate, reached });
    const release = () => gate.resolve();
    release.reached = reached.promise;
    return release;
}

/** Replies `result` to every extraction task the fake worker was sent, until none is pending. */
export async function drainWorker(host) {
    const worker = host.featureWorkers[0];
    for (let round = 0; round < 1000; round++) {
        const msg = worker.posted.find((m) => m.type === 'extract' && host.featurePendingTasks.has(m.data.id));
        if (!msg) {
            await settle(10);
            if (!worker.posted.some((m) => m.type === 'extract' && host.featurePendingTasks.has(m.data.id))) {
                return;
            }
            continue;
        }
        host.handleFeatureWorkerMessage(0, { type: 'result', id: msg.data.id, features: new Array(64).fill(0.5) });
        await settle(1);
    }
    throw new Error('drainWorker: the worker never went idle');
}

/** Starts the feature-cache autosave the way initializeFeaturePool does, capturing its interval callback. */
export function startAutosave(host) {
    globalThis.setInterval = (fn, ms) => {
        captured = { fn, ms };
        return 1;
    };
    globalThis.clearInterval = () => {
        captured = null;
    };
    if (host.startFeatureCacheAutoSave) {
        host.startFeatureCacheAutoSave();
    } else {
        host.featureCacheStore.startAutoSave();
    }
    if (!captured || captured.ms !== 30000) {
        throw new Error('the autosave did not arm a 30 s interval');
    }
}

/** One autosave tick: the real interval callback. Returns its promise (it may still be running). */
export function autosaveTick() {
    if (!captured) {
        throw new Error('no autosave armed');
    }
    return Promise.resolve(captured.fn());
}

/** Restores the globals makeHost and startAutosave replaced. Call from afterEach. */
export function resetHarness() {
    globalThis.window = savedGlobals.window;
    globalThis.MediaViewer = savedGlobals.MediaViewer;
    globalThis.setInterval = savedGlobals.setInterval;
    globalThis.clearInterval = savedGlobals.clearInterval;
    captured = null;
}
