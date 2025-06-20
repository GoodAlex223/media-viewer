const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        // width: 1200,
        // height: 800,
        // minWidth: 800,
        // minHeight: 600,
        webPreferences: {
            // nodeIntegration: false,
            contextIsolation: true,
            // preload: path.join(__dirname, 'preload.js')
            preload: 'preload.js',
            sandbox: true,
        },
        title: 'Media Viewer'
    });

    mainWindow.loadFile('index.html');

    // // Open dev tools if in development
    // if (process.env.NODE_ENV === 'development') {
    //     mainWindow.webContents.openDevTools();
    // }

    // mainWindow.on('closed', () => {
    //     mainWindow = null;
    // });
}

// // Handle folder selection
// ipcMain.handle('open-folder-dialog', async () => {
//     const result = await dialog.showOpenDialog(mainWindow, {
//         properties: ['openDirectory'],
//         title: 'Select Media Folder',
//         buttonLabel: 'Select'
//     });
    
//     return result.canceled ? null : result.filePaths[0];
// });
ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Media Folder'
    });
    return result.canceled ? null : result.filePaths[0];
});
console.log("1");
// Load media files from folder
ipcMain.handle('load-folder', async (event, folderPath) => {
    try {
        const files = await fs.readdir(folderPath);
        const mediaFiles = [];
        
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isFile()) {
                const ext = path.extname(file).toLowerCase();
                if (isMediaFile(ext)) {
                    mediaFiles.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        type: getMimeType(ext)
                    });
                }
            }
        }
        
        return { success: true, files: mediaFiles };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

console.log("12");

// File operations (keep your existing implementations)
ipcMain.handle('move-file', async (event, sourcePath, targetFolderPath, fileName) => {
    try {
        await fs.mkdir(targetFolderPath, { recursive: true });
        const targetPath = path.join(targetFolderPath, fileName);
        await fs.rename(sourcePath, targetPath);
        return { success: true, targetPath };
    } catch (error) {
        console.error('File move error:', error);
        return { success: false, error: error.message };
    }
});
console.log("13");
ipcMain.handle('check-folder-exists', async (event, folderPath) => {
    try {
        await fs.access(folderPath);
        return true;
    } catch {
        return false;
    }
});
console.log("15");
ipcMain.handle('create-folder', async (event, folderPath) => {
    try {
        await fs.mkdir(folderPath, { recursive: true });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
console.log("16");
// Helper functions
function isMediaFile(extension) {
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'];
    return mediaExtensions.includes(extension);
}
console.log("17");
function getMimeType(extension) {
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}
console.log("18");
// // App lifecycle
// app.on('ready', createWindow);

// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') {
//         app.quit();
//     }
// });

// app.on('activate', () => {
//     if (mainWindow === null) {
//         createWindow();
//     }
// });
// app.whenReady().then(() => {
//   createWindow();

//   ipcMain.handle('open-folder-dialog', async () => {
//     const result = await dialog.showOpenDialog({
//       properties: ['openDirectory']
//     });
//     return result.filePaths[0];
//   });
// });

app.whenReady().then(createWindow);