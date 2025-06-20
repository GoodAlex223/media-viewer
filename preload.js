const { contextBridge, ipcRenderer } = require('electron');
const path = require('path')

console.log('Preload script loading...');

contextBridge.exposeInMainWorld('electronAPI', {
    moveFile: (sourcePath, targetFolder, fileName) => 
        ipcRenderer.invoke('move-file', sourcePath, targetFolder, fileName),

    checkFolderExists: (folderPath) => 
        ipcRenderer.invoke('check-folder-exists', folderPath),
    
    createFolder: (folderPath) => 
        ipcRenderer.invoke('create-folder', folderPath),

    openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
    loadFolder: (folderPath) => ipcRenderer.invoke('load-folder', folderPath),

    // Add path methods
    path: {
        join: (...args) => path.join(...args),
        dirname: (p) => path.dirname(p),
        basename: (p) => path.basename(p)
    }
});

// Optional: Add console warning in development
if (process.env.NODE_ENV === 'development') {
    console.log('Preload script initialized');
}

console.log('Preload script loaded');
console.log('Exposing API:', Object.keys(window.electronAPI));