const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

console.log('Preload script loading...');

contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    moveFile: (data) => ipcRenderer.invoke('move-file', data),
    checkFolderExists: (folderPath) => ipcRenderer.invoke('check-folder-exists', folderPath),
    checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
    createFolder: (folderPath) => ipcRenderer.invoke('create-folder', folderPath),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),

    // Folder operations
    openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
    loadFolder: (folderPath) => ipcRenderer.invoke('load-folder', folderPath),

    // Video metadata extraction
    probeVideo: (videoPath) => ipcRenderer.invoke('probe-video', videoPath),

    // Video keyframe extraction
    extractKeyframes: (videoPath, maxFrames) => ipcRenderer.invoke('extractKeyframes', videoPath, maxFrames),
    cleanupKeyframes: (tempDir) => ipcRenderer.invoke('cleanupKeyframes', tempDir),

    // CLIP model (main process)
    loadClipModel: () => ipcRenderer.invoke('loadClipModel'),
    extractClipEmbedding: (imagePath) => ipcRenderer.invoke('extractClipEmbedding', imagePath),
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

    // Logging (fire-and-forget)
    logError: (data) => ipcRenderer.send('log-renderer-error', data),

    // IPC invoke wrapper for other operations
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),

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
