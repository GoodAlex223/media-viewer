const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

console.log('Preload script loading...');

contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    moveFile: (data) => ipcRenderer.invoke('move-file', data),
    checkFolderExists: (folderPath) => ipcRenderer.invoke('check-folder-exists', folderPath),
    createFolder: (folderPath) => ipcRenderer.invoke('create-folder', folderPath),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),

    // Folder operations
    openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
    loadFolder: (folderPath) => ipcRenderer.invoke('load-folder', folderPath),

    // Video metadata extraction
    probeVideo: (videoPath) => ipcRenderer.invoke('probe-video', videoPath),

    // IPC invoke wrapper for other operations
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),

    // Path utilities
    path: {
        join: (...args) => path.join(...args),
        dirname: (p) => path.dirname(p),
        basename: (p) => path.basename(p),
        extname: (p) => path.extname(p)
    }
});

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, electronAPI available:', !!window.electronAPI);
});

console.log('Preload script loaded successfully');