const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

console.log('Preload script loading...');

contextBridge.exposeInMainWorld('electronAPI', {
    // File operations. Since G1 the main process allows paths inside folders the user picked in
    // its own dialog, with the exceptions ipc-guard.js's argument kinds document (main's own
    // keyframe temp folders, link entries and linked media); anything else is refused with the
    // call's usual failure value.
    moveFile: (data) => ipcRenderer.invoke('move-file', data),
    checkFolderExists: (folderPath) => ipcRenderer.invoke('check-folder-exists', folderPath),
    checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
    createFolder: (folderPath) => ipcRenderer.invoke('create-folder', folderPath),
    readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),
    readJxlWasm: () => ipcRenderer.invoke('read-jxl-wasm'),
    // Per-folder caches by NAME: main joins the file name. Read: 'hash' | 'sort' | 'feature'
    // (the feature cache's single-read fallback); write: 'hash' | 'sort' (feature writes stream).
    readFolderCache: (folderPath, name) => ipcRenderer.invoke('read-folder-cache', folderPath, name),
    writeFolderCache: (folderPath, name, data) => ipcRenderer.invoke('write-folder-cache', folderPath, name, data),
    // Streaming feature-cache reader (parse in main, pull in batches) — avoids the renderer
    // crashing on huge .feature_cache.json files. Takes the FOLDER; main names the file.
    featureCacheOpen: (folderPath) => ipcRenderer.invoke('feature-cache-open', folderPath),
    featureCacheChunk: (offset, limit) => ipcRenderer.invoke('feature-cache-chunk', offset, limit),
    featureCacheClose: () => ipcRenderer.invoke('feature-cache-close'),
    // Streaming feature-cache writer (send batches to main, main appends + atomic rename) —
    // avoids the renderer building a ~130MB JSON string on every 30s auto-save.
    featureCacheWriteOpen: (folderPath, header) => ipcRenderer.invoke('feature-cache-write-open', folderPath, header),
    featureCacheWriteChunk: (entries) => ipcRenderer.invoke('feature-cache-write-chunk', entries),
    featureCacheWriteClose: () => ipcRenderer.invoke('feature-cache-write-close'),
    // ML model cache (app data, keyed by training-set fingerprint)
    readMlModelCache: () => ipcRenderer.invoke('read-ml-model-cache'),
    writeMlModelCache: (store) => ipcRenderer.invoke('write-ml-model-cache', store),

    // Folder operations. openFolderDialog's pick is what grants a folder (G1); defaultPath only
    // positions the dialog (re-confirming a saved folder).
    openFolderDialog: (defaultPath) => ipcRenderer.invoke('open-folder-dialog', defaultPath),
    getGrantStatus: (paths) => ipcRenderer.invoke('get-grant-status', paths),
    loadFolder: (folderPath) => ipcRenderer.invoke('load-folder', folderPath),

    // Video metadata extraction
    probeVideo: (videoPath) => ipcRenderer.invoke('probe-video', videoPath),

    // Video keyframe extraction
    extractKeyframes: (videoPath, maxFrames) => ipcRenderer.invoke('extractKeyframes', videoPath, maxFrames),
    cleanupKeyframes: (tempDir) => ipcRenderer.invoke('cleanupKeyframes', tempDir),

    // CLIP model (main process)
    loadClipModel: () => ipcRenderer.invoke('loadClipModel'),
    extractClipEmbedding: (imagePath) => ipcRenderer.invoke('extractClipEmbedding', imagePath),
    extractClipEmbeddingFromBuffer: (pngBytes) => ipcRenderer.invoke('extractClipEmbeddingFromBuffer', pngBytes),
    extractClipEmbeddingBatch: (imagePaths) => ipcRenderer.invoke('extractClipEmbeddingBatch', imagePaths),
    unloadClipModel: () => ipcRenderer.invoke('unloadClipModel'),
    onClipDownloadProgress: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('clip-download-progress', handler);
        return () => ipcRenderer.removeListener('clip-download-progress', handler);
    },

    // Tournament state persistence
    readTournamentState: (folderPath) => ipcRenderer.invoke('readTournamentState', folderPath),
    writeTournamentState: (folderPath, state) => ipcRenderer.invoke('writeTournamentState', folderPath, state),
    deleteTournamentState: (folderPath) => ipcRenderer.invoke('deleteTournamentState', folderPath),
    applyTournamentResults: (folderPath, tierAssignments) =>
        ipcRenderer.invoke('applyTournamentResults', folderPath, tierAssignments),
    readBulkRatedFile: (folderPath) => ipcRenderer.invoke('readBulkRatedFile', folderPath),
    writeBulkRatedFile: (folderPath, data) => ipcRenderer.invoke('writeBulkRatedFile', folderPath, data),

    // Logging (fire-and-forget)
    logError: (data) => ipcRenderer.send('log-renderer-error', data),
    // Persistent perf/diagnostics line (fire-and-forget) → media-viewer-perf.log (survives quit).
    logPerf: (data) => ipcRenderer.send('log-perf', data),

    // App-close confirm: main intercepts window close and asks the renderer (which owns
    // tournament state) whether it may proceed. onAppCloseRequested returns an unsubscribe fn.
    onAppCloseRequested: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('app-close-requested', handler);
        return () => ipcRenderer.removeListener('app-close-requested', handler);
    },
    allowAppClose: () => ipcRenderer.send('app-close-allow'),

    // Path utilities
    path: {
        join: (...args) => path.join(...args),
        dirname: (p) => path.dirname(p),
        basename: (p) => path.basename(p),
        extname: (p) => path.extname(p),
    },
});

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, electronAPI available:', !!window.electronAPI);
});

console.log('Preload script loaded successfully');
