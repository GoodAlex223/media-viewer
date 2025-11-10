const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

function createWindow() {
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
        title: 'Media Viewer'
    });

    mainWindow.loadFile('index.html');

    // Open dev tools in development
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

// Helper functions
function isMediaFile(extension) {
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'];
    return mediaExtensions.includes(extension);
}

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

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    // Handle folder selection
    ipcMain.handle('open-folder-dialog', async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory'],
                title: 'Select Media Folder',
                buttonLabel: 'Select Folder'
            });

            return result.canceled ? null : result.filePaths[0];
        } catch (error) {
            console.error('Dialog error:', error);
            return null;
        }
    });

    // Load media files from folder
    ipcMain.handle('load-folder', async (event, folderPath) => {
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
                                type: getMimeType(ext)
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
    ipcMain.handle('move-file', async (event, data) => {
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
    });

    ipcMain.handle('check-folder-exists', async (event, folderPath) => {
        try {
            await fs.access(folderPath);
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle('create-folder', async (event, folderPath) => {
        try {
            await fs.mkdir(folderPath, { recursive: true });
            return { success: true };
        } catch (error) {
            console.error('Create folder error:', error);
            return { success: false, error: error.message };
        }
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