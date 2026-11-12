// The bridge's surface, pinned (v2 P1a, spec § 8.8). preload.js is Tier 1: every key window.electronAPI exposes, and
// the IPC channel each one uses, is listed here, so a key added or rewired without review fails this test. Each channel
// the bridge invokes or sends must be registered through the IPC guard in main (main.js or main/**), and each channel
// it listens on must be one main sends.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// Runs a preload source against a fake electron and returns { key: [method, channel] }: the ipcRenderer method each
// exposed function calls and its channel, found by calling it once. The path helpers are ['path', null].
function surfaceOf(src) {
    let exposed = null;
    let last = null;
    const ipcRenderer = {
        invoke: (channel) => {
            last = ['invoke', channel];
            return Promise.resolve();
        },
        send: (channel) => {
            last = ['send', channel];
        },
        on: (channel) => {
            last = ['on', channel];
        },
        removeListener: () => {},
    };
    const fakeRequire = (name) => {
        if (name === 'electron') {
            return { contextBridge: { exposeInMainWorld: (_key, api) => (exposed = api) }, ipcRenderer };
        }
        if (name === 'path') {
            return path;
        }
        throw new Error(`preload requires ${name}`);
    };
    const fakeWindow = { addEventListener: () => {} };
    new Function('require', 'window', 'console', src)(fakeRequire, fakeWindow, { log: () => {} });
    const surface = {};
    for (const [key, value] of Object.entries(exposed)) {
        if (key === 'path') {
            surface.path = ['path', null];
            continue;
        }
        last = null;
        value('a', 'b', 'c', 'd');
        surface[key] = last;
    }
    return surface;
}

const EXPECTED = {
    moveFile: ['invoke', 'move-file'],
    checkFolderExists: ['invoke', 'check-folder-exists'],
    checkFileExists: ['invoke', 'check-file-exists'],
    createFolder: ['invoke', 'create-folder'],
    readFileBuffer: ['invoke', 'read-file-buffer'],
    readJxlWasm: ['invoke', 'read-jxl-wasm'],
    readFolderCache: ['invoke', 'read-folder-cache'],
    writeFolderCache: ['invoke', 'write-folder-cache'],
    featureCacheOpen: ['invoke', 'feature-cache-open'],
    featureCacheChunk: ['invoke', 'feature-cache-chunk'],
    featureCacheClose: ['invoke', 'feature-cache-close'],
    featureCacheWriteOpen: ['invoke', 'feature-cache-write-open'],
    featureCacheWriteChunk: ['invoke', 'feature-cache-write-chunk'],
    featureCacheWriteClose: ['invoke', 'feature-cache-write-close'],
    readMlModelCache: ['invoke', 'read-ml-model-cache'],
    writeMlModelCache: ['invoke', 'write-ml-model-cache'],
    openFolderDialog: ['invoke', 'open-folder-dialog'],
    getGrantStatus: ['invoke', 'get-grant-status'],
    loadFolder: ['invoke', 'load-folder'],
    probeVideo: ['invoke', 'probe-video'],
    extractKeyframes: ['invoke', 'extractKeyframes'],
    cleanupKeyframes: ['invoke', 'cleanupKeyframes'],
    loadClipModel: ['invoke', 'loadClipModel'],
    extractClipEmbedding: ['invoke', 'extractClipEmbedding'],
    extractClipEmbeddingFromBuffer: ['invoke', 'extractClipEmbeddingFromBuffer'],
    extractClipEmbeddingBatch: ['invoke', 'extractClipEmbeddingBatch'],
    unloadClipModel: ['invoke', 'unloadClipModel'],
    onClipDownloadProgress: ['on', 'clip-download-progress'],
    readTournamentState: ['invoke', 'readTournamentState'],
    writeTournamentState: ['invoke', 'writeTournamentState'],
    deleteTournamentState: ['invoke', 'deleteTournamentState'],
    applyTournamentResults: ['invoke', 'applyTournamentResults'],
    readBulkRatedFile: ['invoke', 'readBulkRatedFile'],
    writeBulkRatedFile: ['invoke', 'writeBulkRatedFile'],
    // v2 P1a: the module list, the toggle and the restart; per-folder files by owner and declared name.
    listModules: ['invoke', 'list-modules'],
    setModuleEnabled: ['invoke', 'set-module-enabled'],
    restartApp: ['send', 'restart-app'],
    folderFileRead: ['invoke', 'folder-file-read'],
    folderFileWrite: ['invoke', 'folder-file-write'],
    folderFileDelete: ['invoke', 'folder-file-delete'],
    logError: ['send', 'log-renderer-error'],
    logPerf: ['send', 'log-perf'],
    onAppCloseRequested: ['on', 'app-close-requested'],
    allowAppClose: ['send', 'app-close-allow'],
    path: ['path', null],
};

// Every channel main registers through the guard, in main.js and main/**.
function guardedChannels() {
    const files = [
        'main.js',
        ...readdirSync(path.join(root, 'main'), { recursive: true })
            .filter((f) => f.endsWith('.js'))
            .map((f) => path.join('main', f)),
    ];
    return new Set(files.flatMap((f) => [...read(f).matchAll(/guard\.(?:handle|on)\(\s*'([^']+)'/g)].map((m) => m[1])));
}

describe('the bridge surface (preload.js)', () => {
    const surface = surfaceOf(read('preload.js'));

    it('exposes exactly the pinned keys, each on its pinned channel', () => {
        expect(Object.keys(EXPECTED)).toHaveLength(45);
        expect(surface).toEqual(EXPECTED);
    });

    it('fails on a planted extra key (control: the pin fires)', () => {
        const planted = read('preload.js').replace(
            "allowAppClose: () => ipcRenderer.send('app-close-allow'),",
            "allowAppClose: () => ipcRenderer.send('app-close-allow'),\n    readAnyFile: (p) => ipcRenderer.invoke('read-any', p),"
        );
        expect(planted).not.toBe(read('preload.js'));
        expect(surfaceOf(planted)).not.toEqual(EXPECTED);
    });

    it('invokes and sends only channels main registers through the guard', () => {
        const registered = guardedChannels();
        expect(registered.has('app-close-allow')).toBe(true); // a multi-line registration is found
        const unregistered = Object.entries(surface)
            .filter(([, [method]]) => method === 'invoke' || method === 'send')
            .map(([key, [, channel]]) => `${key}: ${channel}`)
            .filter((entry) => !registered.has(entry.split(': ')[1]));
        expect(unregistered).toEqual([]);
    });

    it('listens only on channels main sends', () => {
        const main = read('main.js');
        for (const [, [method, channel]] of Object.entries(surface)) {
            if (method === 'on') {
                expect(main, channel).toContain(`'${channel}'`);
            }
        }
    });
});
