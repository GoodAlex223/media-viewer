const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

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
        title: 'Media Viewer',
    });

    mainWindow.loadFile('index.html');

    // Enable DevTools toggle with F12 or Ctrl+Shift+I
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
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
        '.mov': 'video/quicktime',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

// App lifecycle
app.whenReady().then(() => {
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
                buttonLabel: 'Select Folder',
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

    ipcMain.handle('check-file-exists', async (event, filePath) => {
        try {
            await fs.access(filePath);
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
        } catch (_error) {
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
            const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath];

            const { stdout } = await execFileAsync(ffprobePath, args, {
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

    ipcMain.handle('extractKeyframes', async (_event, videoPath, maxFrames = 20) => {
        if (!ffmpegPath) {
            return { success: false, error: 'ffmpeg not available' };
        }

        const os = require('os');
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mv-keyframes-'));

        try {
            // Scene-change detection: extract frames where scene score > 0.3
            const outputPattern = path.join(tempDir, 'frame-%03d.png');
            await execFileAsync(
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
                        const probeResult = await execFileAsync(ffprobePath, [
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

                // Extract first, middle, last frames
                const timestamps = [0, duration / 2, Math.max(0, duration - 0.1)];
                const fallbackPaths = [];
                for (let idx = 0; idx < timestamps.length; idx++) {
                    const outPath = path.join(tempDir, `fallback-${idx}.png`);
                    try {
                        await execFileAsync(
                            ffmpegPath,
                            ['-ss', String(timestamps[idx]), '-i', videoPath, '-frames:v', '1', '-q:v', '2', outPath],
                            { timeout: 15000 }
                        );
                        fallbackPaths.push(outPath);
                    } catch (_e) {
                        // Skip failed frame
                    }
                }

                return { success: true, framePaths: fallbackPaths, tempDir };
            }

            return { success: true, framePaths, tempDir };
        } catch (error) {
            // Clean up temp dir on error
            await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('cleanupKeyframes', async (_event, tempDir) => {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // CLIP model IPC handlers
    ipcMain.handle('loadClipModel', async (event) => {
        return loadClipModel(event);
    });

    ipcMain.handle('unloadClipModel', () => {
        if (clipModelLoading) {
            return { success: false, reason: 'loading' };
        }
        clipProcessor = null;
        clipVisionModel = null;
        clipModelError = null;
        return { success: true };
    });

    ipcMain.handle('extractClipEmbedding', async (event, imagePath) => {
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

    ipcMain.handle('extractClipEmbeddingBatch', async (event, imagePaths) => {
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

    // Receive renderer errors for file logging (fire-and-forget)
    ipcMain.on('log-renderer-error', (_event, { level, message, source }) => {
        const fn = level === 'warn' ? logger.warn : logger.error;
        fn(source || 'renderer', message);
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
