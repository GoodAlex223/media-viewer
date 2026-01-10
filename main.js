const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');

// ffprobe for video metadata extraction
let ffprobePath;
try {
    ffprobePath = require('ffprobe-static').path;
    console.log('ffprobe loaded from:', ffprobePath);
} catch (e) {
    console.warn('ffprobe-static not available:', e.message);
    ffprobePath = null;
}

const execFileAsync = promisify(execFile);

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

    // Enable DevTools toggle with F12 or Ctrl+Shift+I
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' ||
            (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
        }
    });
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

    // Register Alt+F4 to close the focused window (Windows compatibility)
    globalShortcut.register('Alt+F4', () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.close();
        }
    });

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

    // File read/write operations for hash cache
    ipcMain.handle('read-file', async (_event, filePath) => {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return data;
        } catch (error) {
            // Return null if file doesn't exist or can't be read
            return null;
        }
    });

    ipcMain.handle('write-file', async (_event, filePath, data) => {
        try {
            await fs.writeFile(filePath, data, 'utf8');
            return { success: true };
        } catch (error) {
            console.error('Write file error:', error);
            return { success: false, error: error.message };
        }
    });

    // Video probing using ffprobe
    ipcMain.handle('probe-video', async (_event, videoPath) => {
        if (!ffprobePath) {
            return { success: false, error: 'ffprobe not available' };
        }

        try {
            const args = [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                videoPath
            ];

            const { stdout } = await execFileAsync(ffprobePath, args, {
                timeout: 10000, // 10 second timeout
                maxBuffer: 1024 * 1024 // 1MB buffer
            });

            const data = JSON.parse(stdout);

            // Extract video stream info
            const videoStream = data.streams?.find(s => s.codec_type === 'video');
            const audioStream = data.streams?.find(s => s.codec_type === 'audio');
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
                    audioCodec: audioStream?.codec_name || null
                }
            };
        } catch (error) {
            console.error('Video probe error:', error);
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

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});