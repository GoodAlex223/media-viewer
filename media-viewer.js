import { FullscreenManager } from './fullscreen.js';
import { TournamentManager } from './tournament.js';

const DEFAULT_SHORTCUTS = {
    single: {
        like: 'KeyQ',
        dislike: 'KeyW',
        next: 'KeyS',
        previous: 'KeyA',
        undo: 'Ctrl+KeyA',
    },
    compare: {
        leftLike: 'KeyQ',
        leftDislike: 'KeyW',
        rightLike: 'KeyE',
        rightDislike: 'KeyR',
        next: 'KeyS',
        previous: 'KeyA',
        undo: 'Ctrl+KeyA',
        bothGood: 'KeyD',
        bothBad: 'KeyF',
    },
    tournament: {
        // Like/dislike handlers are tournament-aware (see _tournamentPickFromSide)
        // so reuse the same Q/W/E/R layout as Compare Mode for muscle memory.
        leftLike: 'KeyQ',
        leftDislike: 'KeyW',
        rightLike: 'KeyE',
        rightDislike: 'KeyR',
        bothWin: 'KeyD',
        bothLose: 'KeyF',
        undo: 'Ctrl+KeyA',
        leftSpecial: 'Digit1',
        rightSpecial: 'Digit2',
    },
};

const ACTION_LABELS = {
    like: 'Like media',
    dislike: 'Dislike media',
    next: 'Next media',
    previous: 'Previous media',
    undo: 'Undo last move',
    leftLike: 'Left media Like',
    leftDislike: 'Left media Dislike',
    rightLike: 'Right media Like',
    rightDislike: 'Right media Dislike',
    leftSpecial: 'Left to special folder',
    rightSpecial: 'Right to special folder',
    bothGood: 'Both media good',
    bothBad: 'Both media bad',
    bothWin: 'Both win (tie up)',
    bothLose: 'Both lose (tie down)',
};

const CLIP_UNLOAD_DELAY_MS = 30000; // grace period before unloading the CLIP model after extraction

class MediaViewer {
    constructor() {
        this.mediaFiles = [];
        // Cached path→index map for O(1) tournament pair lookup; rebuilt when mediaFiles changes.
        this._mediaPathIndex = null;
        this._mediaPathIndexSource = null;
        this.currentIndex = 0;
        this.currentMedia = null;
        this.currentFolderPath = '';
        this.baseFolderPath = '';
        this.moveHistory = [];
        this.isLoading = false;
        this.isVideoLoading = false;
        this.videoEventListeners = []; // Track video event listeners for proper cleanup
        this.mediaNavigationInProgress = false; // Prevent overlapping navigation
        this.isBeingCleaned = false; // Flag to prevent error notifications during cleanup

        // Compare mode state
        this.isCompareMode = false;
        this.leftMedia = null;
        this.rightMedia = null;
        this.leftMediaWrapper = null;
        this.rightMediaWrapper = null;
        this.hiddenMediaIndices = []; // Indices of media that were not rated
        this.videoEventListenersLeft = [];
        this.videoEventListenersRight = [];

        // Visual similarity state
        this.perceptualHashes = new Map(); // Map<filePath, hash>
        this.isSortedBySimilarity = false;
        this.originalMediaFiles = []; // Backup of original order
        this.isComputingHashes = false;
        this.sortAbortController = null;
        this.progressNotification = null; // Reusable progress notification
        this.sortAlgorithm = localStorage.getItem('sortAlgorithm') || 'vptree'; // 'vptree', 'mst', or 'simple'
        this.sortingWorker = null; // Web Worker for sorting to prevent UI freeze

        // JXL decode state (module Web Worker)
        this.jxlWorker = null;
        this.jxlFrameCache = new Map(); // filePath -> { frames (grows in place), width, height, animated, numLoops, frameCount, complete, whenComplete }
        this._jxlReqId = 0;
        this._jxlPending = new Map(); // id -> { entry, resolveFirst, rejectFirst, resolveComplete, rejectComplete }
        this._jxlReady = null;
        this._jxlResolveReady = null;
        this._jxlRejectReady = null;
        // NOTE: _jxlObjectURLs is shared across single + both compare sides. Safe only because
        // compare always cleans + re-renders BOTH sides together; a future per-side re-render
        // must scope URL revocation per side to avoid blanking the still-displayed side.
        this._jxlObjectURLs = null; // Set<string> of active object URLs for decoded JXL frames
        this._jxlAnimToken = null; // identity token for the active animated-JXL playback loop
        this._jxlAnimTimer = null; // setTimeout handle for the next animation frame

        // ML Prediction state
        this.mlWorker = null;
        this.featureCache = new Map(); // Map<filePath, Float32Array>
        this.clipCache = new Map(); // Map<filePath, Float32Array(512)>
        this.featureMetadata = new Map(); // Map<filePath, {size: number, mtime: number}>
        this.predictionScores = new Map(); // Map<filePath, number (0-1)>
        this.mlModelState = null; // Persisted model weights
        this.isMlEnabled = localStorage.getItem('mlPredictionEnabled') !== 'false';
        this.enableClipFeatures = localStorage.getItem('enableClipFeatures') !== 'false';
        this.showPredictionBadges = localStorage.getItem('showPredictionBadges') !== 'false';
        this.isSortedByPrediction = false;
        this.mlStats = null; // Current model statistics
        this.compareLeftFile = null; // Current left file in compare mode (highest score)
        this.compareRightFile = null; // Current right file in compare mode (lowest score)
        this.mlComparePairIndex = 0; // Index for ML pair selection (0 = highest vs lowest)
        this.pendingCompareRefresh = false; // Awaiting ML re-score before showing next compare pair
        this.pendingCompareUpdates = 0; // Counter for expected updateComplete messages (2 for rating, 1 for undo)
        this.pendingCompareTimeout = null; // Fallback timeout ID
        this.previousScores = null; // Snapshot of predictionScores for delta notification
        // Corrective training: filename -> 'good' | 'bad' (mirrors per-folder .bulk_rated.json)
        this.bulkRated = new Map();

        // CLIP model state (main process IPC)
        this.clipWorkerReady = false;
        this.clipModelDownloading = false;

        // Feature extraction worker pool state
        this.featureWorkers = []; // Array of Worker instances
        const savedWorkerCount = parseInt(localStorage.getItem('featureWorkerCount'), 10);
        this.featureWorkerCount = savedWorkerCount >= 1 && savedWorkerCount <= 8 ? savedWorkerCount : 4;

        this.featureTaskQueue = []; // Priority queue of pending tasks
        this.featurePendingTasks = new Map(); // Map<taskId, {resolve, reject, filePath, retries}>
        this.featureTaskIdCounter = 0; // Incrementing task ID
        this.isBackgroundExtracting = false;
        this.backgroundExtractionAbort = null; // AbortController for cancellation
        this.featureCacheDirty = false; // Flag for auto-save
        this.featureCacheAutoSaveInterval = null;
        this.extractionStartTime = null; // Date.now() when extraction starts
        this.extractionCompletionTimes = []; // Rolling window of completion timestamps
        this.extractionRunId = 0; // Generation counter for cancel-then-restart safety
        this.extractionPaused = false; // True while user is navigating/rating
        this.extractionResumeResolve = null; // Resolves awaitExtractionGate() when paused
        this.extractionResumeTimer = null; // setTimeout handle for 2s idle resume
        this.clipUnloadTimer = null; // setTimeout handle for 30s CLIP model unload after extraction
        this._extractionLastCurrent = 0; // Last known current count for paused redisplay
        this._extractionLastTotal = 0; // Last known total count for paused redisplay
        this._extractionCachedCount = 0; // Cached file count for progress display

        // User settings
        this.showRatingConfirmations = localStorage.getItem('showRatingConfirmations') !== 'false'; // default: true
        this.autoCloseErrors = localStorage.getItem('autoCloseErrors') === 'true'; // default: false
        this.customLikeFolder = localStorage.getItem('customLikeFolder') || '';
        this.customDislikeFolder = localStorage.getItem('customDislikeFolder') || '';
        this.customSpecialFolder = localStorage.getItem('customSpecialFolder') || '';
        this.shortcuts = this.loadShortcuts();
        this.shortcutReverseMap = this.buildReverseMap();
        this._listeningState = null;
        this._listeningHandler = null;
        this.renderShortcutRows();
        this.attachShortcutKeyListeners();

        // Tournament manager (v2.0 module pattern — instantiated before fullscreen because
        // its setup is lightweight and there's no cross-dependency)
        this.tournament = new TournamentManager(this);
        this.isTournamentMode = false;

        // Fullscreen manager (v2.0 module pattern — stateful manager with callbacks)
        this.fullscreen = new FullscreenManager({
            isZoomed: (wrapper) => {
                const target = wrapper.classList.contains('left-media-wrapper')
                    ? 'left'
                    : wrapper.classList.contains('right-media-wrapper')
                      ? 'right'
                      : 'single';
                return this.zoomState[target] && this.zoomState[target].scale > 1;
            },
            pauseOtherVideos: (wrapper) => {
                if (this.leftMedia && this.leftMedia.tagName === 'VIDEO' && this.leftMediaWrapper !== wrapper) {
                    this.leftMedia.pause();
                }
                if (this.rightMedia && this.rightMedia.tagName === 'VIDEO' && this.rightMediaWrapper !== wrapper) {
                    this.rightMedia.pause();
                }
            },
        });

        // Zoom state for each view
        this.zoomState = {
            single: { scale: 1, translateX: 0, translateY: 0 },
            left: { scale: 1, translateX: 0, translateY: 0 },
            right: { scale: 1, translateX: 0, translateY: 0 },
        };
        this.zoomSteps = [1, 2, 4]; // Click-to-zoom levels
        this.minZoom = 1;
        this.maxZoom = 8;
        this.zoomFactor = 1.15; // Wheel zoom factor per tick
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.panStartTranslate = { x: 0, y: 0 };

        this.initializeElements();
        this.setupEventListeners();
        this.setupHeaderVisibility();
        this.setupFileInfoVisibility();
        this.setupControlsVisibility();
        this.updateRatingButtonsState();
        this.updateSpecialButtonsState();
        // ML worker and feature pool are initialized lazily when user clicks "Sort by Prediction"

        if (!window.electronAPI) {
            console.error('Electron API not available');
            this.showError("Electron API not available. Please make sure you're running this in Electron.");
        }

        // Global error handlers — forward uncaught errors to main process log
        window.onerror = (msg, url, line, col, _err) => {
            const message = `${msg} at ${url}:${line}:${col}`;
            if (window.electronAPI && window.electronAPI.logError) {
                window.electronAPI.logError({ level: 'error', message, source: 'renderer' });
            }
        };

        window.addEventListener('unhandledrejection', (event) => {
            const message = `Unhandled promise rejection: ${event.reason}`;
            if (window.electronAPI && window.electronAPI.logError) {
                window.electronAPI.logError({ level: 'error', message, source: 'renderer' });
            }
        });
    }

    initializeElements() {
        this.dropZone = document.getElementById('dropZone');
        this.fileInfo = document.getElementById('fileInfoPanel');
        this.fileName = document.getElementById('fileName');
        this.fileDetails = document.getElementById('fileDetails');
        this.infoToggleBtn = document.getElementById('infoToggleBtn');
        this.fileInfoClose = document.getElementById('fileInfoClose');
        this.folderInfo = document.getElementById('folderInfo');
        this.controls = document.getElementById('controls');
        this.likeBtn = document.getElementById('likeBtn');
        this.dislikeBtn = document.getElementById('dislikeBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.navInfo = document.getElementById('navInfo');
        this.mediaIndex = document.getElementById('mediaIndex');
        this.videoControls = document.getElementById('videoControls');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.playIcon = document.getElementById('playIcon');
        this.pauseIcon = document.getElementById('pauseIcon');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.progressSlider = document.getElementById('progressSlider');
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        this.skipBackwardBtn = document.getElementById('skipBackwardBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.header = document.getElementById('header');
        this.notificationContainer = document.getElementById('notificationContainer');
        this.mediaContainer = document.querySelector('.media-container');
        this.loadingContainer = document.getElementById('loadingContainer');
        this.navPrev = document.getElementById('navPrev');
        this.navNext = document.getElementById('navNext');
        this.changeFolderBtn = document.getElementById('changeFolderBtn');
        this.helpBtn = document.getElementById('helpBtn');

        // Special folder button (single mode)
        this.specialBtn = document.getElementById('specialBtn');

        // Compare mode elements
        this.viewModeBtn = document.getElementById('viewModeBtn');
        this.viewModeLabel = document.getElementById('viewModeLabel');
        this.compareControls = document.getElementById('compareControls');
        this.leftLikeBtn = document.getElementById('leftLikeBtn');
        this.leftDislikeBtn = document.getElementById('leftDislikeBtn');
        this.rightLikeBtn = document.getElementById('rightLikeBtn');
        this.rightDislikeBtn = document.getElementById('rightDislikeBtn');
        this.leftSpecialBtn = document.getElementById('leftSpecialBtn');
        this.rightSpecialBtn = document.getElementById('rightSpecialBtn');
        this.cancelBtnCompare = document.getElementById('cancelBtnCompare');
        this.bothGoodBtn = document.getElementById('bothGoodBtn');
        this.bothBadBtn = document.getElementById('bothBadBtn');

        // Compare mode file info panels
        this.leftFileInfo = document.getElementById('leftFileInfo');
        this.leftFileName = document.getElementById('leftFileName');
        this.leftFileDetails = document.getElementById('leftFileDetails');
        this.leftFileInfoToggle = document.getElementById('leftFileInfoToggle');
        this.rightFileInfo = document.getElementById('rightFileInfo');
        this.rightFileName = document.getElementById('rightFileName');
        this.rightFileDetails = document.getElementById('rightFileDetails');
        this.rightFileInfoToggle = document.getElementById('rightFileInfoToggle');

        // Visual similarity button
        this.sortSimilarityBtn = document.getElementById('sortSimilarityBtn');
        this.sortAlgorithmSelect = document.getElementById('sortAlgorithmSelect');
        this.sortSettings = document.getElementById('sortSettings');
        this.sortKValueInput = document.getElementById('sortKValue');

        // Set initial values from localStorage
        if (this.sortAlgorithmSelect) {
            this.sortAlgorithmSelect.value = this.sortAlgorithm;
        }
        if (this.sortKValueInput) {
            const savedK = localStorage.getItem('sortKValue');
            this.sortKValueInput.value = savedK || '500';
        }

        // Show/hide K settings based on algorithm
        this.updateSortSettingsVisibility();

        // ML Prediction button
        this.sortPredictionBtn = document.getElementById('sortPredictionBtn');

        // Zoom popover controls
        this.zoomControlsMap = {};
        this.setupZoomPopovers();
    }

    updateSortSettingsVisibility() {
        if (!this.sortSettings) return;
        // Sorting is disabled in tournament mode — keep the K settings hidden.
        if (this.isTournamentMode) {
            this.sortSettings.style.display = 'none';
            return;
        }

        // Show K settings only for Simple algorithm
        if (this.sortAlgorithm === 'simple') {
            this.sortSettings.style.display = 'inline-flex';
        } else {
            this.sortSettings.style.display = 'none';
        }
    }

    areFoldersConfigured() {
        return this.customLikeFolder && this.customDislikeFolder;
    }

    updateRatingButtonsState() {
        const enabled = this.areFoldersConfigured();
        const tooltip = enabled ? '' : 'Configure like/dislike folders in Settings (F1)';

        // Single mode buttons
        if (this.likeBtn) {
            this.likeBtn.disabled = !enabled;
            this.likeBtn.title = enabled ? 'Like (Arrow Up)' : tooltip;
        }
        if (this.dislikeBtn) {
            this.dislikeBtn.disabled = !enabled;
            this.dislikeBtn.title = enabled ? 'Dislike (Arrow Down)' : tooltip;
        }

        // Compare mode buttons
        if (this.leftLikeBtn) {
            this.leftLikeBtn.disabled = !enabled;
            this.leftLikeBtn.title = enabled ? 'Like Left (Q)' : tooltip;
        }
        if (this.leftDislikeBtn) {
            this.leftDislikeBtn.disabled = !enabled;
            this.leftDislikeBtn.title = enabled ? 'Dislike Left (W)' : tooltip;
        }
        if (this.rightLikeBtn) {
            this.rightLikeBtn.disabled = !enabled;
            this.rightLikeBtn.title = enabled ? 'Like Right (E)' : tooltip;
        }
        if (this.rightDislikeBtn) {
            this.rightDislikeBtn.disabled = !enabled;
            this.rightDislikeBtn.title = enabled ? 'Dislike Right (R)' : tooltip;
        }

        // Update folder config warning
        const warning = document.getElementById('folderConfigWarning');
        if (warning) {
            warning.style.display = enabled ? 'none' : 'block';
        }
    }

    updateSpecialButtonsState() {
        const enabled = !!this.customSpecialFolder;
        const tooltip = enabled ? 'Move to special folder' : 'Configure special folder in Settings (F1)';

        // Single mode button
        if (this.specialBtn) {
            this.specialBtn.disabled = !enabled;
            this.specialBtn.title = tooltip;
        }

        // Compare mode buttons
        if (this.leftSpecialBtn) {
            this.leftSpecialBtn.disabled = !enabled;
            this.leftSpecialBtn.title = enabled ? 'Move left to special folder' : tooltip;
        }
        if (this.rightSpecialBtn) {
            this.rightSpecialBtn.disabled = !enabled;
            this.rightSpecialBtn.title = enabled ? 'Move right to special folder' : tooltip;
        }
    }

    setupFolderSettings() {
        const likeFolderInput = document.getElementById('likeFolderInput');
        const dislikeFolderInput = document.getElementById('dislikeFolderInput');
        const likeFolderBrowse = document.getElementById('likeFolderBrowse');
        const dislikeFolderBrowse = document.getElementById('dislikeFolderBrowse');
        const likeFolderClear = document.getElementById('likeFolderClear');
        const dislikeFolderClear = document.getElementById('dislikeFolderClear');

        // Set initial values from stored settings
        if (likeFolderInput) {
            likeFolderInput.value = this.customLikeFolder;
        }
        if (dislikeFolderInput) {
            dislikeFolderInput.value = this.customDislikeFolder;
        }

        // Browse button for like folder
        if (likeFolderBrowse) {
            likeFolderBrowse.addEventListener('click', async () => {
                const folder = await window.electronAPI.openFolderDialog();
                if (folder) {
                    this.customLikeFolder = folder;
                    localStorage.setItem('customLikeFolder', folder);
                    if (likeFolderInput) {
                        likeFolderInput.value = folder;
                    }
                    this.updateRatingButtonsState();
                    this.resetMlModel();
                }
            });
        }

        // Browse button for dislike folder
        if (dislikeFolderBrowse) {
            dislikeFolderBrowse.addEventListener('click', async () => {
                const folder = await window.electronAPI.openFolderDialog();
                if (folder) {
                    this.customDislikeFolder = folder;
                    localStorage.setItem('customDislikeFolder', folder);
                    if (dislikeFolderInput) {
                        dislikeFolderInput.value = folder;
                    }
                    this.updateRatingButtonsState();
                    this.resetMlModel();
                }
            });
        }

        // Clear button for like folder
        if (likeFolderClear) {
            likeFolderClear.addEventListener('click', () => {
                this.customLikeFolder = '';
                localStorage.removeItem('customLikeFolder');
                if (likeFolderInput) {
                    likeFolderInput.value = '';
                }
                this.updateRatingButtonsState();
                this.resetMlModel();
            });
        }

        // Clear button for dislike folder
        if (dislikeFolderClear) {
            dislikeFolderClear.addEventListener('click', () => {
                this.customDislikeFolder = '';
                localStorage.removeItem('customDislikeFolder');
                if (dislikeFolderInput) {
                    dislikeFolderInput.value = '';
                }
                this.updateRatingButtonsState();
                this.resetMlModel();
            });
        }

        // Special folder settings
        const specialFolderInput = document.getElementById('specialFolderInput');
        const specialFolderBrowse = document.getElementById('specialFolderBrowse');
        const specialFolderClear = document.getElementById('specialFolderClear');

        // Set initial value
        if (specialFolderInput) {
            specialFolderInput.value = this.customSpecialFolder;
        }

        // Browse button for special folder
        if (specialFolderBrowse) {
            specialFolderBrowse.addEventListener('click', async () => {
                const folder = await window.electronAPI.openFolderDialog();
                if (folder) {
                    this.customSpecialFolder = folder;
                    localStorage.setItem('customSpecialFolder', folder);
                    if (specialFolderInput) {
                        specialFolderInput.value = folder;
                    }
                    this.updateSpecialButtonsState();
                }
            });
        }

        // Clear button for special folder
        if (specialFolderClear) {
            specialFolderClear.addEventListener('click', () => {
                this.customSpecialFolder = '';
                localStorage.removeItem('customSpecialFolder');
                if (specialFolderInput) {
                    specialFolderInput.value = '';
                }
                this.updateSpecialButtonsState();
            });
        }
    }

    showFolderCreationDialog(folderPath) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'folder-creation-modal';

            modal.innerHTML = `
                <div class="folder-creation-content">
                    <div class="folder-creation-title">
                        <i data-lucide="folder-plus"></i>
                        Create Folder
                    </div>
                    <p class="folder-creation-text">
                        The target folder doesn't exist. Would you like to create it?
                    </p>
                    <div class="folder-creation-path">${folderPath}</div>
                    <div class="folder-creation-actions">
                        <button id="createBtn" class="folder-creation-btn folder-creation-btn-create">Create Folder</button>
                        <button id="cancelBtn" class="folder-creation-btn folder-creation-btn-cancel">Cancel</button>
                    </div>
                </div>
            `;

            // Initialize Lucide icons in the modal
            if (typeof lucide !== 'undefined') {
                document.body.appendChild(modal);
                lucide.createIcons({ root: modal });
            } else {
                document.body.appendChild(modal);
            }

            const createBtn = modal.querySelector('#createBtn');
            const cancelBtn = modal.querySelector('#cancelBtn');

            const cleanup = () => modal.remove();

            createBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(false);
                    document.removeEventListener('keydown', handleKeydown);
                }
            };
            document.addEventListener('keydown', handleKeydown);
        });
    }

    isJxl(filePath) {
        return /\.jxl$/i.test(filePath);
    }

    // Convert Windows path to properly encoded file:// URL
    pathToFileURL(filePath) {
        // Replace backslashes with forward slashes
        const normalized = filePath.replace(/\\/g, '/');
        // Encode special characters while preserving forward slashes and colon
        const encoded = normalized
            .split('/')
            .map((part) => encodeURIComponent(part))
            .join('/');
        // Add file:// protocol
        return `file:///${encoded}`;
    }

    ensureJxlWorker() {
        if (this.jxlWorker) return this._jxlReady;
        // Local ref so the error/init-failure paths terminate THIS worker instance and only
        // null this.jxlWorker if it still points here (a newer worker may have replaced it).
        const worker = new Worker('jxl-decode-worker.js', { type: 'module' });
        this.jxlWorker = worker;
        const teardownWorker = () => {
            worker.terminate(); // release the underlying thread (was leaked before)
            if (this.jxlWorker === worker) this.jxlWorker = null; // allow re-creation next decode
        };
        worker.addEventListener('message', (e) => this._handleJxlWorkerMessage(e.data));
        worker.addEventListener('error', (e) => {
            const msg = (e && e.message) || 'JXL decode worker crashed';
            for (const pending of this._jxlPending.values()) this._rejectJxlPending(pending, new Error(msg));
            this._jxlPending.clear();
            if (this._jxlRejectReady) {
                this._jxlRejectReady(new Error(msg));
                this._jxlRejectReady = null;
                this._jxlResolveReady = null;
            }
            teardownWorker();
        });
        // Explicit-bytes wasm init (spike §9): main process reads the vendored .wasm.
        this._jxlReady = new Promise((res, rej) => {
            this._jxlResolveReady = res;
            this._jxlRejectReady = rej;
        });
        window.electronAPI
            .readJxlWasm()
            .then((wasmBytes) => {
                if (!wasmBytes) throw new Error('JXL WASM unavailable (read-jxl-wasm returned null)');
                worker.postMessage({ type: 'init', wasmBytes }, [wasmBytes]);
            })
            .catch((err) => {
                if (this._jxlRejectReady) {
                    this._jxlRejectReady(
                        new Error('JXL WASM load failed: ' + (err && err.message ? err.message : err))
                    );
                    this._jxlRejectReady = null;
                    this._jxlResolveReady = null;
                }
                teardownWorker();
            });
        return this._jxlReady;
    }

    // Routes one streaming message from the JXL decode worker (spec 2026-06-12).
    // Protocol: meta -> frame xN -> done, or error at any point. The pending record
    // (keyed by request id) carries both promise layers: resolveFirst/rejectFirst settle
    // decodeJxl() at frame-0 time; resolveComplete/rejectComplete settle entry.whenComplete.
    _handleJxlWorkerMessage(m) {
        if (m.type === 'ready') {
            if (this._jxlResolveReady) this._jxlResolveReady();
            this._jxlResolveReady = null; // init settled — drop the resolver refs
            this._jxlRejectReady = null;
            return;
        }
        if (m.type === 'init-error') {
            if (this._jxlRejectReady) this._jxlRejectReady(new Error(m.message));
            this._jxlResolveReady = null; // init settled (failed) — drop the resolver refs
            this._jxlRejectReady = null;
            return;
        }
        const pending = this._jxlPending.get(m.id);
        if (!pending) return;
        if (m.type === 'meta') {
            const entry = {
                frames: [], // grows in place as 'frame' messages arrive
                width: m.width,
                height: m.height,
                animated: m.animated,
                numLoops: m.numLoops,
                frameCount: m.frameCount, // total; gate animation on this, NOT frames.length
                complete: false,
                whenComplete: null,
            };
            entry.whenComplete = new Promise((res, rej) => {
                pending.resolveComplete = res;
                pending.rejectComplete = rej;
            });
            // Frame-0-only consumers never await whenComplete; swallow its rejection here
            // so a mid-stream error doesn't surface as an unhandled rejection. Real
            // consumers (startJxlAnimation) attach their own handlers.
            entry.whenComplete.catch(() => {});
            pending.entry = entry;
            return;
        }
        if (m.type === 'frame') {
            if (!pending.entry) return; // protocol violation: frame before meta — ignore
            pending.entry.frames.push({ pngBytes: m.pngBytes, duration: m.duration });
            if (pending.entry.frames.length === 1) pending.resolveFirst(pending.entry);
            return;
        }
        if (m.type === 'done') {
            this._jxlPending.delete(m.id);
            if (!pending.entry || pending.entry.frames.length === 0) {
                // Defensive: a stream that "finishes" without delivering any frame must
                // still settle decodeJxl's promise, or navigation hangs silently.
                this._rejectJxlPending(pending, new Error('JXL decode finished without producing frames'));
                return;
            }
            pending.entry.complete = true;
            if (pending.resolveComplete) pending.resolveComplete(pending.entry);
            return;
        }
        if (m.type === 'error') {
            this._jxlPending.delete(m.id);
            this._rejectJxlPending(pending, new Error(m.message));
        }
    }

    // Settles a pending JXL decode with an error at whichever layer is still open:
    // after frame 0 only whenComplete is outstanding (static frame-0 fallback);
    // before frame 0 both layers reject (decodeJxl callers handle it).
    _rejectJxlPending(pending, err) {
        if (pending.entry && pending.entry.frames.length > 0) {
            if (pending.rejectComplete) pending.rejectComplete(err);
        } else {
            pending.rejectFirst(err);
            if (pending.rejectComplete) pending.rejectComplete(err);
        }
    }

    async decodeJxl(filePath) {
        this._jxlPending = this._jxlPending || new Map();
        if (this.jxlFrameCache.has(filePath)) {
            const cached = this.jxlFrameCache.get(filePath);
            this.jxlFrameCache.delete(filePath);
            this.jxlFrameCache.set(filePath, cached); // move to most-recently-used (end)
            return cached;
        }
        await this.ensureJxlWorker(); // resolves once the worker posts {type:'ready'}
        const buffer = await window.electronAPI.readFileBuffer(filePath);
        if (!buffer) throw new Error('Could not read JXL file: ' + filePath);
        const id = ++this._jxlReqId;
        // Resolves at frame-0 time: _handleJxlWorkerMessage settles resolveFirst as soon as
        // meta + the first 'frame' message arrive. The entry's frames array keeps growing
        // in place afterwards; entry.whenComplete settles when the stream finishes.
        const entry = await new Promise((resolve, reject) => {
            // Guard the frame-0 wait: if the worker never streams a first frame (hang),
            // reject + drop the pending entry rather than wait forever. Mirrors
            // loadMediaAsImageData's 15s pattern. whenComplete (later frames) stays
            // unbounded — a stall there merely leaves frame 0 displayed static.
            const timer = setTimeout(() => {
                this._jxlPending.delete(id);
                reject(new Error('JXL decode timeout'));
            }, 15000);
            this._jxlPending.set(id, {
                entry: null,
                resolveFirst: (val) => {
                    clearTimeout(timer);
                    resolve(val);
                },
                rejectFirst: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
                resolveComplete: null,
                rejectComplete: null,
            });
            this.jxlWorker.postMessage({ type: 'decode', id, buffer }, [buffer]);
        });
        this.jxlFrameCache.set(filePath, entry);
        // Bound the cache as a true-LRU. Animated JXL entries can be very large
        // (a 270-frame file holds ~77 MB of PNG bytes), so cap to a small number
        // of most-recently-used entries to avoid unbounded growth across navigation.
        const JXL_CACHE_MAX = 8;
        while (this.jxlFrameCache.size > JXL_CACHE_MAX) {
            const oldestKey = this.jxlFrameCache.keys().next().value; // Map preserves insertion order
            this.jxlFrameCache.delete(oldestKey);
        }
        return entry;
    }

    jxlFrameToObjectURL(frame) {
        const blob = new Blob([frame.pngBytes], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        this._jxlObjectURLs = this._jxlObjectURLs || new Set();
        this._jxlObjectURLs.add(url);
        return url;
    }

    revokeJxlObjectURLs() {
        if (!this._jxlObjectURLs) return;
        for (const url of this._jxlObjectURLs) URL.revokeObjectURL(url);
        this._jxlObjectURLs.clear();
    }

    // Pure helper: map decoded JXL frames to per-frame display delays (ms).
    // jxl-oxide RenderResult.duration is already in MILLISECONDS; floor zero/short
    // frames to MIN_MS so a 0-duration frame doesn't busy-loop the scheduler.
    computeJxlFrameSchedule(frames) {
        const MIN_MS = 20;
        return frames.map((f) => Math.max(MIN_MS, Math.round(f.duration || 0)));
    }

    // Animated JXL playback: decode ONE frame at a time to an ImageBitmap, draw, close it.
    // Never holds more than ~1 decoded frame in memory (270x720p as bitmaps would be ~1GB).
    // Frame-0-first (spec 2026-06-12): draws frame 0 as soon as it exists, then waits for
    // decoded.whenComplete before starting the loop. Returns after canvas setup — the
    // buffering wait runs fire-and-forget so callers can append + finish display immediately.
    async startJxlAnimation(decoded) {
        const canvas = document.createElement('canvas');
        canvas.className = 'media-display';
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        this.currentMedia = canvas; // caller appends this.currentMedia after we return
        const ctx = canvas.getContext('2d');
        const token = {}; // identity token for teardown
        this._jxlAnimToken = token;
        const runWhenBuffered = async () => {
            // Show frame 0 immediately — the rest of the animation may still be streaming
            // in from the decode worker.
            try {
                const bmp0 = await createImageBitmap(new Blob([decoded.frames[0].pngBytes], { type: 'image/png' }));
                if (this._jxlAnimToken !== token) {
                    if (bmp0.close) bmp0.close();
                    return;
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bmp0, 0, 0);
                if (bmp0.close) bmp0.close();
            } catch (_e) {
                // Frame 0 undrawable — the loop below may still recover via its skip logic.
            }
            // Wait until every frame is buffered. Mid-stream decode errors reject
            // whenComplete: leave frame 0 displayed as a static image (approved fallback).
            if (decoded.whenComplete) {
                try {
                    await decoded.whenComplete;
                } catch (err) {
                    window.electronAPI.logError(
                        'JXL streaming decode failed mid-animation (showing frame 0 static): ' +
                            (err && err.message ? err.message : err)
                    );
                    return;
                }
                if (this._jxlAnimToken !== token) return; // superseded during buffering
            }
            const delays = this.computeJxlFrameSchedule(decoded.frames);
            let i = 0;
            let loop = 0;
            let consecutiveFailures = 0;
            // Advance to the next frame, wrapping + counting loops. Returns false once a finite
            // numLoops has completed (caller stops), true to keep playing.
            const advance = () => {
                i++;
                if (i >= decoded.frames.length) {
                    i = 0;
                    loop++;
                    if (decoded.numLoops !== 0 && loop >= decoded.numLoops) return false; // finite loops done
                }
                return true;
            };
            const drawNext = async () => {
                if (this._jxlAnimToken !== token) return; // superseded by navigation/cleanup
                const delay = delays[i];
                let bmp;
                try {
                    bmp = await createImageBitmap(new Blob([decoded.frames[i].pngBytes], { type: 'image/png' }));
                    consecutiveFailures = 0;
                } catch (_e) {
                    // Skip a single corrupt frame and keep playing; bail only if an entire pass fails.
                    consecutiveFailures++;
                    if (consecutiveFailures >= decoded.frames.length) {
                        // Whole animation undecodable — surface it instead of freezing silently.
                        // drawNext is not re-scheduled after this return, so it fires at most once.
                        this._jxlAnimTimer = null; // loop is stopping; mirror stopJxlAnimation housekeeping
                        this.showNotification('Could not play animation — showing first frame', 'warning');
                        return;
                    }
                    if (!advance()) return;
                    this._jxlAnimTimer = setTimeout(drawNext, delay);
                    return;
                }
                if (this._jxlAnimToken !== token) {
                    if (bmp.close) bmp.close();
                    return;
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bmp, 0, 0);
                if (bmp.close) bmp.close();
                if (!advance()) return;
                this._jxlAnimTimer = setTimeout(drawNext, delay);
            };
            drawNext();
        };
        // Fire-and-forget: a synchronous throw outside the inner try blocks must not
        // become an unhandled rejection.
        runWhenBuffered().catch((e) =>
            window.electronAPI.logError('JXL animation startup failed: ' + (e && e.message ? e.message : e))
        );
    }

    stopJxlAnimation() {
        this._jxlAnimToken = null;
        if (this._jxlAnimTimer) {
            clearTimeout(this._jxlAnimTimer);
            this._jxlAnimTimer = null;
        }
    }

    formatTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
        const weeks = Math.floor(days / 7);
        return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }

    formatElapsed(totalSeconds) {
        totalSeconds = Math.round(totalSeconds);
        if (!isFinite(totalSeconds) || totalSeconds < 0) return '?';
        if (totalSeconds < 60) return `${totalSeconds}s`;
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
    }

    formatEta(totalSeconds) {
        return `~${this.formatElapsed(totalSeconds)}`;
    }

    showNotification(message, type = 'success', options = {}) {
        // Limit total notifications to 5, remove oldest when exceeded
        const allNotifications = Array.from(this.notificationContainer.querySelectorAll('.notification'));
        while (allNotifications.length >= 5) {
            allNotifications.shift().remove();
        }

        // Limit info notifications to prevent UI freezing
        if (type === 'info') {
            // Remove old info notifications if more than 2 exist
            const infoNotifications = Array.from(this.notificationContainer.querySelectorAll('.notification.info'));
            if (infoNotifications.length >= 2) {
                // Remove oldest info notifications
                infoNotifications.slice(0, infoNotifications.length - 1).forEach((n) => n.remove());
            }
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        // Create message text container
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        messageSpan.style.cursor = 'pointer';
        messageSpan.title = 'Click to copy';
        messageSpan.style.flex = '1';

        // Create action button if provided
        let actionBtn = null;
        if (options.actionButton && options.actionCallback) {
            actionBtn = document.createElement('button');
            actionBtn.textContent = options.actionButton;
            actionBtn.className = 'notification-action';
            actionBtn.title = options.actionButton;
        }

        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'notification-close';
        closeBtn.title = 'Close';

        notification.appendChild(messageSpan);
        if (actionBtn) {
            notification.appendChild(actionBtn);
        }
        notification.appendChild(closeBtn);

        // Add click handler to copy message
        messageSpan.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(message);
                const originalText = messageSpan.textContent;
                messageSpan.textContent = '✓ Copied!';
                setTimeout(() => {
                    if (notification.parentNode) {
                        messageSpan.textContent = originalText;
                    }
                }, 1000);
            } catch (error) {
                console.error('Failed to copy:', error);
            }
        });

        // Add close button handler
        const closeNotification = () => {
            notification.style.animation = 'slideOutDown 0.3s ease-in forwards';
            setTimeout(() => notification.remove(), 300);
        };
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeNotification();
        });

        // Add action button handler
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                options.actionCallback();
                closeNotification();
            });
        }

        this.notificationContainer.appendChild(notification);

        // Auto-close: info/success - 2s, warning - 5s, error - 8s if enabled or keep visible
        const displayTime = type === 'error' ? (this.autoCloseErrors ? 8000 : 0) : type === 'warning' ? 5000 : 2000;
        if (displayTime > 0) {
            const autoCloseTimeout = setTimeout(closeNotification, displayTime);
            closeBtn.addEventListener('click', () => clearTimeout(autoCloseTimeout), { once: true });
        }
    }

    showError(message, options = {}) {
        console.error('Error:', message);
        if (window.electronAPI && window.electronAPI.logError) {
            window.electronAPI.logError({ level: 'error', message, source: 'renderer' });
        }
        this.showNotification(`❌ ${message}`, 'error', options);
    }

    /**
     * Show subtle ML learning indicator (bottom-left, auto-dismiss)
     */
    showMlLearningIndicator(stats) {
        // Remove existing indicator
        const existing = document.getElementById('ml-learning-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('div');
        indicator.id = 'ml-learning-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            background: rgba(76, 175, 80, 0.9);
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            opacity: 1;
            transition: opacity 0.3s ease;
        `;
        indicator.textContent = `🧠 ML: ${stats.positiveCount}👍 ${stats.negativeCount}👎`;

        document.body.appendChild(indicator);

        // Auto-dismiss after 1.5s
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => indicator.remove(), 300);
        }, 1500);
    }

    /**
     * Centralized file removal from the media list.
     * Handles array splice, cache cleanup (predictionScores, featureCache, clipCache, featureMetadata, perceptualHashes),
     * and currentIndex adjustment.
     * @param {string} filePath - Absolute path of the file to remove
     * @returns {number} The index the file was at before removal, or -1 if not found
     */
    removeFileFromList(filePath) {
        const index = this.mediaFiles.findIndex((f) => f.path === filePath);
        if (index === -1) return -1;

        const removedName = this.mediaFiles[index].name;
        this.mediaFiles.splice(index, 1);
        this._mediaPathIndex = null; // invalidate cached path→index map

        this.predictionScores.delete(filePath);
        this.featureCache.delete(filePath);
        this.clipCache.delete(filePath);
        this.jxlFrameCache.delete(filePath);
        this.featureMetadata.delete(filePath);
        this.perceptualHashes.delete(filePath);
        if (this.bulkRated.delete(removedName)) {
            this.saveBulkRatedFile();
        }

        if (this.currentIndex >= this.mediaFiles.length) {
            this.currentIndex = Math.max(0, this.mediaFiles.length - 1);
        }

        return index;
    }

    getMediaIndex(path) {
        if (
            !this._mediaPathIndex ||
            this._mediaPathIndexSource !== this.mediaFiles ||
            this._mediaPathIndex.size !== this.mediaFiles.length
        ) {
            this._mediaPathIndex = new Map(this.mediaFiles.map((f, i) => [f.path, i]));
            this._mediaPathIndexSource = this.mediaFiles;
        }
        return this._mediaPathIndex.has(path) ? this._mediaPathIndex.get(path) : -1;
    }

    restoreFeatureCachesFromHistory(entry) {
        if (!entry || !entry.mlFeatures) return;
        const features = entry.mlFeatures;
        const path = entry.originalPath;

        if (features.length === 576) {
            this.featureCache.set(path, new Float32Array(features.slice(0, 64)));
            this.clipCache.set(path, new Float32Array(features.slice(64, 576)));
        } else if (features.length === 64) {
            this.featureCache.set(path, new Float32Array(features));
        } else {
            return;
        }

        if (entry.fileSize !== undefined) {
            this.featureMetadata.set(path, { size: entry.fileSize, mtime: 0 });
        }
    }

    removeFailedFile(index, side = null) {
        if (index < 0 || index >= this.mediaFiles.length) return;

        const filePath = this.mediaFiles[index].path;
        this.removeFileFromList(filePath);

        // Handle navigation after removal
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
        }

        this.updateFolderInfo();

        // Navigate based on mode
        if (side === 'left' || side === 'right') {
            // Compare mode
            if (this.mediaFiles.length >= 2) {
                this.showMedia();
            } else {
                // Only one file left, switch to single mode
                this.viewMode = 'single';
                this.updateViewModeUI();
                this.showMedia();
            }
        } else {
            // Single mode
            this.showMedia();
        }

        this.showNotification('File removed from list', 'info');
    }

    // Pure view-model for the sort progress card. Locale-independent thousands
    // grouping so the value is deterministic across environments (tests + CI).
    computeSortProgressView({ phase, current, total }) {
        const hasCount = typeof current === 'number' && typeof total === 'number' && total > 0;
        const groupThousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return {
            phase: phase || '',
            determinate: hasCount,
            percent: hasCount ? Math.min(100, Math.round((current / total) * 100)) : null,
            countsText: hasCount ? `${groupThousands(current)} / ${groupThousands(total)}` : '',
        };
    }

    // Update or create a single progress notification instead of creating many
    updateProgressNotification(message) {
        if (!this.progressNotification || !this.progressNotification.parentNode) {
            // Create new progress notification
            this.progressNotification = document.createElement('div');
            this.progressNotification.className = 'notification info';

            const messageSpan = document.createElement('span');
            messageSpan.className = 'progress-message';
            messageSpan.textContent = message;

            this.progressNotification.appendChild(messageSpan);
            this.progressNotification.style.display = 'flex';
            this.progressNotification.style.alignItems = 'center';

            this.notificationContainer.appendChild(this.progressNotification);
        } else {
            // Update existing notification.
            // Guard: if the element was taken over by updateSortProgress (which builds a
            // different DOM structure without .progress-message), rebuild the simple text
            // structure so we don't dereference null. This lets non-sort callers (ML
            // scoring progress, historical-ratings loop) safely fire during a long sort
            // without throwing a TypeError.
            let messageSpan = this.progressNotification.querySelector('.progress-message');
            if (!messageSpan) {
                // Element was in sort-progress card form — reset to simple text form.
                this.progressNotification.className = 'notification info';
                this.progressNotification.innerHTML = '';
                messageSpan = document.createElement('span');
                messageSpan.className = 'progress-message';
                this.progressNotification.appendChild(messageSpan);
                this.progressNotification.style.display = 'flex';
                this.progressNotification.style.alignItems = 'center';
            }
            messageSpan.textContent = message;
        }
    }

    // Clear progress notification
    clearProgressNotification() {
        if (this.progressNotification && this.progressNotification.parentNode) {
            this.progressNotification.remove();
            this.progressNotification = null;
        }
    }

    // Determinate, cancelable sort-progress card (design spec 2026-06-19 §1, Option C).
    // Reuses the same reusable element as updateProgressNotification (glass, primary
    // left-border, bottom-right container) but renders a phase label, a determinate bar,
    // a counts/% line, and a Cancel button wired to the sort abort controller.
    updateSortProgress({ phase, current, total }) {
        const view = this.computeSortProgressView({ phase, current, total });

        if (!this.progressNotification || !this.progressNotification.parentNode) {
            this.progressNotification = document.createElement('div');
            this.notificationContainer.appendChild(this.progressNotification);
        }
        const el = this.progressNotification;
        el.className = 'notification info notification-progress';

        if (!el.querySelector('.progress-phase')) {
            el.innerHTML =
                '<div class="progress-phase"></div>' +
                '<div class="progress-track"><div class="progress-fill"></div></div>' +
                '<div class="progress-meta"><span class="progress-counts"></span>' +
                '<button type="button" class="notification-action progress-cancel">Cancel</button></div>';
            el.querySelector('.progress-cancel').addEventListener('click', () => {
                this.sortAbortController?.abort();
            });
        }

        el.querySelector('.progress-phase').textContent = view.phase;
        const fill = el.querySelector('.progress-fill');
        const counts = el.querySelector('.progress-counts');
        if (view.determinate) {
            el.classList.remove('indeterminate');
            fill.style.width = `${view.percent}%`;
            counts.textContent = `${view.countsText} · ${view.percent}%`;
        } else {
            el.classList.add('indeterminate');
            fill.style.width = '';
            counts.textContent = '';
        }
    }

    nextMedia() {
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
        }

        if (this.isLoading || this.mediaNavigationInProgress) return;

        this.signalUserActivity();

        if (this.isCompareMode) {
            // In ML sorted mode, navigate through pairs by score
            if (this.isSortedByPrediction) {
                const maxPairIndex = Math.floor(this.mediaFiles.length / 2) - 1;
                this.mlComparePairIndex = Math.min(this.mlComparePairIndex + 1, maxPairIndex);
            } else {
                // Regular mode: skip by 2
                this.currentIndex = this.currentIndex + 2;
                if (this.currentIndex >= this.mediaFiles.length - 1) {
                    this.currentIndex = 0;
                }
            }
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.mediaFiles.length;
        }
        this.showMedia();
    }

    previousMedia() {
        if (this.mediaFiles.length === 0 || this.isLoading || this.mediaNavigationInProgress) return;

        this.signalUserActivity();

        if (this.isCompareMode) {
            // In ML sorted mode, navigate through pairs by score
            if (this.isSortedByPrediction) {
                this.mlComparePairIndex = Math.max(this.mlComparePairIndex - 1, 0);
            } else {
                // Regular mode: skip by 2
                this.currentIndex = this.currentIndex - 2;
                if (this.currentIndex < 0) {
                    this.currentIndex = Math.max(0, this.mediaFiles.length - 2);
                }
            }
        } else {
            this.currentIndex = (this.currentIndex - 1 + this.mediaFiles.length) % this.mediaFiles.length;
        }
        this.showMedia();
    }

    toggleHelp() {
        const helpOverlay = document.getElementById('helpOverlay');
        if (helpOverlay.classList.contains('show')) {
            helpOverlay.classList.remove('show');
            // Re-enable body scrolling
            document.body.style.overflow = '';
        } else {
            helpOverlay.classList.add('show');
            // Prevent body scrolling when overlay is open
            document.body.style.overflow = 'hidden';
        }
    }

    async moveCurrentFile(actionType) {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        if (!this.areFoldersConfigured()) {
            this.showNotification('Configure like/dislike folders in Settings (F1)', 'error');
            return;
        }

        const currentFile = this.mediaFiles[this.currentIndex];
        const targetFolderPath = actionType === 'like' ? this.customLikeFolder : this.customDislikeFolder;
        const targetFolderName = window.electronAPI.path.basename(targetFolderPath);

        // Extract ML features BEFORE moving file (while media is still accessible)
        let mlFeatures = null;
        if (this.isMlEnabled && this.mlWorker) {
            let rawFeatures = this.featureCache.get(currentFile.path);
            if (!rawFeatures && this.currentMedia) {
                try {
                    rawFeatures = await this.extractFeaturesFromDisplayedMedia();
                    if (rawFeatures) {
                        this.featureCache.set(currentFile.path, rawFeatures);
                        const ratingFileInfo = this.mediaFiles.find((f) => f.path === currentFile.path);
                        if (ratingFileInfo) {
                            this.featureMetadata.set(currentFile.path, {
                                size: ratingFileInfo.size,
                                mtime: ratingFileInfo.mtimeMs || 0,
                            });
                        }
                    }
                } catch (err) {
                    console.warn('Could not extract ML features:', err);
                }
            }
            // Use combined features (64-dim basic + 512-dim CLIP) for ML pipeline
            const combined = this.getCombinedFeatures(currentFile.path);
            mlFeatures = combined || (rawFeatures ? Array.from(rawFeatures) : null);
        }

        try {
            // For videos, ensure proper cleanup before moving
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                await this.forceVideoCleanup();
                // Additional wait for file handles to be fully released
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            const folderExists = await window.electronAPI.checkFolderExists(targetFolderPath);

            if (!folderExists) {
                const shouldCreate = await this.showFolderCreationDialog(targetFolderPath);
                if (!shouldCreate) return;

                const createResult = await window.electronAPI.createFolder(targetFolderPath);
                if (!createResult.success) {
                    throw new Error(createResult.error);
                }
            }

            // Move the file
            const moveResult = await window.electronAPI.moveFile({
                sourcePath: currentFile.path,
                targetFolder: targetFolderPath,
                fileName: currentFile.name,
            });

            if (!moveResult.success) {
                throw new Error(moveResult.error);
            }

            // Store move in history for undo functionality (include ML features for reversal)
            this.moveHistory.push({
                fileName: currentFile.name,
                originalPath: currentFile.path,
                newPath: moveResult.targetPath,
                fileSize: currentFile.size,
                fileType: currentFile.type,
                actionType: actionType,
                mlFeatures: mlFeatures ? Array.from(mlFeatures) : null,
            });

            // Show success notification (if enabled)
            if (this.showRatingConfirmations) {
                const fileName =
                    currentFile.name.length > 20 ? currentFile.name.substring(0, 20) + '...' : currentFile.name;
                this.showNotification(
                    `${actionType === 'like' ? '👍' : '👎'} Moved ${fileName} to ${targetFolderName}`,
                    actionType === 'like' ? 'success' : 'dislike'
                );
            }

            // Update ML model with this rating (using pre-extracted features)
            if (mlFeatures) {
                this.updateMlModelWithFeatures(mlFeatures, actionType);
            }

            // Remove current file from array and clean up caches
            this.removeFileFromList(currentFile.path);

            // Wrap to start when rating the last file (intentional UX: cycle through all files)
            if (this.mediaFiles.length > 0 && this.currentIndex >= this.mediaFiles.length) {
                this.currentIndex = 0;
            }

            this.updateFolderInfo();
            this.showMedia();
        } catch (error) {
            console.error('Error moving file:', error);
            this.showError(`Failed to move file: ${error.message}`);
        }
    }

    async moveToSpecialFolder(side = null) {
        // Check if special folder is configured
        if (!this.customSpecialFolder) {
            this.showNotification('Configure special folder in Settings (F1)', 'error');
            return;
        }

        if (this.isLoading) return;
        this.signalUserActivity();

        // Determine which file to move based on mode and side
        let fileToMove;
        let fileIndex;
        let remainingFile = null;
        let remainingFileIndex = null;

        if (side === 'left' || side === 'right') {
            // Compare mode - use stored file references (set by showCompareMedia)
            if (this.mediaFiles.length < 2) return;

            const leftFile = this.compareLeftFile;
            const rightFile = this.compareRightFile;

            if (!leftFile || !rightFile) return;

            // Get the file to move and the remaining file
            fileToMove = side === 'left' ? leftFile : rightFile;
            remainingFile = side === 'left' ? rightFile : leftFile;

            // Find actual indices in the array
            fileIndex = this.mediaFiles.findIndex((f) => f.path === fileToMove.path);
            remainingFileIndex = this.mediaFiles.findIndex((f) => f.path === remainingFile.path);

            if (fileIndex === -1) return;

            // Cleanup both media before moving
            const cleanupPromises = [];
            if (this.leftMedia) {
                cleanupPromises.push(this.cleanupCompareMedia('left'));
            }
            if (this.rightMedia) {
                cleanupPromises.push(this.cleanupCompareMedia('right'));
            }
            await Promise.all(cleanupPromises);
            await new Promise((resolve) => setTimeout(resolve, 50));
        } else {
            // Single mode
            if (this.mediaFiles.length === 0) return;
            fileIndex = this.currentIndex;
            fileToMove = this.mediaFiles[fileIndex];

            // For videos, ensure proper cleanup before moving
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                await this.forceVideoCleanup();
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }

        if (!fileToMove) return;

        const targetFolderPath = this.customSpecialFolder;
        const targetFolderName = window.electronAPI.path.basename(targetFolderPath);

        // Extract ML features BEFORE moving file (while media is still accessible).
        // Captured into history so undo can restore feature caches that
        // removeFileFromList clears below.
        let mlFeatures = null;
        if (this.isMlEnabled && this.mlWorker) {
            const combined = this.getCombinedFeatures(fileToMove.path);
            const rawFeatures = this.featureCache.get(fileToMove.path);
            mlFeatures = combined || (rawFeatures ? Array.from(rawFeatures) : null);
        }

        try {
            const folderExists = await window.electronAPI.checkFolderExists(targetFolderPath);

            if (!folderExists) {
                const shouldCreate = await this.showFolderCreationDialog(targetFolderPath);
                if (!shouldCreate) return;

                const createResult = await window.electronAPI.createFolder(targetFolderPath);
                if (!createResult.success) {
                    throw new Error(createResult.error);
                }
            }

            // Move the file
            const moveResult = await window.electronAPI.moveFile({
                sourcePath: fileToMove.path,
                targetFolder: targetFolderPath,
                fileName: fileToMove.name,
            });

            if (!moveResult.success) {
                throw new Error(moveResult.error);
            }

            // Store move in history for undo functionality
            const historyEntry = {
                fileName: fileToMove.name,
                originalPath: fileToMove.path,
                newPath: moveResult.targetPath,
                fileSize: fileToMove.size,
                fileType: fileToMove.type,
                actionType: 'special',
                mlFeatures: mlFeatures ? Array.from(mlFeatures) : null,
            };

            // In compare mode, store remaining file info for proper undo
            if (side === 'left' || side === 'right') {
                historyEntry.compareMode = true;
                historyEntry.remainingFile = remainingFile;
                historyEntry.remainingFileOriginalIndex =
                    remainingFileIndex > fileIndex
                        ? remainingFileIndex - 1 // Adjust for the removed file
                        : remainingFileIndex;
            }

            this.moveHistory.push(historyEntry);

            // Show success notification
            if (this.showRatingConfirmations) {
                const fileName =
                    fileToMove.name.length > 20 ? fileToMove.name.substring(0, 20) + '...' : fileToMove.name;
                this.showNotification(`📁 Moved ${fileName} to ${targetFolderName}`, 'info');
            }

            // Remove file from array and clean up caches
            this.removeFileFromList(fileToMove.path);

            // Tournament mode: also remove from engine + persist before navigation
            if (this.isTournamentMode && this.tournament.engine) {
                this.tournament.engine.removeFile(fileToMove.path);
                this.tournament._schedulePersist(this.baseFolderPath);
            }

            // In compare mode, move the remaining file to the end of the list
            if (side === 'left' || side === 'right') {
                if (remainingFile && this.mediaFiles.length >= 1) {
                    const newRemainingIndex = this.mediaFiles.findIndex((f) => f.path === remainingFile.path);
                    if (newRemainingIndex !== -1 && newRemainingIndex !== this.mediaFiles.length - 1) {
                        const [movedFile] = this.mediaFiles.splice(newRemainingIndex, 1);
                        this.mediaFiles.push(movedFile);
                    }
                }
                // Reset current index to start of list for next pair
                this.currentIndex = 0;
            }

            this.updateFolderInfo();

            // Tournament mode: re-render via engine, skip compare/single navigation logic
            if (this.isTournamentMode) {
                await this.showTournamentPair();
                return;
            }

            // Navigate based on mode
            if (side === 'left' || side === 'right') {
                // In compare mode, show next pair
                if (this.mediaFiles.length >= 2) {
                    this.showMedia();
                } else if (this.mediaFiles.length === 1) {
                    // Only one file left, switch to single mode
                    this.switchToSingleModeUI();
                    this.showNotification('Last file in compare mode — switched to single view', 'info');
                    this.currentIndex = 0;
                    await this.showMedia();
                } else {
                    // No files left — preserve undo
                    if (this.moveHistory.length > 0) {
                        this.switchToSingleModeUI();
                        this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                        this.showEmptyStateWithUndo();
                    } else {
                        this.showDropZone();
                    }
                }
            } else {
                // Single mode - show next media
                if (this.mediaFiles.length > 0) {
                    this.showMedia();
                } else if (this.moveHistory.length > 0) {
                    this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                    this.showEmptyStateWithUndo();
                } else {
                    this.showDropZone();
                }
            }
        } catch (error) {
            console.error('Error moving file to special folder:', error);
            this.showError(`Failed to move file: ${error.message}`);
        }
    }

    // New method for thorough video cleanup before file operations
    async forceVideoCleanup() {
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO') return;

        this.isBeingCleaned = true;

        // Remove all event listeners first
        this.videoEventListeners.forEach(({ event, handler }) => {
            this.currentMedia.removeEventListener(event, handler);
        });
        this.videoEventListeners = [];

        // Aggressively clean up video
        const video = this.currentMedia;
        video.pause();
        video.currentTime = 0;
        video.removeAttribute('src');
        video.load();

        // Wait for cleanup to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Remove from DOM
        if (video.parentNode) {
            video.remove();
        }

        this.currentMedia = null;
        this.isBeingCleaned = false;

        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }

    setupEventListeners() {
        this.dropZone.addEventListener('click', () => this.openFolderDialog());

        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            this.handleFolderDrop(e);
        });

        this.likeBtn.addEventListener('click', () => this.handleLike());
        this.dislikeBtn.addEventListener('click', () => this.handleDislike());
        this.cancelBtn.addEventListener('click', () => this.handleCancel());
        if (this.specialBtn) {
            this.specialBtn.addEventListener('click', () => this.moveToSpecialFolder());
        }

        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.progressSlider.addEventListener('input', (e) => this.seekVideo(e.target.value));
        this.skipBackwardBtn.addEventListener('click', () => this.skipVideo(-10));
        this.skipForwardBtn.addEventListener('click', () => this.skipVideo(10));

        this.navPrev.addEventListener('click', () => this.previousMedia());
        this.navNext.addEventListener('click', () => this.nextMedia());
        if (this.changeFolderBtn) {
            this.changeFolderBtn.addEventListener('click', async () => {
                const folderPath = await window.electronAPI.openFolderDialog();
                if (folderPath && folderPath !== this.baseFolderPath) {
                    await this.cleanupCurrentMedia();
                    this.mediaFiles = [];
                    this.currentIndex = 0;
                    this.currentMedia = null;
                    this.currentFolderPath = '';
                    this.baseFolderPath = '';
                    this.moveHistory = [];
                    this.isLoading = false;
                    this.isVideoLoading = false;
                    this.videoEventListeners = [];
                    this.mediaNavigationInProgress = false;
                    this.isBeingCleaned = false;
                    // Reset sorting state
                    this.isSortedBySimilarity = false;
                    this.originalMediaFiles = [];
                    this.perceptualHashes.clear();
                    if (this.sortSimilarityBtn) {
                        this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Sort by Similarity';
                    }
                    this.hideDropZone();
                    await this.loadFolder(folderPath);
                }
            });
        }

        // Info toggle button click to show/hide file info panel
        if (this.infoToggleBtn) {
            this.infoToggleBtn.addEventListener('click', () => this.toggleFileInfo());
        }

        // File info close button
        if (this.fileInfoClose) {
            this.fileInfoClose.addEventListener('click', () => this.hideFileInfo());
        }

        // Filename click to copy
        if (this.fileName) {
            this.fileName.style.cursor = 'pointer';
            this.fileName.addEventListener('click', async () => {
                if (this.mediaFiles.length > 0 && this.currentIndex < this.mediaFiles.length) {
                    const currentFile = this.mediaFiles[this.currentIndex];
                    try {
                        await navigator.clipboard.writeText(currentFile.name);
                        this.showNotification('📋 Filename copied!', 'success');
                    } catch (error) {
                        console.error('Failed to copy filename:', error);
                        this.showNotification('Failed to copy filename', 'error');
                    }
                }
            });
        }

        // Left file info toggle click to copy filename
        if (this.leftFileInfoToggle) {
            this.leftFileInfoToggle.addEventListener('click', async () => {
                // Use stored file reference (works for both AI-sorted and regular mode)
                const leftFile = this.compareLeftFile;
                if (leftFile) {
                    try {
                        await navigator.clipboard.writeText(leftFile.name);
                        this.showNotification('📋 Left filename copied!', 'success');
                    } catch (error) {
                        console.error('Failed to copy filename:', error);
                        this.showNotification('Failed to copy filename', 'error');
                    }
                }
            });
        }

        // Right file info toggle click to copy filename
        if (this.rightFileInfoToggle) {
            this.rightFileInfoToggle.addEventListener('click', async () => {
                // Use stored file reference (works for both AI-sorted and regular mode)
                const rightFile = this.compareRightFile;
                if (rightFile) {
                    try {
                        await navigator.clipboard.writeText(rightFile.name);
                        this.showNotification('📋 Right filename copied!', 'success');
                    } catch (error) {
                        console.error('Failed to copy filename:', error);
                        this.showNotification('Failed to copy filename', 'error');
                    }
                }
            });
        }

        // Help button
        if (this.helpBtn) {
            this.helpBtn.addEventListener('click', () => this.toggleHelp());
        }

        // Sort similarity button
        if (this.sortSimilarityBtn) {
            this.sortSimilarityBtn.addEventListener('click', (e) => this.handleSortBySimilarity(e.shiftKey));
        }

        // Sort by prediction button
        if (this.sortPredictionBtn) {
            this.sortPredictionBtn.addEventListener('click', () => this.handleSortByPrediction());
        }

        if (this.sortAlgorithmSelect) {
            this.sortAlgorithmSelect.addEventListener('change', (e) => {
                this.sortAlgorithm = e.target.value;
                localStorage.setItem('sortAlgorithm', e.target.value);
                this.updateSortSettingsVisibility(); // Show/hide K settings
                console.log(`Sorting algorithm changed to: ${e.target.value}`);
            });
        }

        if (this.sortKValueInput) {
            this.sortKValueInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (value >= 10) {
                    localStorage.setItem('sortKValue', value.toString());
                    console.log(`K value changed to: ${value}`);
                } else {
                    // Reset to minimum
                    e.target.value = 10;
                    localStorage.setItem('sortKValue', '10');
                }
            });
        }

        // Help overlay close button
        const helpCloseBtn = document.getElementById('helpCloseBtn');
        if (helpCloseBtn) {
            helpCloseBtn.addEventListener('click', () => this.toggleHelp());
        }

        const resetShortcutsBtn = document.getElementById('resetShortcutsBtn');
        if (resetShortcutsBtn) {
            resetShortcutsBtn.addEventListener('click', () => this.resetShortcuts());
        }

        // Close help overlay when clicking on background
        const helpOverlay = document.getElementById('helpOverlay');
        if (helpOverlay) {
            helpOverlay.addEventListener('click', (e) => {
                // Only close if clicking on the overlay itself, not the content
                if (e.target === helpOverlay) {
                    this.toggleHelp();
                }
            });
        }

        // Settings toggle for rating confirmations
        const ratingConfirmToggle = document.getElementById('showRatingConfirmationsToggle');
        if (ratingConfirmToggle) {
            ratingConfirmToggle.checked = this.showRatingConfirmations;
            ratingConfirmToggle.addEventListener('change', (e) => {
                this.showRatingConfirmations = e.target.checked;
                localStorage.setItem('showRatingConfirmations', e.target.checked.toString());
            });
        }

        // Settings toggle for auto-close errors
        const autoCloseErrorsToggle = document.getElementById('autoCloseErrorsToggle');
        if (autoCloseErrorsToggle) {
            autoCloseErrorsToggle.checked = this.autoCloseErrors;
            autoCloseErrorsToggle.addEventListener('change', (e) => {
                this.autoCloseErrors = e.target.checked;
                localStorage.setItem('autoCloseErrors', e.target.checked.toString());
            });
        }

        // Settings toggle for ML prediction
        const mlPredictionToggle = document.getElementById('mlPredictionToggle');
        if (mlPredictionToggle) {
            mlPredictionToggle.checked = this.isMlEnabled;
            mlPredictionToggle.addEventListener('change', (e) => {
                this.isMlEnabled = e.target.checked;
                localStorage.setItem('mlPredictionEnabled', e.target.checked.toString());
                if (this.isMlEnabled && !this.mlWorker) {
                    this.initializeMlWorker();
                }
                this.updateSortPredictionButton();
                if (!this.isMlEnabled) {
                    this.hidePredictionBadges();
                }
            });
        }

        // Settings toggle for prediction badges
        const showPredictionBadgesToggle = document.getElementById('showPredictionBadgesToggle');
        if (showPredictionBadgesToggle) {
            showPredictionBadgesToggle.checked = this.showPredictionBadges;
            showPredictionBadgesToggle.addEventListener('change', (e) => {
                this.showPredictionBadges = e.target.checked;
                localStorage.setItem('showPredictionBadges', e.target.checked.toString());
                if (this.showPredictionBadges) {
                    this.updatePredictionBadges();
                } else {
                    this.hidePredictionBadges();
                }
            });
        }

        // Feature extraction worker count setting
        const workerCountInput = document.getElementById('featureWorkerCountInput');
        if (workerCountInput) {
            workerCountInput.value = this.featureWorkerCount;
            workerCountInput.addEventListener('change', (e) => {
                let value = parseInt(e.target.value, 10);
                if (isNaN(value) || value < 1) value = 1;
                if (value > 8) value = 8;
                e.target.value = value;
                this.featureWorkerCount = value;
                localStorage.setItem('featureWorkerCount', value.toString());
            });
        }

        // Settings toggle for CLIP features
        const clipToggle = document.getElementById('clipFeaturesToggle');
        if (clipToggle) {
            clipToggle.checked = this.enableClipFeatures;
            clipToggle.addEventListener('change', async () => {
                this.enableClipFeatures = clipToggle.checked;
                localStorage.setItem('enableClipFeatures', String(clipToggle.checked));
                this.resetMlModel();

                if (!clipToggle.checked) {
                    // Cancel any pending 30s CLIP unload — Group E pattern (d65bfdd)
                    // requires every code path that changes CLIP state to clear the timer.
                    if (this.clipUnloadTimer !== null) {
                        clearTimeout(this.clipUnloadTimer);
                        this.clipUnloadTimer = null;
                    }
                    // Revert sortAlgorithm + dropdown synchronously first so the UI reflects
                    // the new state instantly (no transient where dropdown shows CLIP but
                    // CLIP is disabled). Then await the cache deletion IPC.
                    if (this.sortAlgorithm === 'clip') {
                        this.sortAlgorithm = 'vptree';
                        localStorage.setItem('sortAlgorithm', 'vptree');
                        if (this.sortAlgorithmSelect) {
                            this.sortAlgorithmSelect.value = 'vptree';
                        }
                    }
                    // Persisted 'clip' sort cache may now reference files without vectors
                    // or vectors from a model version that won't load again — drop it.
                    try {
                        await this.deleteSortCache('clip');
                    } catch (_e) {
                        // Best-effort cleanup — deleteSortCache already shows a notification
                        // on failure. Explicit catch makes the contract obvious.
                    }
                }
                // Toggle-on is intentionally lazy (Group P3): enabling CLIP only advertises the
                // capability; vectors are produced on first use of an AI feature, not on toggle.
            });
        }

        // Folder settings
        this.setupFolderSettings();

        // 3-way mode selector (Single/Compare/Tournament)
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                this.switchMode(btn.dataset.mode);
            });
        });

        // Tournament control row buttons
        const tournamentUndoBtn = document.getElementById('tournamentUndoBtn');
        if (tournamentUndoBtn) {
            tournamentUndoBtn.addEventListener('click', () => this.handleTournamentUndo());
        }
        const tournamentBothWinBtn = document.getElementById('tournamentBothWinBtn');
        if (tournamentBothWinBtn) {
            tournamentBothWinBtn.addEventListener('click', () => this.handleTournamentDraw('win'));
        }
        const tournamentBothLoseBtn = document.getElementById('tournamentBothLoseBtn');
        if (tournamentBothLoseBtn) {
            tournamentBothLoseBtn.addEventListener('click', () => this.handleTournamentDraw('lose'));
        }
        const tournamentExitBtn = document.getElementById('tournamentExitBtn');
        if (tournamentExitBtn) {
            tournamentExitBtn.addEventListener('click', () => this.switchMode('single'));
        }

        // App-close confirm: main asks before quitting with a tournament in progress.
        if (window.electronAPI.onAppCloseRequested) {
            window.electronAPI.onAppCloseRequested(() => this.handleAppCloseRequest());
        }

        // Compare-mode floating Undo button
        this.compareUndoBtn = document.getElementById('compareUndoBtn');
        if (this.compareUndoBtn) {
            this.compareUndoBtn.addEventListener('click', () => this.handleCancel());
        }

        // Compare mode event listeners (legacy viewModeBtn kept for backward-compat — hidden in UI)
        if (this.viewModeBtn) {
            this.viewModeBtn.addEventListener('click', () => this.toggleViewMode());
        }
        if (this.leftLikeBtn) {
            this.leftLikeBtn.addEventListener('click', () => this.handleLeftLike());
        }
        if (this.leftDislikeBtn) {
            this.leftDislikeBtn.addEventListener('click', () => this.handleLeftDislike());
        }
        if (this.rightLikeBtn) {
            this.rightLikeBtn.addEventListener('click', () => this.handleRightLike());
        }
        if (this.rightDislikeBtn) {
            this.rightDislikeBtn.addEventListener('click', () => this.handleRightDislike());
        }
        if (this.cancelBtnCompare) {
            this.cancelBtnCompare.addEventListener('click', () => this.handleCancel());
        }
        if (this.leftSpecialBtn) {
            this.leftSpecialBtn.addEventListener('click', () => this.moveToSpecialFolder('left'));
        }
        if (this.rightSpecialBtn) {
            this.rightSpecialBtn.addEventListener('click', () => this.moveToSpecialFolder('right'));
        }
        if (this.bothGoodBtn) {
            this.bothGoodBtn.addEventListener('click', () => this.handleBothGood());
        }
        if (this.bothBadBtn) {
            this.bothBadBtn.addEventListener('click', () => this.handleBothBad());
        }

        document.addEventListener('keydown', (e) => {
            if (this.mediaFiles.length === 0) {
                // Allow undo shortcut even when no media remains
                const mode = this.isTournamentMode ? 'tournament' : this.isCompareMode ? 'compare' : 'single';
                const keyStr = this.buildKeyString(e);
                const action = this.shortcutReverseMap[mode]?.[keyStr];
                if (action === 'undo' && this.moveHistory.length > 0) {
                    e.preventDefault();
                    this.executeAction('undo');
                }
                return;
            }

            // Fixed utility shortcuts (not customizable)
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.leftMediaWrapper && this.leftMediaWrapper.classList.contains('fullscreen')) {
                    this.fullscreen.cleanup(this.leftMediaWrapper);
                }
                if (this.rightMediaWrapper && this.rightMediaWrapper.classList.contains('fullscreen')) {
                    this.fullscreen.cleanup(this.rightMediaWrapper);
                }
                if (this.isZoomed()) {
                    this.resetZoom('all');
                    return;
                }
                // Tournament: Escape pauses (exits to single mode, state preserved)
                if (this.isTournamentMode) {
                    this.switchMode('single');
                    return;
                }
                return;
            }

            if (e.key === 'F1') {
                e.preventDefault();
                this.toggleHelp();
                return;
            }

            if (!this.isCompareMode) {
                // Single mode fixed utilities
                if (e.key === ' ') {
                    e.preventDefault();
                    if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                        this.togglePlayPause();
                    }
                    return;
                }
                if (e.code === 'KeyI') {
                    e.preventDefault();
                    this.toggleFileInfo();
                    return;
                }
            } else {
                // Compare mode fixed utilities
                if (e.code === 'KeyZ') {
                    e.preventDefault();
                    if (this.leftMediaWrapper) {
                        this.fullscreen.toggle(this.leftMediaWrapper);
                    }
                    return;
                }
                if (e.code === 'KeyX') {
                    e.preventDefault();
                    if (this.rightMediaWrapper) {
                        this.fullscreen.toggle(this.rightMediaWrapper);
                    }
                    return;
                }
            }

            // Customizable shortcuts via reverse map lookup
            const mode = this.isTournamentMode ? 'tournament' : this.isCompareMode ? 'compare' : 'single';
            const keyStr = this.buildKeyString(e);
            const action = this.shortcutReverseMap[mode]?.[keyStr];
            if (action && !this.isLoading) {
                e.preventDefault();
                this.signalUserActivity();
                this.executeAction(action);
            }
        });

        // Global pan event listeners for zoom
        document.addEventListener('mousemove', (e) => {
            this.handlePanMove(e);
        });

        document.addEventListener('mouseup', () => {
            this.handlePanEnd();
        });

        // Mouse wheel navigation (or zoom when over media)
        document.addEventListener(
            'wheel',
            (e) => {
                // Don't navigate if help overlay is open
                const helpOverlayEl = document.getElementById('helpOverlay');
                if (helpOverlayEl && helpOverlayEl.classList.contains('show')) return;

                if (this.mediaFiles.length === 0 || this.isLoading || this.mediaNavigationInProgress) return;

                // Check if wheel event is over a media element - handle zoom instead of navigation
                const target = e.target;
                const isOverMedia = target.classList.contains('media-display') || target.closest('.media-wrapper');

                if (isOverMedia) {
                    // Zoom is handled by the element's own wheel listener
                    // Let it propagate to the element
                    return;
                }

                // Not over media - proceed with navigation
                // Prevent default scrolling behavior
                e.preventDefault();

                // Debounce wheel events
                if (this.wheelTimeout) return;

                this.wheelTimeout = setTimeout(() => {
                    this.wheelTimeout = null;
                }, 300);

                // Navigate based on wheel direction
                if (e.deltaY > 0) {
                    // Scrolling down - next media
                    this.nextMedia();
                } else if (e.deltaY < 0) {
                    // Scrolling up - previous media
                    this.previousMedia();
                }
            },
            { passive: false }
        );
    }

    setupHeaderVisibility() {
        let headerTimeout;

        const showHeader = () => {
            this.header.classList.add('show');
            clearTimeout(headerTimeout);
            headerTimeout = setTimeout(() => {
                this.header.classList.remove('show');
            }, 3000);
        };

        const hideHeader = () => {
            clearTimeout(headerTimeout);
            this.header.classList.remove('show');
        };

        this.header.addEventListener('mouseenter', showHeader);
        this.header.addEventListener('mouseleave', hideHeader);

        document.addEventListener('mousemove', (e) => {
            if (e.clientY < 50) {
                showHeader();
            }
        });
    }

    setupFileInfoVisibility() {
        // File info is now click-based, no hover logic needed
        // Panel visibility is controlled by toggleFileInfo() and hideFileInfo()
    }

    toggleFileInfo() {
        if (this.fileInfo.classList.contains('show')) {
            this.hideFileInfo();
        } else {
            this.showFileInfo();
        }
    }

    showFileInfo() {
        this.fileInfo.style.display = 'block';
        // Small delay to allow display:block to take effect before adding show class
        requestAnimationFrame(() => {
            this.fileInfo.classList.add('show');
        });
        if (this.infoToggleBtn) {
            this.infoToggleBtn.classList.add('active');
        }
    }

    hideFileInfo() {
        this.fileInfo.classList.remove('show');
        if (this.infoToggleBtn) {
            this.infoToggleBtn.classList.remove('active');
        }
        // Hide after transition completes
        setTimeout(() => {
            if (!this.fileInfo.classList.contains('show')) {
                this.fileInfo.style.display = 'none';
            }
        }, 300);
    }

    setupControlsVisibility() {
        let controlsTimeout;
        let videoControlsTimeout;
        let isHoveringControl = false;

        const showControls = () => {
            this.controls.classList.add('show');
            this.navInfo.classList.add('show');
            this.navPrev.classList.add('show');
            this.navNext.classList.add('show');
            if (this.videoControls.style.display === 'flex') {
                this.videoControls.classList.add('show');
            }
            clearTimeout(controlsTimeout);
            clearTimeout(videoControlsTimeout);
        };

        const hideControls = () => {
            controlsTimeout = setTimeout(() => {
                this.controls.classList.remove('show');
                this.navInfo.classList.remove('show');
                this.navPrev.classList.remove('show');
                this.navNext.classList.remove('show');
            }, 300);

            videoControlsTimeout = setTimeout(() => {
                this.videoControls.classList.remove('show');
            }, 300);
        };

        document.addEventListener('mousemove', () => {
            if (this.mediaFiles.length > 0) {
                showControls();
                clearTimeout(controlsTimeout);
                clearTimeout(videoControlsTimeout);

                // Only set timeout to hide if mouse is not hovering over controls
                if (!isHoveringControl) {
                    controlsTimeout = setTimeout(() => {
                        this.controls.classList.remove('show');
                        this.navInfo.classList.remove('show');
                        this.navPrev.classList.remove('show');
                        this.navNext.classList.remove('show');
                        this.videoControls.classList.remove('show');
                    }, 2000);
                }
            }
        });

        [this.controls, this.videoControls, this.navInfo, this.navPrev, this.navNext].forEach((element) => {
            element.addEventListener('mouseenter', () => {
                isHoveringControl = true;
                clearTimeout(controlsTimeout);
                clearTimeout(videoControlsTimeout);
                showControls();
            });

            element.addEventListener('mouseleave', () => {
                isHoveringControl = false;
                hideControls();
            });
        });
    }

    // Logarithmic mapping for zoom slider: 0-100 → scale 1-8
    sliderToScale(value) {
        const normalized = value / 100;
        return Math.exp(Math.log(this.minZoom) + normalized * (Math.log(this.maxZoom) - Math.log(this.minZoom)));
    }

    scaleToSlider(scale) {
        const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
        return ((Math.log(clamped) - Math.log(this.minZoom)) / (Math.log(this.maxZoom) - Math.log(this.minZoom))) * 100;
    }

    setupZoomPopovers() {
        // Only set up the single-mode zoom (static HTML button)
        // Compare-mode zoom buttons are added dynamically in addMediaOverlayControls
        const wrapper = document.getElementById('zoomBtnWrapper');
        const toggleBtn = document.getElementById('zoomToggleBtn');
        if (wrapper && toggleBtn) {
            this.createZoomPopover('single', wrapper, toggleBtn);
        }

        // Close popovers on outside click
        document.addEventListener('click', () => this.closeAllZoomPopovers());
    }

    createZoomPopover(target, wrapper, toggleBtn) {
        // Build popover DOM: [-] [slider] [+] [100%]
        const popover = document.createElement('div');
        popover.className = 'zoom-popover';

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.className = 'zoom-pop-btn';
        zoomOutBtn.title = 'Zoom out';
        zoomOutBtn.innerHTML = '<i data-lucide="minus"></i>';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'zoom-slider';
        slider.min = '0';
        slider.max = '100';
        slider.value = '0';
        slider.step = '1';
        slider.title = 'Zoom level';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.className = 'zoom-pop-btn';
        zoomInBtn.title = 'Zoom in';
        zoomInBtn.innerHTML = '<i data-lucide="plus"></i>';

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'zoom-value';
        valueDisplay.textContent = '100%';

        popover.appendChild(zoomOutBtn);
        popover.appendChild(slider);
        popover.appendChild(zoomInBtn);
        popover.appendChild(valueDisplay);

        wrapper.appendChild(popover);

        // Store references
        const zoomAbort = new AbortController();
        this.zoomControlsMap[target] = {
            container: popover,
            slider,
            zoomInBtn,
            zoomOutBtn,
            valueDisplay,
            toggleBtn,
            isSliderDragging: false,
            abortController: zoomAbort,
        };

        // Toggle popover on button click
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = popover.classList.contains('show');
            this.closeAllZoomPopovers();
            if (!isOpen) popover.classList.add('show');
        });

        // Zoom center helper
        const zoomCenter = () => {
            const element = this.getMediaElement(target);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };

        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const state = this.zoomState[target];
            const newScale = Math.min(this.maxZoom, state.scale * this.zoomFactor);
            const center = zoomCenter();
            if (center) this.zoomAtPoint(target, newScale, center.x, center.y);
        });

        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const state = this.zoomState[target];
            const newScale = Math.max(this.minZoom, state.scale / this.zoomFactor);
            if (newScale <= this.minZoom) {
                this.resetZoom(target);
            } else {
                const center = zoomCenter();
                if (center) this.zoomAtPoint(target, newScale, center.x, center.y);
            }
        });

        slider.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.zoomControlsMap[target].isSliderDragging = true;
        });
        slider.addEventListener('input', (e) => {
            const newScale = this.sliderToScale(parseFloat(e.target.value));
            if (newScale <= this.minZoom + 0.01) {
                this.resetZoom(target);
            } else {
                const center = zoomCenter();
                if (center) this.zoomAtPoint(target, newScale, center.x, center.y);
            }
        });
        document.addEventListener(
            'mouseup',
            () => {
                if (this.zoomControlsMap[target]) {
                    this.zoomControlsMap[target].isSliderDragging = false;
                }
            },
            { signal: zoomAbort.signal }
        );

        // Prevent popover clicks from closing via document handler
        popover.addEventListener('mousedown', (e) => e.stopPropagation());
        popover.addEventListener('click', (e) => e.stopPropagation());

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: popover });
        }
    }

    removeZoomPopover(target) {
        const entry = this.zoomControlsMap[target];
        if (!entry) return;
        if (entry.abortController) entry.abortController.abort();
        if (entry.container.parentNode) entry.container.remove();
        if (entry.toggleBtn && entry.toggleBtn.parentNode) entry.toggleBtn.parentNode.remove();
        delete this.zoomControlsMap[target];
    }

    closeAllZoomPopovers() {
        for (const entry of Object.values(this.zoomControlsMap)) {
            entry.container.classList.remove('show');
        }
    }

    async openFolderDialog() {
        if (!window.electronAPI) {
            this.showError('Electron API not available');
            return;
        }

        try {
            console.log('Opening folder dialog...');
            const folderPath = await window.electronAPI.openFolderDialog();
            console.log('Selected folder:', folderPath);

            if (folderPath) {
                await this.loadFolder(folderPath);
            }
        } catch (error) {
            console.error('Error opening folder:', error);
            this.showError(`Failed to open folder dialog: ${error.message}`);
        }
    }

    async handleFolderDrop(event) {
        event.preventDefault();
        this.dropZone.classList.remove('dragover');

        const items = Array.from(event.dataTransfer.files);
        console.log('Dropped items:', items);

        if (items.length > 0 && items[0].path) {
            const folderPath = items[0].path;
            console.log('Dropped folder path:', folderPath);
            await this.loadFolder(folderPath);
        } else {
            this.showError('Please drop a folder, not individual files');
        }
    }

    async loadFolder(folderPath) {
        if (!window.electronAPI) {
            this.showError('Electron API not available');
            return;
        }

        try {
            console.log('Loading folder:', folderPath);
            this.showLoadingSpinner();

            const result = await window.electronAPI.loadFolder(folderPath);
            console.log('Load result:', result);

            this.hideLoadingSpinner();

            if (!result.success) {
                this.showDropZone();
                this.showError(result.error || 'Failed to load folder');
                return;
            }

            // Folder switches always exit tournament mode (mode is folder-scoped, mirrors the
            // compare-mode reset pattern from 2fbe174). Must run BEFORE both branches diverge
            // so the empty-folder path also clears tournament UI state.
            if (this.isTournamentMode) this.exitTournamentMode();

            if (result.files.length === 0) {
                this.mediaFiles = [];
                this.baseFolderPath = folderPath;
                this.currentFolderPath = window.electronAPI.path.basename(folderPath);
                this.currentIndex = 0;
                this.moveHistory = [];
                this.tournament.engine = null;
                this.showDropZone();
                this.showError('No media files found in the selected folder');
                return;
            }

            this.mediaFiles = result.files;
            this.baseFolderPath = folderPath;
            this.currentFolderPath = window.electronAPI.path.basename(folderPath);
            this.currentIndex = 0;
            this.moveHistory = [];

            // A saved tournament in this folder is offered when the user enters Tournament mode
            // (see enterTournamentMode), not on folder open. Drop any stale in-memory engine so
            // switching folders never carries a previous folder's tournament across.
            this.tournament.engine = null;
            // Reset sorting state when loading new folder
            this.isSortedBySimilarity = false;
            this.isSortedByPrediction = false;
            this.originalMediaFiles = [];
            this.perceptualHashes.clear();
            this.featureCache.clear();
            this.clipCache.clear();
            this.featureMetadata.clear();
            this.predictionScores.clear();
            // Cancel any ongoing background extraction
            this.cancelBackgroundExtraction();
            // Hydrate corrective-training records for this folder (prunes stale filenames)
            await this.loadBulkRatedFile();
            if (this.sortSimilarityBtn) {
                this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Sort by Similarity';
            }
            this.switchToSingleModeUI();
            this.hideDropZone();
            await this.showMedia();
            this.updateFolderInfo();

            // Lazy extraction (Group P3): feature/CLIP vectors are produced on first use of an
            // AI feature (CLIP sort / Sort by Prediction), not on folder open — keeps large
            // folders responsive. See docs/superpowers/specs/2026-06-25-extraction-timing-design.md.
            console.log(`Successfully loaded ${this.mediaFiles.length} media files`);

            // Update ML button state (actual initialization happens when user clicks the button)
            this.updateSortPredictionButton();
        } catch (error) {
            this.hideLoadingSpinner();
            this.showDropZone();
            console.error('Error loading folder:', error);
            this.showError(`Failed to load folder: ${error.message}`);
        }
    }

    hideDropZone() {
        this.dropZone.style.display = 'none';
        this.controls.style.display = 'flex';
        this.fileInfo.style.display = 'block';
        this.navInfo.style.display = 'block';
        // Show change folder button when media is shown
        if (this.changeFolderBtn) {
            this.changeFolderBtn.style.display = 'inline-flex';
        }
        // Show the 3-way mode selector when media is shown
        // (legacy #viewModeBtn stays hidden — kept only for backward-compat code refs)
        const modeSelector = document.getElementById('modeSelector');
        if (modeSelector) {
            modeSelector.style.display = 'inline-flex';
        }
        // Show help button when media is shown
        if (this.helpBtn) {
            this.helpBtn.style.display = 'inline-flex';
        }
        // Show info toggle button when media is shown (only in single mode)
        if (this.infoToggleBtn && !this.isCompareMode) {
            this.infoToggleBtn.style.display = 'flex';
        }
        // Show sort similarity button when media is shown
        if (this.sortSimilarityBtn) {
            this.sortSimilarityBtn.style.display = 'inline-flex';
        }
        if (this.sortAlgorithmSelect) {
            this.sortAlgorithmSelect.style.display = 'inline-flex';
        }
        // Show/hide K settings based on current algorithm
        this.updateSortSettingsVisibility();
        // Show/hide sort prediction button
        this.updateSortPredictionButton();
    }

    showDropZone() {
        // Remove empty-state undo prompt if present (prevents stale overlay on top of drop zone)
        const emptyState = this.mediaContainer.querySelector('.empty-state-undo');
        if (emptyState) {
            emptyState.remove();
        }
        this.dropZone.style.display = 'flex';
        this.controls.style.display = 'none';
        this.fileInfo.style.display = 'none';
        this.navInfo.style.display = 'none';
        this.videoControls.style.display = 'none';
        // Hide change folder button when drop zone is shown
        if (this.changeFolderBtn) {
            this.changeFolderBtn.style.display = 'none';
        }
        // Hide sort similarity button when drop zone is shown
        if (this.sortSimilarityBtn) {
            this.sortSimilarityBtn.style.display = 'none';
        }
        if (this.sortAlgorithmSelect) {
            this.sortAlgorithmSelect.style.display = 'none';
        }
        if (this.sortSettings) {
            this.sortSettings.style.display = 'none';
        }
        // Hide sort prediction button
        if (this.sortPredictionBtn) {
            this.sortPredictionBtn.style.display = 'none';
        }
        // Hide prediction badges
        this.hidePredictionBadges();
        if (this.currentMedia) {
            this.cleanupCurrentMedia();
        }
        // Tear down compare-mode media so stale wrappers don't survive (e.g. after Tournament Apply moved files into subfolders)
        if (this.leftMediaWrapper) {
            this.fullscreen.cleanup(this.leftMediaWrapper);
            this.leftMediaWrapper.remove();
            this.leftMediaWrapper = null;
            this.leftMedia = null;
        }
        if (this.rightMediaWrapper) {
            this.fullscreen.cleanup(this.rightMediaWrapper);
            this.rightMediaWrapper.remove();
            this.rightMediaWrapper = null;
            this.rightMedia = null;
        }
    }

    showEmptyStateWithUndo() {
        if (this.currentMedia) {
            this.cleanupCurrentMedia();
        }
        this.hideLoadingSpinner();

        // Hide drop zone — this is "folder loaded but empty", not "no folder"
        this.dropZone.style.display = 'none';

        // Remove any existing empty-state element
        const existing = this.mediaContainer.querySelector('.empty-state-undo');
        if (existing) {
            existing.remove();
        }

        // Create empty-state undo prompt
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state-undo';

        const text = document.createElement('div');
        text.className = 'empty-state-undo-text';
        text.textContent = 'No media files remaining';
        emptyState.appendChild(text);

        const undoBtn = document.createElement('button');
        undoBtn.className = 'empty-state-undo-btn';
        undoBtn.textContent = 'Undo last move';
        undoBtn.addEventListener('click', () => this.handleCancel());
        emptyState.appendChild(undoBtn);

        this.mediaContainer.appendChild(emptyState);

        // Show appropriate controls bar with undo button visible
        if (this.isCompareMode) {
            this.compareControls.style.display = 'flex';
            this.controls.style.display = 'none';
        } else {
            this.controls.style.display = 'flex';
            this.compareControls.style.display = 'none';
        }

        this.updateFolderInfo();
        this.updateNavigationInfo();
    }

    // Improved cleanup method
    cleanupCurrentMedia() {
        // Stop any animated-JXL playback first so navigating away never leaks a timer,
        // even if currentMedia is already null (early-return below).
        this.stopJxlAnimation();

        if (!this.currentMedia) return;

        this.isBeingCleaned = true;

        // Remove all video event listeners to prevent errors
        this.videoEventListeners.forEach(({ event, handler }) => {
            this.currentMedia.removeEventListener(event, handler);
        });
        this.videoEventListeners = [];

        if (this.currentMedia.tagName === 'VIDEO') {
            // Properly stop and cleanup video
            this.currentMedia.pause();
            this.currentMedia.currentTime = 0;
            this.currentMedia.removeAttribute('src');
            this.currentMedia.load(); // This is important to release the file handle

            // Remove from DOM
            if (this.currentMedia.parentNode) {
                this.currentMedia.remove();
            }
        } else {
            // For images, immediate removal is fine
            this.currentMedia.remove();
        }

        this.currentMedia = null;
        this.isVideoLoading = false;
        this.mediaNavigationInProgress = false;
        this.isBeingCleaned = false;

        // Release any object URLs created for decoded JXL frames
        this.revokeJxlObjectURLs();
    }

    async showMedia() {
        this.updateCompareUndoButton();
        this.updateBulkRateButtonsVisibility();
        if (this.mediaFiles.length === 0) {
            if (this.moveHistory.length > 0) {
                this.showEmptyStateWithUndo();
            } else {
                this.showDropZone();
            }
            return;
        }

        // Clean up empty-state undo prompt if present
        const emptyState = this.mediaContainer.querySelector('.empty-state-undo');
        if (emptyState) {
            emptyState.remove();
        }

        if (this.isLoading || this.mediaNavigationInProgress) {
            return;
        }

        if (this.isCompareMode) {
            await this.showCompareMedia();
        } else {
            await this.showSingleMedia();
        }
    }

    async showSingleMedia() {
        this.mediaNavigationInProgress = true;
        this.isLoading = true;
        this.showLoadingSpinner();

        // Reset zoom when changing files
        this.resetZoom('single');

        // Properly cleanup previous media
        if (this.currentMedia) {
            this.cleanupCurrentMedia();
            await new Promise((resolve) => setTimeout(resolve, 150));
        }

        const file = this.mediaFiles[this.currentIndex];
        console.log('Showing media:', file.name);

        const fileUrl = this.pathToFileURL(file.path);

        let jxlAnimated = false;
        if (file.type.startsWith('image/')) {
            this.currentMedia = document.createElement('img');
            if (this.isJxl(file.path)) {
                try {
                    const decoded = await this.decodeJxl(file.path);
                    if (!decoded.frames || decoded.frames.length === 0) {
                        throw new Error('JXL decoded with no frames');
                    }
                    if (decoded.animated && decoded.frameCount > 1) {
                        // Animated JXL: drive a <canvas>, decoding one frame at a time.
                        // startJxlAnimation replaces this.currentMedia with the canvas.
                        jxlAnimated = true;
                        await this.startJxlAnimation(decoded);
                    } else {
                        // Static JXL: render frame 0 via the existing <img> + object-URL path.
                        this.currentMedia.src = this.jxlFrameToObjectURL(decoded.frames[0]);
                    }
                } catch (err) {
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.showNotification('Could not decode JXL file', 'error');
                    this.isLoading = false;
                    this.mediaNavigationInProgress = false;
                    this.hideLoadingSpinner();
                    return; // graceful skip — do not crash
                }
            } else {
                this.currentMedia.src = fileUrl;
            }
            this.videoControls.style.display = 'none';
            // A <canvas> has no 'load' event, so setupImageHandlers (which gates on an
            // 'load' listener) would never hide the spinner or reset state. The animated
            // path is finished synchronously below (after append), via finishJxlCanvasDisplay.
            if (!jxlAnimated) {
                this.setupImageHandlers(file);
            }
        } else if (file.type.startsWith('video/')) {
            this.currentMedia = document.createElement('video');
            this.currentMedia.src = fileUrl;
            this.currentMedia.autoplay = true;
            this.currentMedia.loop = true;
            this.currentMedia.muted = false;
            this.currentMedia.controls = false;
            this.currentMedia.volume = parseFloat(this.volumeSlider.value);
            this.currentMedia.preload = 'metadata';
            this.videoControls.style.display = 'flex';
            this.setupVideoHandlers(file);
        }

        this.currentMedia.className = 'media-display';
        this.currentMedia.style.display = 'none';
        this.mediaContainer.appendChild(this.currentMedia);

        // Animated-JXL canvas: dimensions are known immediately (no async 'load'),
        // so finish display now — after append — un-hiding the canvas set above.
        if (jxlAnimated) {
            this.finishJxlCanvasDisplay(file);
        }

        this.closeAllZoomPopovers();

        this.updateBasicFileInfo(file);
        // For the animated-JXL canvas there is no async 'load' to call
        // updateFileInfoWithDimensions later, so write dimensions now (after the
        // basic info reset above would otherwise clobber them).
        if (jxlAnimated) {
            this.updateFileInfoWithDimensions(file);
        }
        this.updateNavigationInfo();

        // Prioritize feature extraction for displayed file (after small delay for media to load)
        setTimeout(() => this.prioritizeDisplayedFilesExtraction(), 200);
    }

    // Shared tail for "a file became unusable mid-render" (missing on disk OR undecodable JXL):
    // fall back to single mode when < 2 files remain, else retry the pair (bounded). The caller
    // must have already removeFileFromList()'d the bad file and reset isLoading /
    // mediaNavigationInProgress / hidden the spinner before calling this.
    async _retryCompareAfterRemoval(retryCount) {
        if (this.mediaFiles.length < 2) {
            if (this.isTournamentMode) this.exitTournamentMode();
            this.switchToSingleModeUI();
            if (this.mediaFiles.length === 1) {
                this.showNotification('Not enough files for compare mode', 'info');
                this.currentIndex = 0;
                await this.showMedia();
            } else if (this.moveHistory.length > 0) {
                this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                this.showEmptyStateWithUndo();
            } else {
                this.showDropZone();
            }
            return;
        }
        if (retryCount >= 10) {
            this.showNotification('Too many unusable files, unable to find valid pair', 'error');
            return;
        }
        return this.showCompareMedia(retryCount + 1);
    }

    async showCompareMedia(retryCount = 0) {
        if (this.mediaFiles.length < 2) {
            // Clean up any stale compare media from a prior render
            if (this.leftMedia) {
                await this.cleanupCompareMedia('left');
            }
            if (this.rightMedia) {
                await this.cleanupCompareMedia('right');
            }
            // switchToSingleModeUI() tears down the stale compare wrappers.
            if (this.isTournamentMode) this.exitTournamentMode();
            this.switchToSingleModeUI();

            if (this.mediaFiles.length === 1) {
                this.showNotification('Not enough files for compare mode', 'info');
                this.currentIndex = 0;
                await this.showMedia();
            } else if (this.moveHistory.length > 0) {
                this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                this.showEmptyStateWithUndo();
            } else {
                this.showDropZone();
            }
            return;
        }

        this.mediaNavigationInProgress = true;
        this.isLoading = true;
        this.showLoadingSpinner();

        // Reset zoom when changing files
        this.resetZoom('left');
        this.resetZoom('right');

        // Cleanup previous media in parallel
        const cleanupPromises = [];
        if (this.leftMedia) {
            cleanupPromises.push(this.cleanupCompareMedia('left'));
        }
        if (this.rightMedia) {
            cleanupPromises.push(this.cleanupCompareMedia('right'));
        }
        await Promise.all(cleanupPromises);

        if (this.leftMediaWrapper) {
            this.fullscreen.cleanup(this.leftMediaWrapper);
            this.leftMediaWrapper.remove();
        }
        if (this.rightMediaWrapper) {
            this.fullscreen.cleanup(this.rightMediaWrapper);
            this.rightMediaWrapper.remove();
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Select files for comparison
        let leftFile, rightFile;

        // Check if we have restored pair files to display (from undo operation)
        if (this._restoredPairFiles) {
            leftFile = this._restoredPairFiles.left;
            rightFile = this._restoredPairFiles.right;
            console.log('Showing restored pair:', leftFile.name, 'vs', rightFile.name);
            // Clear the flag after use
            this._restoredPairFiles = null;
        }
        // If sorted by prediction, select pairs based on mlComparePairIndex
        else if (this.isSortedByPrediction && this.predictionScores.size >= 2) {
            const filesWithScores = this.mediaFiles
                .map((f) => ({ file: f, score: this.predictionScores.get(f.path) ?? 0.5 }))
                .sort((a, b) => b.score - a.score); // Sort descending by score

            // Use mlComparePairIndex to select which pair to show
            // Index 0 = highest vs lowest, index 1 = 2nd highest vs 2nd lowest, etc.
            const pairIndex = Math.min(this.mlComparePairIndex, Math.floor(filesWithScores.length / 2) - 1);
            const leftIndex = Math.max(0, pairIndex);
            const rightIndex = Math.max(0, filesWithScores.length - 1 - pairIndex);

            // Ensure we don't select the same file twice
            if (leftIndex >= rightIndex) {
                leftFile = filesWithScores[0].file;
                rightFile = filesWithScores[filesWithScores.length - 1].file;
            } else {
                leftFile = filesWithScores[leftIndex].file;
                rightFile = filesWithScores[rightIndex].file;
            }

            const leftScore = this.predictionScores.get(leftFile.path) ?? 0.5;
            const rightScore = this.predictionScores.get(rightFile.path) ?? 0.5;
            console.log(
                `ML Compare [${pairIndex}]: ${leftFile.name} (${(leftScore * 100).toFixed(1)}%) vs ${rightFile.name} (${(rightScore * 100).toFixed(1)}%)`
            );
        } else {
            // Regular mode: consecutive files based on currentIndex
            if (this.currentIndex >= this.mediaFiles.length - 1) {
                this.currentIndex = 0;
            }
            leftFile = this.mediaFiles[this.currentIndex];
            rightFile = this.mediaFiles[this.currentIndex + 1];
        }

        // Store references for use in moveComparePair
        this.compareLeftFile = leftFile;
        this.compareRightFile = rightFile;
        this.updateBulkRateButtonsVisibility();

        // Safety check: ensure left and right are different files
        if (!leftFile || !rightFile || leftFile === rightFile) {
            console.error('Invalid file selection in compare mode');
            this.isLoading = false;
            this.mediaNavigationInProgress = false;
            this.hideLoadingSpinner();
            return;
        }

        // Validate files exist on disk before displaying
        const [leftExists, rightExists] = await Promise.all([
            window.electronAPI.checkFileExists(leftFile.path),
            window.electronAPI.checkFileExists(rightFile.path),
        ]);

        let removedCount = 0;
        if (!leftExists) {
            console.warn('Compare file missing:', leftFile.path);
            this.removeFileFromList(leftFile.path);
            removedCount++;
        }
        if (!rightExists) {
            console.warn('Compare file missing:', rightFile.path);
            this.removeFileFromList(rightFile.path);
            removedCount++;
        }

        if (removedCount > 0) {
            this.showNotification(`Skipped ${removedCount} missing file${removedCount > 1 ? 's' : ''}`, 'warning');
            this.isLoading = false;
            this.mediaNavigationInProgress = false;
            this.hideLoadingSpinner();
            return this._retryCompareAfterRemoval(retryCount);
        }

        console.log('Showing compare media:', leftFile.name, 'vs', rightFile.name);

        // Create wrappers with distinct classes for badge positioning
        this.leftMediaWrapper = document.createElement('div');
        this.leftMediaWrapper.className = 'media-wrapper left-media-wrapper';
        this.rightMediaWrapper = document.createElement('div');
        this.rightMediaWrapper.className = 'media-wrapper right-media-wrapper';

        // Create left media
        const leftFileUrl = this.pathToFileURL(leftFile.path);
        if (leftFile.type.startsWith('image/')) {
            this.leftMedia = document.createElement('img');
            if (this.isJxl(leftFile.path)) {
                try {
                    const decoded = await this.decodeJxl(leftFile.path);
                    if (!decoded.frames || decoded.frames.length === 0) {
                        throw new Error('JXL decoded with no frames');
                    }
                    // Compare mode shows frame 0 only (no animation in compare for v1).
                    this.leftMedia.src = this.jxlFrameToObjectURL(decoded.frames[0]);
                } catch (err) {
                    // Undecodable JXL: purge it and retry the pair (mirrors the missing-file path),
                    // rather than leaving compare half-rendered.
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.showNotification('Skipping undecodable JXL file', 'warning');
                    this.leftMedia = null; // detached <img>, never appended
                    this.removeFileFromList(leftFile.path);
                    this.isLoading = false;
                    this.mediaNavigationInProgress = false;
                    this.hideLoadingSpinner();
                    return this._retryCompareAfterRemoval(retryCount);
                }
            } else {
                this.leftMedia.src = leftFileUrl;
            }
            this.setupCompareImageHandlers(this.leftMedia, leftFile, 'left');
        } else if (leftFile.type.startsWith('video/')) {
            this.leftMedia = document.createElement('video');
            this.leftMedia.src = leftFileUrl;
            this.leftMedia.autoplay = true;
            this.leftMedia.loop = true;
            this.leftMedia.muted = false;
            this.leftMedia.controls = true; // Enable native browser controls in compare mode
            this.leftMedia.volume = parseFloat(this.volumeSlider.value);
            this.leftMedia.preload = 'metadata';
            this.setupCompareVideoHandlers(this.leftMedia, leftFile, 'left');
        }

        // Create right media
        const rightFileUrl = this.pathToFileURL(rightFile.path);
        if (rightFile.type.startsWith('image/')) {
            this.rightMedia = document.createElement('img');
            if (this.isJxl(rightFile.path)) {
                try {
                    const decoded = await this.decodeJxl(rightFile.path);
                    if (!decoded.frames || decoded.frames.length === 0) {
                        throw new Error('JXL decoded with no frames');
                    }
                    // Compare mode shows frame 0 only (no animation in compare for v1).
                    this.rightMedia.src = this.jxlFrameToObjectURL(decoded.frames[0]);
                } catch (err) {
                    // Undecodable JXL: purge it and retry the pair. The retry re-enters
                    // showCompareMedia, whose start-cleanup revokes the already-set left object URL.
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.showNotification('Skipping undecodable JXL file', 'warning');
                    this.rightMedia = null; // detached <img>, never appended
                    this.removeFileFromList(rightFile.path);
                    this.isLoading = false;
                    this.mediaNavigationInProgress = false;
                    this.hideLoadingSpinner();
                    return this._retryCompareAfterRemoval(retryCount);
                }
            } else {
                this.rightMedia.src = rightFileUrl;
            }
            this.setupCompareImageHandlers(this.rightMedia, rightFile, 'right');
        } else if (rightFile.type.startsWith('video/')) {
            this.rightMedia = document.createElement('video');
            this.rightMedia.src = rightFileUrl;
            this.rightMedia.autoplay = true;
            this.rightMedia.loop = true;
            this.rightMedia.muted = false;
            this.rightMedia.controls = true; // Enable native browser controls in compare mode
            this.rightMedia.volume = parseFloat(this.volumeSlider.value);
            this.rightMedia.preload = 'metadata';
            this.setupCompareVideoHandlers(this.rightMedia, rightFile, 'right');
        }

        this.leftMedia.className = 'media-display';
        this.rightMedia.className = 'media-display';
        this.leftMedia.style.display = 'none';
        this.rightMedia.style.display = 'none';

        // Add click handlers for fullscreen
        this.leftMediaWrapper.addEventListener('click', (e) => {
            if (!this.leftMediaWrapper.classList.contains('fullscreen')) {
                e.stopPropagation();
                this.fullscreen.toggle(this.leftMediaWrapper);
            }
        });
        this.rightMediaWrapper.addEventListener('click', (e) => {
            if (!this.rightMediaWrapper.classList.contains('fullscreen')) {
                e.stopPropagation();
                this.fullscreen.toggle(this.rightMediaWrapper);
            }
        });

        this.leftMediaWrapper.appendChild(this.leftMedia);
        this.rightMediaWrapper.appendChild(this.rightMedia);

        // Add overlay controls to each media wrapper
        this.addMediaOverlayControls(this.leftMediaWrapper, 'left');
        this.addMediaOverlayControls(this.rightMediaWrapper, 'right');

        this.mediaContainer.appendChild(this.leftMediaWrapper);
        this.mediaContainer.appendChild(this.rightMediaWrapper);

        this.closeAllZoomPopovers();

        // Initialize Lucide icons for overlay controls (must be after DOM append)
        // Use root param to scope icon creation — avoids re-replacing global icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: this.leftMediaWrapper });
            lucide.createIcons({ root: this.rightMediaWrapper });
        }

        // Update file info for both media
        this.updateCompareFileInfo(leftFile, rightFile);
        this.updateNavigationInfo();

        // Prioritize feature extraction for displayed files (after small delay for media to load)
        setTimeout(() => this.prioritizeDisplayedFilesExtraction(), 200);
    }

    addMediaOverlayControls(wrapper, side) {
        const controls = document.createElement('div');
        controls.className = 'media-overlay-controls';

        const likeBtn = document.createElement('button');
        likeBtn.className = 'overlay-btn overlay-like-btn';
        likeBtn.innerHTML = '<i data-lucide="thumbs-up"></i>';
        likeBtn.title = side === 'left' ? 'Like Left (Q)' : 'Like Right (E)';
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'left') this.handleLeftLike();
            else this.handleRightLike();
        });

        const dislikeBtn = document.createElement('button');
        dislikeBtn.className = 'overlay-btn overlay-dislike-btn';
        dislikeBtn.innerHTML = '<i data-lucide="thumbs-down"></i>';
        dislikeBtn.title = side === 'left' ? 'Dislike Left (W)' : 'Dislike Right (R)';
        dislikeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'left') this.handleLeftDislike();
            else this.handleRightDislike();
        });

        const specialBtn = document.createElement('button');
        specialBtn.className = 'overlay-btn overlay-special-btn';
        specialBtn.innerHTML = '<i data-lucide="folder-heart"></i>';
        specialBtn.title = this.customSpecialFolder
            ? 'Move to special folder'
            : 'Configure special folder in Settings (F1)';
        specialBtn.disabled = !this.customSpecialFolder;
        specialBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moveToSpecialFolder(side);
        });

        // Zoom button with popover wrapper
        const zoomWrapper = document.createElement('div');
        zoomWrapper.className = 'control-btn-wrapper';
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'overlay-btn overlay-zoom-btn';
        zoomBtn.innerHTML = '<i data-lucide="zoom-in"></i>';
        zoomBtn.title = 'Zoom controls';
        zoomWrapper.appendChild(zoomBtn);

        controls.appendChild(zoomWrapper);
        controls.appendChild(specialBtn);
        controls.appendChild(dislikeBtn);
        controls.appendChild(likeBtn);
        wrapper.appendChild(controls);

        // Clean up old zoom popover for this side and create new one
        this.removeZoomPopover(side);
        this.createZoomPopover(side, zoomWrapper, zoomBtn);
    }

    setupCompareImageHandlers(media, file, side) {
        const listeners = side === 'left' ? this.videoEventListenersLeft : this.videoEventListenersRight;

        const onLoad = () => {
            if (media && media.tagName === 'IMG' && !this.isBeingCleaned) {
                media.style.display = 'block';

                // Update file info with dimensions now that image is loaded
                // Use stored file references (works for both AI-sorted and regular mode)
                if (this.compareLeftFile && this.compareRightFile) {
                    this.updateCompareFileInfo(this.compareLeftFile, this.compareRightFile);
                }

                // Setup zoom events for the loaded image
                this.setupZoomEvents(media, side);

                // Check if both media are loaded
                const bothLoaded =
                    (!this.leftMedia || this.leftMedia.complete || this.leftMedia.tagName === 'VIDEO') &&
                    (!this.rightMedia || this.rightMedia.complete || this.rightMedia.tagName === 'VIDEO');

                if (bothLoaded) {
                    this.hideLoadingSpinner();
                    this.isLoading = false;
                    this.mediaNavigationInProgress = false;
                    // Update prediction badges for both
                    this.updatePredictionBadges();
                }
            }
        };

        const onError = (e) => {
            if (media && media.tagName === 'IMG' && !this.isBeingCleaned) {
                console.error('Image load error:', e);
                this.hideLoadingSpinner();
                const failedIndex = this.mediaFiles.findIndex((f) => f.path === file.path);
                this.showError(`Failed to load image: ${file.name}`, {
                    actionButton: 'Remove',
                    actionCallback: () => this.removeFailedFile(failedIndex, side),
                });
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
            }
        };

        listeners.push({ event: 'load', handler: onLoad }, { event: 'error', handler: onError });

        media.addEventListener('load', onLoad);
        media.addEventListener('error', onError);
    }

    setupCompareVideoHandlers(media, file, side) {
        const listeners = side === 'left' ? this.videoEventListenersLeft : this.videoEventListenersRight;

        const onLoadedMetadata = () => {
            if (media && media.tagName === 'VIDEO' && !this.isBeingCleaned) {
                media.style.display = 'block';

                // Update file info with dimensions and duration now that metadata is loaded
                // Use stored file references (works for both AI-sorted and regular mode)
                if (this.compareLeftFile && this.compareRightFile) {
                    this.updateCompareFileInfo(this.compareLeftFile, this.compareRightFile);
                }

                // Setup zoom events for the loaded video
                this.setupZoomEvents(media, side);

                // Check if both media are loaded
                const bothLoaded =
                    (!this.leftMedia || this.leftMedia.tagName !== 'VIDEO' || this.leftMedia.readyState >= 1) &&
                    (!this.rightMedia || this.rightMedia.tagName !== 'VIDEO' || this.rightMedia.readyState >= 1);

                if (bothLoaded) {
                    this.hideLoadingSpinner();
                    this.isLoading = false;
                    this.mediaNavigationInProgress = false;
                    // Update prediction badges for both
                    this.updatePredictionBadges();
                }
            }
        };

        const onError = (e) => {
            if (media && media.tagName === 'VIDEO' && !this.isBeingCleaned) {
                console.error('Video load error:', e);
                this.hideLoadingSpinner();
                const failedIndex = this.mediaFiles.findIndex((f) => f.path === file.path);
                this.showError(`Failed to load video: ${file.name}`, {
                    actionButton: 'Remove',
                    actionCallback: () => this.removeFailedFile(failedIndex, side),
                });
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
            }
        };

        listeners.push({ event: 'loadedmetadata', handler: onLoadedMetadata }, { event: 'error', handler: onError });

        media.addEventListener('loadedmetadata', onLoadedMetadata);
        media.addEventListener('error', onError);
    }

    setupImageHandlers(file) {
        const onLoad = () => {
            if (this.currentMedia && this.currentMedia.tagName === 'IMG' && !this.isBeingCleaned) {
                this.hideLoadingSpinner();
                this.fitMediaToScreen();
                this.currentMedia.style.display = 'block';
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
                this.updateFileInfoWithDimensions(file);
                // Setup zoom events for the loaded image
                this.setupZoomEvents(this.currentMedia, 'single');
                // Update prediction badges
                this.updatePredictionBadges();
            }
        };

        const onError = (e) => {
            if (this.currentMedia && this.currentMedia.tagName === 'IMG' && !this.isBeingCleaned) {
                console.error('Image load error:', e);
                this.hideLoadingSpinner();
                const failedIndex = this.currentIndex;
                this.showError(`Failed to load image: ${file.name}`, {
                    actionButton: 'Remove',
                    actionCallback: () => this.removeFailedFile(failedIndex),
                });
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
            }
        };

        // Store event listeners for cleanup
        this.videoEventListeners.push({ event: 'load', handler: onLoad }, { event: 'error', handler: onError });

        this.currentMedia.addEventListener('load', onLoad);
        this.currentMedia.addEventListener('error', onError);
    }

    // Post-display work for an animated-JXL <canvas>. Mirrors the onLoad path of
    // setupImageHandlers, but runs synchronously because a canvas has no 'load'
    // event and its dimensions are known the moment it is created.
    finishJxlCanvasDisplay(_file) {
        const canvas = this.currentMedia;
        if (!canvas || canvas.tagName !== 'CANVAS' || this.isBeingCleaned) return;
        this.hideLoadingSpinner();
        // Size the canvas to fit the screen (fitMediaToScreen only handles IMG/VIDEO).
        // object-fit is IGNORED on <canvas>, so we compute explicit aspect-preserving
        // CSS pixel dimensions instead. Mirror fitMediaToScreen, which never upscales
        // small media (it shows it at native size), so clamp the fit scale to <= 1.
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scale = Math.min(vw / canvas.width, vh / canvas.height, 1);
        canvas.style.width = Math.round(canvas.width * scale) + 'px';
        canvas.style.height = Math.round(canvas.height * scale) + 'px';
        canvas.style.maxWidth = 'none';
        canvas.style.maxHeight = 'none';
        canvas.style.display = 'block';
        this.isLoading = false;
        this.mediaNavigationInProgress = false;
        this.setupZoomEvents(canvas, 'single');
        this.updatePredictionBadges();
    }

    setupVideoHandlers(file) {
        this.isVideoLoading = true;

        const onLoadedMetadata = () => {
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                this.hideLoadingSpinner();
                this.fitMediaToScreen();
                this.currentMedia.style.display = 'block';
                this.isLoading = false;
                this.isVideoLoading = false;
                this.mediaNavigationInProgress = false;
                this.updateFileInfoWithDimensions(file);
                this.setupVideoProgressTracking();
                // Setup zoom events for the loaded video
                this.setupZoomEvents(this.currentMedia, 'single');
                // Update prediction badges
                this.updatePredictionBadges();
            }
        };

        const onError = (e) => {
            // Only show error if we're not in the middle of cleanup
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                console.error('Video load error:', e);
                this.hideLoadingSpinner();
                const failedIndex = this.currentIndex;
                this.showError(`Failed to load video: ${file.name}`, {
                    actionButton: 'Remove',
                    actionCallback: () => this.removeFailedFile(failedIndex),
                });
                this.isLoading = false;
                this.isVideoLoading = false;
                this.mediaNavigationInProgress = false;
            }
        };

        const onCanPlay = () => {
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                this.isVideoLoading = false;
            }
        };

        const onPlay = () => {
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                this.playIcon.style.display = 'none';
                this.pauseIcon.style.display = 'block';
            }
        };

        const onPause = () => {
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                this.playIcon.style.display = 'block';
                this.pauseIcon.style.display = 'none';
            }
        };

        // Store event listeners for cleanup
        this.videoEventListeners.push(
            { event: 'loadedmetadata', handler: onLoadedMetadata },
            { event: 'error', handler: onError },
            { event: 'canplay', handler: onCanPlay },
            { event: 'play', handler: onPlay },
            { event: 'pause', handler: onPause }
        );

        this.currentMedia.addEventListener('loadedmetadata', onLoadedMetadata);
        this.currentMedia.addEventListener('error', onError);
        this.currentMedia.addEventListener('canplay', onCanPlay);
        this.currentMedia.addEventListener('play', onPlay);
        this.currentMedia.addEventListener('pause', onPause);
    }

    setupVideoProgressTracking() {
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO') return;

        const updateProgress = () => {
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                const video = this.currentMedia;
                if (video.duration) {
                    const progress = (video.currentTime / video.duration) * 100;
                    this.progressSlider.value = progress;
                    this.currentTime.textContent = this.formatDuration(video.currentTime);
                    this.totalTime.textContent = this.formatDuration(video.duration);
                }
            }
        };

        // Store event listeners for cleanup
        const onTimeUpdate = updateProgress;
        const onLoadedMetadata = updateProgress;

        this.videoEventListeners.push(
            { event: 'timeupdate', handler: onTimeUpdate },
            { event: 'loadedmetadata', handler: onLoadedMetadata }
        );

        this.currentMedia.addEventListener('timeupdate', onTimeUpdate);
        this.currentMedia.addEventListener('loadedmetadata', onLoadedMetadata);
    }

    fitMediaToScreen() {
        if (!this.currentMedia) return;

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (this.currentMedia.tagName === 'IMG') {
            const img = this.currentMedia;

            const handleImageLoad = () => {
                const naturalWidth = img.naturalWidth;
                const naturalHeight = img.naturalHeight;

                if (naturalWidth > windowWidth || naturalHeight > windowHeight) {
                    img.style.width = '100vw';
                    img.style.height = '100vh';
                    img.style.objectFit = 'contain';
                    img.style.maxWidth = 'none';
                    img.style.maxHeight = 'none';
                } else {
                    img.style.width = naturalWidth + 'px';
                    img.style.height = naturalHeight + 'px';
                    img.style.objectFit = 'none';
                    img.style.maxWidth = 'none';
                    img.style.maxHeight = 'none';
                }
            };

            if (img.complete && img.naturalWidth > 0) {
                handleImageLoad();
            } else {
                img.addEventListener('load', handleImageLoad);
            }
        } else if (this.currentMedia.tagName === 'VIDEO') {
            const video = this.currentMedia;

            const handleVideoMetadata = () => {
                const videoWidth = video.videoWidth;
                const videoHeight = video.videoHeight;

                if (videoWidth > windowWidth || videoHeight > windowHeight) {
                    video.style.width = '100vw';
                    video.style.height = '100vh';
                    video.style.objectFit = 'contain';
                    video.style.maxWidth = 'none';
                    video.style.maxHeight = 'none';
                } else {
                    video.style.width = videoWidth + 'px';
                    video.style.height = videoHeight + 'px';
                    video.style.objectFit = 'none';
                    video.style.maxWidth = 'none';
                    video.style.maxHeight = 'none';
                }
            };

            if (video.videoWidth && video.videoHeight) {
                handleVideoMetadata();
            } else {
                video.addEventListener('loadedmetadata', handleVideoMetadata);
            }
        }
    }

    togglePlayPause() {
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO' || this.isVideoLoading) return;

        if (this.currentMedia.paused) {
            this.currentMedia.play();
        } else {
            this.currentMedia.pause();
        }
    }

    setVolume(value) {
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO') return;

        this.currentMedia.volume = parseFloat(value);
    }

    seekVideo(value) {
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO' || this.isVideoLoading) return;

        const video = this.currentMedia;
        if (video.duration) {
            video.currentTime = (parseFloat(value) / 100) * video.duration;
        }
    }

    skipVideo(seconds) {
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO') return;
        const video = this.currentMedia;
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    }

    showLoadingSpinner() {
        // Hide drop zone to prevent overlap with loading spinner
        this.dropZone.style.display = 'none';
        this.loadingContainer.classList.add('show');
    }

    hideLoadingSpinner() {
        this.loadingContainer.classList.remove('show');
    }

    updateBasicFileInfo(file) {
        const maxLength = 35;
        const displayName = file.name.length > maxLength ? file.name.substring(0, maxLength) + '...' : file.name;

        this.fileName.textContent = displayName;
        this.fileName.title = file.name;

        let detailsText = this.formatFileSize(file.size);
        detailsText += `\nType: ${file.type}`;

        this.fileDetails.textContent = detailsText;
    }

    updateFileInfoWithDimensions(file) {
        const maxLength = 35;
        const displayName = file.name.length > maxLength ? file.name.substring(0, maxLength) + '...' : file.name;

        this.fileName.textContent = displayName;
        this.fileName.title = file.name;

        let detailsText = this.formatFileSize(file.size);
        detailsText += `\nType: ${file.type}`;

        if (this.currentMedia) {
            if (this.currentMedia.tagName === 'IMG') {
                const img = this.currentMedia;
                if (img.naturalWidth && img.naturalHeight) {
                    const aspectRatio = (img.naturalWidth / img.naturalHeight).toFixed(2);
                    detailsText += `\nDimensions: ${img.naturalWidth} × ${img.naturalHeight}`;
                    detailsText += `\nAspect ratio: ${aspectRatio}:1`;
                }
            } else if (this.currentMedia.tagName === 'VIDEO') {
                const video = this.currentMedia;
                if (video.videoWidth && video.videoHeight) {
                    const aspectRatio = (video.videoWidth / video.videoHeight).toFixed(2);
                    detailsText += `\nDimensions: ${video.videoWidth} × ${video.videoHeight}`;
                    detailsText += `\nAspect ratio: ${aspectRatio}:1`;
                    if (video.duration && !isNaN(video.duration)) {
                        detailsText += `\nDuration: ${this.formatDuration(video.duration)}`;
                    }
                }
            } else if (this.currentMedia.tagName === 'CANVAS') {
                // Animated-JXL canvas: dimensions are the canvas's intrinsic size.
                const canvas = this.currentMedia;
                if (canvas.width && canvas.height) {
                    const aspectRatio = (canvas.width / canvas.height).toFixed(2);
                    detailsText += `\nDimensions: ${canvas.width} × ${canvas.height}`;
                    detailsText += `\nAspect ratio: ${aspectRatio}:1`;
                }
            }
        }

        this.fileDetails.textContent = detailsText;
    }

    updateCompareFileInfo(leftFile, rightFile) {
        // Hide main file info panel in compare mode
        this.fileInfo.classList.remove('show');

        // Update left panel
        const maxLength = 30;
        const leftName =
            leftFile.name.length > maxLength ? leftFile.name.substring(0, maxLength) + '...' : leftFile.name;
        this.leftFileName.textContent = leftName;
        this.leftFileName.title = leftFile.name;

        let leftDetails = this.formatFileSize(leftFile.size);
        leftDetails += `\nType: ${leftFile.type}`;

        // Add dimensions for left media if available
        if (this.leftMedia) {
            if (this.leftMedia.tagName === 'IMG' && this.leftMedia.naturalWidth && this.leftMedia.naturalHeight) {
                const aspectRatio = (this.leftMedia.naturalWidth / this.leftMedia.naturalHeight).toFixed(2);
                leftDetails += `\nDimensions: ${this.leftMedia.naturalWidth} × ${this.leftMedia.naturalHeight}`;
                leftDetails += `\nAspect ratio: ${aspectRatio}:1`;
            } else if (this.leftMedia.tagName === 'VIDEO' && this.leftMedia.videoWidth && this.leftMedia.videoHeight) {
                const aspectRatio = (this.leftMedia.videoWidth / this.leftMedia.videoHeight).toFixed(2);
                leftDetails += `\nDimensions: ${this.leftMedia.videoWidth} × ${this.leftMedia.videoHeight}`;
                leftDetails += `\nAspect ratio: ${aspectRatio}:1`;
                if (this.leftMedia.duration && !isNaN(this.leftMedia.duration)) {
                    leftDetails += `\nDuration: ${this.formatDuration(this.leftMedia.duration)}`;
                }
            }
        }

        this.leftFileDetails.textContent = leftDetails;

        // Update right panel
        const rightName =
            rightFile.name.length > maxLength ? rightFile.name.substring(0, maxLength) + '...' : rightFile.name;
        this.rightFileName.textContent = rightName;
        this.rightFileName.title = rightFile.name;

        let rightDetails = this.formatFileSize(rightFile.size);
        rightDetails += `\nType: ${rightFile.type}`;

        // Add dimensions for right media if available
        if (this.rightMedia) {
            if (this.rightMedia.tagName === 'IMG' && this.rightMedia.naturalWidth && this.rightMedia.naturalHeight) {
                const aspectRatio = (this.rightMedia.naturalWidth / this.rightMedia.naturalHeight).toFixed(2);
                rightDetails += `\nDimensions: ${this.rightMedia.naturalWidth} × ${this.rightMedia.naturalHeight}`;
                rightDetails += `\nAspect ratio: ${aspectRatio}:1`;
            } else if (
                this.rightMedia.tagName === 'VIDEO' &&
                this.rightMedia.videoWidth &&
                this.rightMedia.videoHeight
            ) {
                const aspectRatio = (this.rightMedia.videoWidth / this.rightMedia.videoHeight).toFixed(2);
                rightDetails += `\nDimensions: ${this.rightMedia.videoWidth} × ${this.rightMedia.videoHeight}`;
                rightDetails += `\nAspect ratio: ${aspectRatio}:1`;
                if (this.rightMedia.duration && !isNaN(this.rightMedia.duration)) {
                    rightDetails += `\nDuration: ${this.formatDuration(this.rightMedia.duration)}`;
                }
            }
        }

        this.rightFileDetails.textContent = rightDetails;

        // Show compare panels (but not visible until hover)
        this.leftFileInfo.style.display = 'block';
        this.rightFileInfo.style.display = 'block';
    }

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    updateNavigationInfo() {
        if (this.isCompareMode && this.mediaFiles.length >= 2) {
            // In ML sorted mode, show pair index instead of file indices
            if (this.isSortedByPrediction && this.predictionScores.size >= 2) {
                const totalPairs = Math.floor(this.mediaFiles.length / 2);
                this.mediaIndex.textContent = `Pair ${this.mlComparePairIndex + 1} of ${totalPairs}`;
            } else {
                this.mediaIndex.textContent = `${this.currentIndex + 1}-${this.currentIndex + 2} of ${this.mediaFiles.length}`;
            }
        } else {
            this.mediaIndex.textContent = `${this.currentIndex + 1} of ${this.mediaFiles.length}`;
        }
    }

    updateFolderInfo() {
        const folderText =
            this.currentFolderPath.length > 25
                ? this.currentFolderPath.substring(0, 25) + '...'
                : this.currentFolderPath;
        this.folderInfo.textContent = `Current: ${folderText} (${this.mediaFiles.length} files)`;
        this.folderInfo.title = `${this.currentFolderPath} (${this.mediaFiles.length} files)`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async handleLike() {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        this.signalUserActivity();
        await this.moveCurrentFile('like');
    }

    async handleDislike() {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        this.signalUserActivity();
        await this.moveCurrentFile('dislike');
    }

    async undoBulkRating(lastMove) {
        const actionType = lastMove.bothGood ? 'like' : 'dislike';
        for (const f of lastMove.bulkFiles) {
            if (f.features) this.reverseMlModelUpdate(f.features, actionType);
            this.bulkRated.delete(f.name);
        }
        await this.saveBulkRatedFile();
        this.showNotification('↩️ Bulk rating undone', 'info');
    }

    async handleCancel() {
        if (this.moveHistory.length === 0) {
            this.showNotification('No moves to undo', 'error');
            return;
        }

        if (this.isLoading) return;
        this.signalUserActivity();

        // Check if last move was a special move in compare mode
        const lastMove = this.moveHistory[this.moveHistory.length - 1];

        // Bulk rating (Both good / Both bad): no file move to reverse — just undo the ML updates,
        // then refresh the UI like the other handleCancel branches do. Return to the pair that was
        // bulk-rated (applyBulkRating advanced past it), re-score prediction badges (the ML model
        // was just reverted), and re-render so the floating Undo button visibility updates.
        if (lastMove.bothGood || lastMove.bothBad) {
            this.moveHistory.pop();
            await this.undoBulkRating(lastMove);
            if (typeof lastMove.prevPairIndex === 'number') {
                this.mlComparePairIndex = lastMove.prevPairIndex;
            }
            if (this.isSortedByPrediction) this.requestPredictionScores();
            await this.showMedia();
            return;
        }

        if (this.isCompareMode && lastMove.compareMode && lastMove.actionType === 'special') {
            // Undo special folder move in compare mode
            this.moveHistory.pop();

            try {
                // Restore the moved file from special folder
                const moveResult = await window.electronAPI.moveFile({
                    sourcePath: lastMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: lastMove.fileName,
                });

                if (!moveResult.success) {
                    throw new Error(moveResult.error);
                }

                // Find the remaining file (should be at the end of the list)
                const remainingFileIndex = this.mediaFiles.findIndex((f) => f.path === lastMove.remainingFile.path);

                // Remove remaining file from current position (end of list)
                let remainingFile = null;
                if (remainingFileIndex !== -1) {
                    [remainingFile] = this.mediaFiles.splice(remainingFileIndex, 1);
                }

                // Calculate where to insert the restored file
                const restoredFile = {
                    name: lastMove.fileName,
                    path: lastMove.originalPath,
                    size: lastMove.fileSize,
                    type: lastMove.fileType,
                };

                // Insert remaining file back to its original position
                if (remainingFile) {
                    this.mediaFiles.splice(lastMove.remainingFileOriginalIndex, 0, remainingFile);
                }

                // Insert restored file at correct position relative to remaining file
                // The moved file was either before or after the remaining file originally
                const insertIndex = lastMove.remainingFileOriginalIndex;
                this.mediaFiles.splice(insertIndex, 0, restoredFile);

                this.showNotification(`✅ Restored ${lastMove.fileName}`, 'success');
                this.updateFolderInfo();

                // Set restored pair to be displayed directly
                if (remainingFile) {
                    this._restoredPairFiles = { left: restoredFile, right: remainingFile };
                }

                this.currentIndex = insertIndex;
                this.restoreFeatureCachesFromHistory(lastMove);
                if (this.isSortedByPrediction) this.requestPredictionScores();
                await this.showMedia();
            } catch (error) {
                console.error('Error undoing special move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(lastMove);
            }
        } else if (this.isCompareMode && lastMove.compareMode && this.moveHistory.length >= 2) {
            // In compare mode, restore both files (last two moves from like/dislike)
            const secondMove = this.moveHistory.pop();
            const firstMove = this.moveHistory.pop();

            try {
                // Restore first file
                const firstMoveResult = await window.electronAPI.moveFile({
                    sourcePath: firstMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: firstMove.fileName,
                });

                if (!firstMoveResult.success) {
                    throw new Error(firstMoveResult.error);
                }

                // Restore second file
                const secondMoveResult = await window.electronAPI.moveFile({
                    sourcePath: secondMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: secondMove.fileName,
                });

                if (!secondMoveResult.success) {
                    throw new Error(secondMoveResult.error);
                }

                // Add both files back to mediaFiles
                this.mediaFiles.push({
                    name: firstMove.fileName,
                    path: firstMove.originalPath,
                    size: firstMove.fileSize,
                    type: firstMove.fileType,
                });

                this.mediaFiles.push({
                    name: secondMove.fileName,
                    path: secondMove.originalPath,
                    size: secondMove.fileSize,
                    type: secondMove.fileType,
                });

                // Reverse ML model updates for both files
                if (firstMove.mlFeatures && firstMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(firstMove.mlFeatures, firstMove.actionType);
                }
                if (secondMove.mlFeatures && secondMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(secondMove.mlFeatures, secondMove.actionType);
                }

                this.restoreFeatureCachesFromHistory(firstMove);
                this.restoreFeatureCachesFromHistory(secondMove);
                this.showNotification(`✅ Restored ${firstMove.fileName}`, 'success');
                this.showNotification(`✅ Restored ${secondMove.fileName}`, 'success');
                this.updateFolderInfo();

                // Store restored files to display them directly (bypasses ML pair selection)
                const restoredFirst = this.mediaFiles.find((f) => f.path === firstMove.originalPath);
                const restoredSecond = this.mediaFiles.find((f) => f.path === secondMove.originalPath);

                if (restoredFirst && restoredSecond) {
                    // Set restored pair to be displayed directly
                    this._restoredPairFiles = { left: restoredFirst, right: restoredSecond };
                }

                this.currentIndex = this.mediaFiles.length - 2;

                await this.showMedia();
            } catch (error) {
                console.error('Error undoing move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                // Restore history on error
                this.moveHistory.push(firstMove);
                this.moveHistory.push(secondMove);
            }
        } else if (
            !this.isCompareMode &&
            this.moveHistory.length >= 2 &&
            this.moveHistory[this.moveHistory.length - 1].compareMode &&
            this.moveHistory[this.moveHistory.length - 2].compareMode
        ) {
            // Single mode — undo last compare pair (both files in one action)
            const secondMove = this.moveHistory.pop();
            const firstMove = this.moveHistory.pop();

            try {
                const firstMoveResult = await window.electronAPI.moveFile({
                    sourcePath: firstMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: firstMove.fileName,
                });
                if (!firstMoveResult.success) {
                    throw new Error(firstMoveResult.error);
                }

                const secondMoveResult = await window.electronAPI.moveFile({
                    sourcePath: secondMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: secondMove.fileName,
                });
                if (!secondMoveResult.success) {
                    throw new Error(secondMoveResult.error);
                }

                this.mediaFiles.push({
                    name: firstMove.fileName,
                    path: firstMove.originalPath,
                    size: firstMove.fileSize,
                    type: firstMove.fileType,
                });
                this.mediaFiles.push({
                    name: secondMove.fileName,
                    path: secondMove.originalPath,
                    size: secondMove.fileSize,
                    type: secondMove.fileType,
                });

                if (firstMove.mlFeatures && firstMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(firstMove.mlFeatures, firstMove.actionType);
                }
                if (secondMove.mlFeatures && secondMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(secondMove.mlFeatures, secondMove.actionType);
                }

                this.restoreFeatureCachesFromHistory(firstMove);
                this.restoreFeatureCachesFromHistory(secondMove);
                this.showNotification(`Restored ${firstMove.fileName}`, 'success');
                this.showNotification(`Restored ${secondMove.fileName}`, 'success');
                this.updateFolderInfo();

                this.currentIndex = this.mediaFiles.length - 2;
                await this.showMedia();
            } catch (error) {
                console.error('Error undoing compare pair move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(firstMove);
                this.moveHistory.push(secondMove);
            }
        } else {
            // Single mode - restore one file
            const undoMove = this.moveHistory.pop();

            try {
                const moveResult = await window.electronAPI.moveFile({
                    sourcePath: undoMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: undoMove.fileName,
                });

                if (!moveResult.success) {
                    throw new Error(moveResult.error);
                }

                // Insert file back at current position to maintain order
                this.mediaFiles.splice(this.currentIndex, 0, {
                    name: undoMove.fileName,
                    path: undoMove.originalPath,
                    size: undoMove.fileSize,
                    type: undoMove.fileType,
                });

                // Reverse ML model update
                if (undoMove.mlFeatures && undoMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(undoMove.mlFeatures, undoMove.actionType);
                }

                this.restoreFeatureCachesFromHistory(undoMove);
                this.showNotification(`✅ Restored ${undoMove.fileName}`, 'success');
                this.updateFolderInfo();

                // currentIndex already points to the restored file's position
                await this.showMedia();
            } catch (error) {
                console.error('Error undoing move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(undoMove);
            }
        }
    }

    switchToSingleModeUI() {
        this.isCompareMode = false;
        this.viewModeLabel.textContent = 'Single';
        this.controls.style.display = 'flex';
        this.compareControls.style.display = 'none';
        this.mediaContainer.classList.remove('compare-mode');
        this.videoControls.style.display = 'none';
        this.leftFileInfo.classList.remove('show');
        this.leftFileInfo.style.display = 'none';
        this.rightFileInfo.classList.remove('show');
        this.rightFileInfo.style.display = 'none';
        this.fileInfo.style.display = 'block';
        if (this.infoToggleBtn) {
            this.infoToggleBtn.style.display = 'flex';
        }
        // Tear down stale compare wrappers so exit-to-single paths (mode switch, folder
        // switch, <2-files fallback) never leave shrunken/shifted leftover nodes. Wrappers
        // are recreated by showCompareMedia on the next compare entry, so removal is safe.
        for (const key of ['leftMediaWrapper', 'rightMediaWrapper']) {
            const wrapper = this[key];
            if (wrapper) {
                this.fullscreen.cleanup(wrapper);
                wrapper.remove();
                this[key] = null;
            }
        }
        // The media element refs are owned by the (now-removed) wrappers; null them
        // too so stale compare elements can't be reused after exit-to-single.
        this.leftMedia = null;
        this.rightMedia = null;
        this.hidePredictionBadges();
        this.closeAllZoomPopovers();
    }

    // Show the floating Compare-mode Undo button when in compare mode (not tournament) with undo history available
    updateCompareUndoButton() {
        if (!this.compareUndoBtn) return;
        const visible = this.isCompareMode && !this.isTournamentMode && this.moveHistory.length > 0;
        this.compareUndoBtn.style.display = visible ? 'inline-flex' : 'none';
    }

    // ---------- Tournament Mode ----------
    async switchMode(mode) {
        // Leaving an active, incomplete tournament → confirm Save/Discard first. The leave
        // prompt resumes the switch (to `mode`) after the user chooses.
        if (
            this.isTournamentMode &&
            mode !== 'tournament' &&
            this.tournament.engine &&
            !this.tournament.engine.isComplete()
        ) {
            this.showTournamentLeavePrompt(() => this._applyModeSwitch(mode));
            return;
        }
        await this._applyModeSwitch(mode);
    }

    async _applyModeSwitch(mode) {
        document.querySelectorAll('.mode-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });

        if (mode === 'single') {
            if (this.isTournamentMode) this.exitTournamentMode();
            // Land single view on the file the user was actually viewing — the left file of
            // the current compare pair (filesWithScores[mlComparePairIndex] when AI-sorted).
            // Gate on isCompareMode: compareLeftFile is never cleared on compare exit, so an
            // un-gated capture would hijack non-compare re-entry (re-clicking the active Single
            // button, or tournament→single) with a stale value. Capture before
            // switchToSingleModeUI runs. -1 (null / just-rated / removed / not-from-compare) → 0.
            const target = this.isCompareMode ? this.compareLeftFile : null;
            if (this.isCompareMode) this.switchToSingleModeUI();
            if (this.mediaFiles.length > 0) {
                const idx = target ? this.mediaFiles.findIndex((f) => f.path === target.path) : -1;
                this.currentIndex = idx >= 0 ? idx : 0;
                this.showMedia();
            }
        } else if (mode === 'compare') {
            if (this.isTournamentMode) this.exitTournamentMode();
            if (!this.isCompareMode) await this.toggleViewMode();
        } else if (mode === 'tournament') {
            if (this.isCompareMode) this.switchToSingleModeUI();
            await this.enterTournamentMode();
        }
        this.updateCompareUndoButton();
    }

    // Tournament mode is strict + deterministic: it operates on the canonical folder order, not
    // a transient sort. Restore the pre-sort order (if any) on entry. predictionScores are kept
    // so the config modal's AI-seeding option still works — that's the in-tournament equivalent
    // of sorting first.
    restoreOriginalOrderForTournament() {
        if ((this.isSortedBySimilarity || this.isSortedByPrediction) && this.originalMediaFiles.length > 0) {
            const currentPaths = new Set(this.mediaFiles.map((f) => f.path));
            this.mediaFiles = this.originalMediaFiles.filter((f) => currentPaths.has(f.path));
        }
        this.isSortedBySimilarity = false;
        this.isSortedByPrediction = false;
        this.mlComparePairIndex = 0;
        this.currentIndex = 0;
        const simLabel = this.sortSimilarityBtn?.querySelector('.btn-label');
        if (simLabel) simLabel.textContent = 'Sort by Similarity';
    }

    // Show/hide the header sort controls. Hidden while in tournament mode so sorting can't run
    // mid-tournament (exit first to sort); restored on exit when a folder is loaded.
    setSortControlsVisible(visible) {
        const display = visible ? 'inline-flex' : 'none';
        if (this.sortSimilarityBtn) this.sortSimilarityBtn.style.display = display;
        if (this.sortAlgorithmSelect) this.sortAlgorithmSelect.style.display = display;
        if (visible) {
            this.updateSortSettingsVisibility();
            this.updateSortPredictionButton();
        } else {
            if (this.sortSettings) this.sortSettings.style.display = 'none';
            if (this.sortPredictionBtn) this.sortPredictionBtn.style.display = 'none';
        }
    }

    async enterTournamentMode() {
        // Reset to canonical order before any tournament UI (deterministic start).
        this.restoreOriginalOrderForTournament();
        // Live engine already in memory (defensive — exit nulls it) → resume directly.
        if (this.tournament.engine) {
            await this._enterResumedTournamentUI();
            return;
        }
        // Look for a saved tournament in this folder; offer Continue / Start over if found.
        let state = null;
        try {
            const result = await window.electronAPI.readTournamentState(this.baseFolderPath);
            if (result.success && result.state) state = result.state;
        } catch (err) {
            window.electronAPI.logError?.(`Tournament state read failed: ${err.message}`);
        }
        if (state) {
            const currentFiles = this.mediaFiles.map((f) => f.path);
            this.showTournamentContinuePrompt(state, currentFiles);
        } else {
            this.showTournamentConfigModal();
        }
    }

    // Prompt shown when leaving an active tournament: Save (keep state on disk to resume later)
    // or Discard (delete state). Both then invoke onAfterLeave (e.g. complete a pending mode switch).
    showTournamentLeavePrompt(onAfterLeave) {
        const modal = document.getElementById('tournamentResumeModal');
        const title = document.getElementById('tournamentResumeTitle');
        const body = document.getElementById('tournamentResumeBody');
        const acceptBtn = document.getElementById('tournamentResumeAccept');
        const discardBtn = document.getElementById('tournamentResumeDiscard');

        const cancelBtn = document.getElementById('tournamentResumeCancel');
        title.textContent = 'Leave tournament?';
        const p = this.tournament.engine.getProgress();
        body.innerHTML =
            `<div class="modal-row"><span>Progress:</span><span>${p.gamesPlayed}/${p.gamesTotal} games</span></div>` +
            `<p style="font-size:12px;color:#888">Save to resume later from this folder, or discard it.</p>`;
        acceptBtn.textContent = 'Save & leave';
        discardBtn.textContent = 'Discard';
        if (cancelBtn) cancelBtn.style.display = '';

        const cleanup = () => {
            modal.style.display = 'none';
            acceptBtn.onclick = null;
            discardBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
        };

        acceptBtn.onclick = async () => {
            // State is persisted per-pick (debounced); flush any pending write so the latest
            // picks are durable, then drop the in-memory engine (disk is the single source of truth).
            await this.tournament.flush();
            this.tournament.engine = null;
            cleanup();
            await onAfterLeave();
        };
        discardBtn.onclick = async () => {
            // Best-effort discard: even if deleting the saved state fails (disk/IPC error),
            // still tear down the modal and run the continuation. onAfterLeave may be the
            // app-close fail-safe (allowAppClose) which must never be blocked by an IO error
            // — mirrors the persist-error swallow on the Save path (tournament.js _drain).
            try {
                await this.tournament.handleDiscard();
            } catch (err) {
                window.electronAPI.logError?.('tournament discard failed: ' + err.message);
            }
            cleanup();
            await onAfterLeave();
        };
        // Cancel: stay in tournament mode (nothing changed — we never left).
        if (cancelBtn) {
            cancelBtn.onclick = () => cleanup();
        }
        modal.style.display = 'flex';
    }

    // Main process intercepted a window-close (X / Alt+F4 / quit) and is asking whether it
    // may proceed. For an incomplete tournament, show the same Save/Discard/Cancel leave
    // prompt the user sees on Escape — Save/Discard then allow the close, Cancel keeps the
    // app open. Otherwise allow immediately. Fail-safe: any error still allows the close, so
    // a renderer bug can never make the app unclosable.
    handleAppCloseRequest() {
        try {
            if (this.isTournamentMode && this.tournament.engine && !this.tournament.engine.isComplete()) {
                this.showTournamentLeavePrompt(() => window.electronAPI.allowAppClose());
            } else {
                window.electronAPI.allowAppClose();
            }
        } catch (err) {
            window.electronAPI.logError?.('app-close handler failed: ' + err.message);
            window.electronAPI.allowAppClose();
        }
    }

    // Prompt shown when entering tournament mode with a saved tournament on disk:
    // Continue (resume, reconciling any file-set delta) or Start over (discard + config).
    showTournamentContinuePrompt(state, currentFiles) {
        const modal = document.getElementById('tournamentResumeModal');
        const title = document.getElementById('tournamentResumeTitle');
        const body = document.getElementById('tournamentResumeBody');
        const acceptBtn = document.getElementById('tournamentResumeAccept');
        const discardBtn = document.getElementById('tournamentResumeDiscard');
        const cancelBtn = document.getElementById('tournamentResumeCancel');

        title.textContent = 'Resume tournament?';
        const v = this.tournament.validateStateFile(state, currentFiles);
        const startedAgo = Math.round((Date.now() - state.createdAt) / 60000);
        // v2 payloads carry no history; read gamesPlayed (falls back to strategyState for legacy v1 files).
        const progress = state.gamesPlayed ?? state.strategyState?.gamesPlayed ?? 0;
        const totalGames = Math.floor(state.files.length / 2) * (state.options?.rounds ?? 3);
        let deltaNote = '';
        if (!v.valid) {
            deltaNote =
                `<p style="font-size:12px;color:#888">${v.removed.length} file(s) removed, ` +
                `${v.added.length} added since start — they'll be reconciled on continue.</p>`;
        }
        body.innerHTML =
            `<div class="modal-row"><span>Started:</span><span>${startedAgo} min ago</span></div>` +
            `<div class="modal-row"><span>Progress:</span><span>${progress}/${totalGames} games</span></div>` +
            deltaNote;
        acceptBtn.textContent = 'Continue';
        discardBtn.textContent = 'Start over';
        if (cancelBtn) cancelBtn.style.display = '';

        const cleanup = () => {
            modal.style.display = 'none';
            acceptBtn.onclick = null;
            discardBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
        };

        acceptBtn.onclick = async () => {
            const result = await this.tournament.handleResumeReconciled(state, currentFiles);
            cleanup();
            if (result?.ok) {
                if (result.removedCount > 0) {
                    this.showNotification(`Resumed — dropped ${result.removedCount} missing file(s)`, 'info');
                }
                await this._enterResumedTournamentUI();
            }
        };
        discardBtn.onclick = async () => {
            await this.tournament.handleDiscard();
            cleanup();
            this.showTournamentConfigModal();
        };
        // Cancel: don't enter tournament; the saved state stays on disk for next time.
        if (cancelBtn) {
            cancelBtn.onclick = async () => {
                cleanup();
                await this._applyModeSwitch('single');
            };
        }
        modal.style.display = 'flex';
    }

    exitTournamentMode() {
        this.isTournamentMode = false;
        const overlay = document.getElementById('tournamentOverlay');
        if (overlay) overlay.style.display = 'none';
        this.mediaContainer.classList.remove('tournament-mode');
        // Restore sort controls (hidden on entry) when a folder is loaded.
        if (this.mediaFiles.length > 0) {
            this.setSortControlsVisible(true);
        }
    }

    // Build round-1 seeding pairings by AI prediction (best-vs-worst).
    // Returns [[winnerCandidate, loserCandidate], ...] paths, or null if not enough scores.
    buildAiSeedingPairings() {
        if (this.predictionScores.size < 2 || this.mediaFiles.length < 2) return null;
        const ranked = this.mediaFiles
            .map((f) => ({ path: f.path, score: this.predictionScores.get(f.path) ?? 0.5 }))
            .sort((a, b) => b.score - a.score);
        const pairs = [];
        let i = 0;
        let j = ranked.length - 1;
        while (i < j) {
            pairs.push([ranked[i].path, ranked[j].path]);
            i++;
            j--;
        }
        // If odd N, ranked[i] === ranked[j] is the middle file → bye (handled by engine).
        return pairs;
    }

    showTournamentConfigModal() {
        const modal = document.getElementById('tournamentConfigModal');
        const folderEl = document.getElementById('tournamentConfigFolder');
        const roundsSelect = document.getElementById('tournamentRoundsSelect');
        const seedingSelect = document.getElementById('tournamentSeedingSelect');
        const estimateEl = document.getElementById('tournamentConfigEstimate');
        const startBtn = document.getElementById('tournamentConfigStart');
        const cancelBtn = document.getElementById('tournamentConfigCancel');

        folderEl.textContent = `${this.baseFolderPath ?? '(no folder)'} (${this.mediaFiles.length} files)`;

        // Configure the AI seeding option: enabled only when prediction scores exist.
        const aiOpt = seedingSelect?.querySelector('option[value="ai"]');
        const aiAvailable = this.predictionScores.size >= 2;
        if (aiOpt) {
            aiOpt.disabled = !aiAvailable;
            aiOpt.textContent = 'AI prediction (best vs worst)';
            if (!aiAvailable && seedingSelect.value === 'ai') seedingSelect.value = 'random';
        }

        // Explain the selected seeding, and (when AI is greyed out) how to enable it. Sorting is
        // disabled inside tournament mode, so the user must score files BEFORE entering.
        const seedingHint = document.getElementById('tournamentSeedingHint');
        const updateSeedingHint = () => {
            if (!seedingHint) return;
            const scored = this.predictionScores.size;
            const total = this.mediaFiles.length;
            if (seedingSelect.value === 'ai') {
                seedingHint.textContent = `Pairs highest- vs lowest-predicted files in round 1 (${scored}/${total} scored).`;
            } else if (!aiAvailable) {
                seedingHint.textContent =
                    'Tip: “AI prediction” needs scores — exit tournament, click “Sort by Predicted”, then start again.';
            } else {
                seedingHint.textContent = 'Round 1 pairs are shuffled at random.';
            }
        };
        seedingSelect.onchange = updateSeedingHint;
        updateSeedingHint();

        // Clamp the rounds value to [1, 50]; falls back to 3 on empty/NaN.
        const readRounds = () => {
            const raw = parseInt(roundsSelect.value, 10);
            if (!Number.isFinite(raw)) return 3;
            return Math.max(1, Math.min(50, raw));
        };

        const updateEstimate = () => {
            const R = readRounds();
            const N = this.mediaFiles.length;
            const games = Math.floor(N / 2) * R;
            const minutes = Math.ceil((games * 5) / 60);
            estimateEl.textContent = `${N} files → ${R + 1} tier folders · ~${games} games (~${minutes} min)`;
        };
        // 'input' fires as user types; 'change' fires on commit (covers paste, arrow buttons, blur).
        roundsSelect.oninput = updateEstimate;
        roundsSelect.onchange = updateEstimate;
        // Enter in the input starts the tournament; Escape cancels.
        roundsSelect.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                startBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
        };
        updateEstimate();

        startBtn.disabled = this.mediaFiles.length < 2;

        const cleanup = () => {
            modal.style.display = 'none';
            startBtn.onclick = null;
            cancelBtn.onclick = null;
            roundsSelect.oninput = null;
            roundsSelect.onchange = null;
            roundsSelect.onkeydown = null;
            seedingSelect.onchange = null;
        };

        startBtn.onclick = async () => {
            const R = readRounds();
            const seedMode = seedingSelect?.value ?? 'random';
            const opts = {};
            if (seedMode === 'ai') {
                const pairs = this.buildAiSeedingPairings();
                if (pairs && pairs.length > 0) {
                    opts.seedingPairings = pairs;
                } else {
                    this.showNotification('AI seeding unavailable — falling back to random', 'info');
                }
            }
            cleanup();
            const ok = await this.tournament.handleStartClick(this.baseFolderPath, R, opts);
            if (ok) {
                this.isTournamentMode = true;
                this.mediaContainer.classList.add('tournament-mode');
                this.setSortControlsVisible(false);
                document.getElementById('tournamentOverlay').style.display = 'block';
                await this.showTournamentPair();
            } else {
                this.switchMode('single');
            }
        };

        cancelBtn.onclick = () => {
            cleanup();
            this.switchMode('single');
        };

        modal.style.display = 'flex';
        // Focus the input so the user can immediately type a custom value
        setTimeout(() => roundsSelect.focus(), 0);
    }

    async showTournamentPair(_pruneDepth = 0) {
        if (!this.isTournamentMode || !this.tournament.engine) return;

        if (this.tournament.engine.isComplete()) {
            this.showTournamentSummaryModal();
            return;
        }

        const pair = this.tournament.engine.getCurrentPair();
        if (!pair) {
            this.showTournamentSummaryModal();
            return;
        }

        document.getElementById('tournamentProgress').textContent = this.tournament.getProgressText();
        document.getElementById('tournamentTiers').textContent = this.tournament.getTierBreakdownText();

        const leftIdx = this.getMediaIndex(pair.left);
        const rightIdx = this.getMediaIndex(pair.right);

        if (leftIdx === -1 || rightIdx === -1) {
            const missing = leftIdx === -1 ? pair.left : pair.right;
            // Capture net: unreachable after reconcileWithFiles (see _enterResumedTournamentUI).
            // If it still fires, the engine/mediaFiles diverged — log the shape so a real 24k
            // repro is diagnosable in media-viewer.log, then prune + retry (bounded).
            const absent = this.tournament.engine.files.filter((f) => this.getMediaIndex(f) === -1).length;
            window.electronAPI.logError?.(
                `Tournament divergence: pair file absent from mediaFiles. ` +
                    `engineFiles=${this.tournament.engine.files.length} mediaFiles=${this.mediaFiles.length} ` +
                    `absentEngineFiles=${absent} ` +
                    `sorted=${this.isSortedByPrediction || this.isSortedBySimilarity} sample=${missing}`
            );
            this.showNotification(`File missing — removed from tournament: ${missing}`, 'warning');
            this.tournament.engine.removeFile(missing);
            this.tournament._schedulePersist(this.baseFolderPath);
            // Bound the retry: each retry removes exactly one engine file, so recursion is
            // naturally bounded by the engine size; the depth cap is belt-and-suspenders against
            // an engine that can never resolve a present pair (fall to the summary instead).
            if (_pruneDepth > this.mediaFiles.length + 1) {
                this.showTournamentSummaryModal();
                return;
            }
            return this.showTournamentPair(_pruneDepth + 1);
        }

        // Reuse compare-mode rendering: temporarily activate compare layout w/o the binary toggle
        if (!this.isCompareMode) {
            // Tear down single-mode media before switching layouts (toggleViewMode does this normally)
            if (this.currentMedia) {
                this.cleanupCurrentMedia();
            }
            this.isCompareMode = true;
            this.controls.style.display = 'none';
            this.compareControls.style.display = 'none';
            this.mediaContainer.classList.add('compare-mode');
            this.videoControls.style.display = 'none';
            this.hideFileInfo();
            if (this.infoToggleBtn) this.infoToggleBtn.style.display = 'none';
        }
        // Keep tournament-mode class so the tournament-specific CSS overrides apply
        this.mediaContainer.classList.add('tournament-mode');

        this.leftFileIndex = leftIdx;
        this.rightFileIndex = rightIdx;
        // Force showCompareMedia to display the engine-selected pair (overrides currentIndex-based selection)
        this._restoredPairFiles = { left: this.mediaFiles[leftIdx], right: this.mediaFiles[rightIdx] };
        if (typeof this.showCompareMedia === 'function') {
            await this.showCompareMedia();
        }
    }

    async handleTournamentPick(winner, loser) {
        if (!this.isTournamentMode || this.isLoading) return;
        this.signalUserActivity();
        try {
            await this.tournament.handlePairResult(winner, loser);
        } catch (err) {
            window.electronAPI.logError('Tournament pick failed: ' + (err && err.message ? err.message : err));
        }
        await this.showTournamentPair();
    }

    async handleTournamentDraw(outcome) {
        if (!this.isTournamentMode || this.isLoading || !this.tournament.engine) return;
        this.signalUserActivity();
        const pair = this.tournament.engine.getCurrentPair();
        if (!pair) return;
        try {
            await this.tournament.handlePairDraw(pair.left, pair.right, outcome);
            // Confirmation toast lives INSIDE the try: only show "recorded" after the
            // draw actually persisted. A thrown record (e.g. stale pair) must NOT show a
            // false success toast — it falls to the catch, and showTournamentPair below
            // still advances the UI regardless.
            if (this.showRatingConfirmations) {
                this.showNotification(
                    outcome === 'win' ? '🤝 Both advance (tie)' : '👎 Both stay (tie)',
                    outcome === 'win' ? 'success' : 'info'
                );
            }
        } catch (err) {
            window.electronAPI.logError('Tournament draw failed: ' + (err && err.message ? err.message : err));
        }
        await this.showTournamentPair();
    }

    async handleTournamentUndo() {
        if (!this.isTournamentMode || !this.tournament.engine) return;

        // If the last action was a special-folder move (recorded by moveToSpecialFolder), the
        // file was physically moved AND removed from the engine AND its caches were cleared by
        // removeFileFromList. Engine.removeFile is not history-tracked, so a plain engine.undo()
        // can't recover from it. Mirror handleCancel's special branch: restore the file on disk,
        // re-add to engine.files, restore feature caches (PR #35 contract), pop moveHistory.
        const lastMove = this.moveHistory[this.moveHistory.length - 1];
        if (lastMove?.actionType === 'special') {
            this.moveHistory.pop();
            try {
                const moveResult = await window.electronAPI.moveFile({
                    sourcePath: lastMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: lastMove.fileName,
                });
                if (!moveResult.success) {
                    throw new Error(moveResult.error);
                }
                const restoredFile = {
                    name: lastMove.fileName,
                    path: lastMove.originalPath,
                    size: lastMove.fileSize,
                    type: lastMove.fileType,
                };
                this.mediaFiles.push(restoredFile);
                // Re-add to engine.files; engine.removeFile was not history-tracked.
                if (!this.tournament.engine.files.includes(restoredFile.path)) {
                    this.tournament.engine.files.push(restoredFile.path);
                }
                this.restoreFeatureCachesFromHistory(lastMove);
                if (this.isSortedByPrediction) this.requestPredictionScores();
                this.tournament._schedulePersist(this.baseFolderPath);
                if (this.showRatingConfirmations) {
                    this.showNotification(`✅ Restored ${lastMove.fileName}`, 'success');
                }
                this.updateFolderInfo();
                await this.showTournamentPair();
            } catch (error) {
                console.error('Error undoing tournament special:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(lastMove);
            }
            return;
        }

        // Default: undo the engine's last pair-pick (snapshot-restored strategy state).
        this.tournament.engine.undo();
        this.tournament._schedulePersist(this.baseFolderPath);
        await this.showTournamentPair();
    }

    async handleTournamentSpecial(side) {
        if (!this.isTournamentMode || !this.tournament.engine) return;
        // moveToSpecialFolder handles engine sync + showTournamentPair when isTournamentMode (see Navigate branch)
        await this.moveToSpecialFolder(side);
    }

    showTournamentSummaryModal() {
        const modal = document.getElementById('tournamentSummaryModal');
        const body = document.getElementById('tournamentSummaryBody');
        const applyBtn = document.getElementById('tournamentSummaryApply');
        const discardBtn = document.getElementById('tournamentSummaryDiscard');
        const undoBtn = document.getElementById('tournamentSummaryUndo');

        const bd = this.tournament.engine.getTierBreakdown();
        const maxCount = Math.max(...Object.values(bd), 1);
        const R = this.tournament.engine.strategy.options.rounds;

        const rows = [];
        for (let i = R; i >= 0; i--) {
            const count = bd[i] ?? 0;
            const pct = Math.round((count / maxCount) * 100);
            rows.push(
                `<div class="tier-row">` +
                    `<span>Tier-${i}</span>` +
                    `<div class="tier-bar"><div class="tier-bar-fill" style="width:${pct}%"></div></div>` +
                    `<span>${count} files</span>` +
                    `</div>`
            );
        }
        body.innerHTML =
            rows.join('') +
            `<p style="font-size:12px;margin-top:12px;color:#888">` +
            `→ Files will move into _Tier-{0..${R}}/ inside ${this.baseFolderPath}</p>`;

        const cleanup = () => {
            modal.style.display = 'none';
            applyBtn.onclick = null;
            discardBtn.onclick = null;
            if (undoBtn) undoBtn.onclick = null;
        };

        if (undoBtn) {
            // Enable only if there's a pick to undo
            undoBtn.disabled = (this.tournament.engine?.history?.length ?? 0) === 0;
            undoBtn.onclick = async () => {
                cleanup();
                await this.handleTournamentUndo();
            };
        }

        applyBtn.onclick = async () => {
            const result = await this.tournament.handleApply();
            cleanup();
            if (result.success) {
                this.showNotification(`Moved ${result.moved} files into tier folders`, 'success');
                this.exitTournamentMode();
                // Reload first so mediaFiles + UI reflect the now-empty top-level folder,
                // then switchMode (no media to show → drop zone already visible).
                if (this.baseFolderPath) await this.loadFolder(this.baseFolderPath);
                await this.switchMode('single');
            } else {
                this.showNotification(
                    `Apply failed: ${result.failed?.length ?? 0} files (${result.error ?? 'unknown'})`,
                    'error'
                );
            }
        };

        discardBtn.onclick = async () => {
            await this.tournament.handleDiscard();
            cleanup();
            this.exitTournamentMode();
            await this.switchMode('single');
            this.showNotification('Tournament results discarded', 'info');
        };

        modal.style.display = 'flex';
    }

    // Shared UI setup for entering a resumed tournament.
    async _enterResumedTournamentUI() {
        this.isTournamentMode = true;
        this.mediaContainer.classList.add('tournament-mode');
        this.setSortControlsVisible(false);
        document.getElementById('tournamentOverlay').style.display = 'block';
        document.querySelectorAll('.mode-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === 'tournament');
        });
        // Defensive reconciliation: guarantees every engine pair resolves to a present index.
        // The disk-resume path already reconciled in handleResumeReconciled; this ALSO covers
        // the live-engine fast-path (enterTournamentMode ~4149, which skips reconciliation) and
        // is idempotent on the disk path. Root fix for "cannot enter after add-media + AI sort".
        this.tournament.reconcileWithFiles(this.mediaFiles.map((f) => f.path));
        await this.showTournamentPair();
    }

    // Compare mode methods
    async toggleViewMode() {
        // Hide prediction badges before switching modes
        this.hidePredictionBadges();

        this.closeAllZoomPopovers();

        // Clean up media from previous mode before switching
        if (this.isCompareMode) {
            // Switching FROM compare TO single - clean up compare media
            if (this.leftMedia) {
                await this.cleanupCompareMedia('left');
            }
            if (this.rightMedia) {
                await this.cleanupCompareMedia('right');
            }
            if (this.leftMediaWrapper) {
                this.fullscreen.cleanup(this.leftMediaWrapper);
                this.leftMediaWrapper.remove();
                this.leftMediaWrapper = null;
            }
            if (this.rightMediaWrapper) {
                this.fullscreen.cleanup(this.rightMediaWrapper);
                this.rightMediaWrapper.remove();
                this.rightMediaWrapper = null;
            }
        } else {
            // Switching FROM single TO compare - clean up single media
            if (this.currentMedia) {
                this.cleanupCurrentMedia();
            }
        }

        this.isCompareMode = !this.isCompareMode;

        if (this.isCompareMode) {
            this.viewModeLabel.textContent = 'Compare';
            this.controls.style.display = 'none';
            this.compareControls.style.display = 'none'; // Hide old bottom controls (now using overlay controls)
            this.mediaContainer.classList.add('compare-mode');
            // Hide custom video controls in compare mode (videos will have native browser controls)
            this.videoControls.style.display = 'none';
            // Hide main file info panel and toggle button in compare mode
            this.hideFileInfo();
            if (this.infoToggleBtn) {
                this.infoToggleBtn.style.display = 'none';
            }
        } else {
            this.switchToSingleModeUI();
        }

        // Small delay to ensure cleanup is complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Reload media in new mode
        if (this.mediaFiles.length > 0) {
            this.currentIndex = 0;
            this.showMedia();
        }
    }

    async _tournamentPickFromSide(winnerSide) {
        const pair = this.tournament.engine?.getCurrentPair();
        if (!pair) return;
        const winner = winnerSide === 'left' ? pair.left : pair.right;
        const loser = winnerSide === 'left' ? pair.right : pair.left;
        await this.handleTournamentPick(winner, loser);
    }

    async handleLeftLike() {
        if (this.mediaFiles.length < 2 || this.isLoading || this.mediaNavigationInProgress) return;
        this.signalUserActivity();
        if (this.isTournamentMode) return this._tournamentPickFromSide('left');
        // Left is liked, right is disliked
        await this.moveComparePair('left', 'like', 'dislike');
    }

    async handleLeftDislike() {
        if (this.mediaFiles.length < 2 || this.isLoading || this.mediaNavigationInProgress) return;
        this.signalUserActivity();
        if (this.isTournamentMode) return this._tournamentPickFromSide('right');
        // Left is disliked, right is liked
        await this.moveComparePair('left', 'dislike', 'like');
    }

    async handleRightLike() {
        if (this.mediaFiles.length < 2 || this.isLoading || this.mediaNavigationInProgress) return;
        this.signalUserActivity();
        if (this.isTournamentMode) return this._tournamentPickFromSide('right');
        // Right is liked, left is disliked
        await this.moveComparePair('right', 'like', 'dislike');
    }

    async handleRightDislike() {
        if (this.mediaFiles.length < 2 || this.isLoading || this.mediaNavigationInProgress) return;
        this.signalUserActivity();
        if (this.isTournamentMode) return this._tournamentPickFromSide('left');
        // Right is disliked, left is liked
        await this.moveComparePair('right', 'dislike', 'like');
    }

    async moveComparePair(primarySide, primaryAction, secondaryAction) {
        if (this.isLoading) return;
        if (!this.areFoldersConfigured()) {
            this.showNotification('Configure like/dislike folders in Settings (F1)', 'error');
            return;
        }

        // Use stored file references (set by showCompareMedia)
        const leftFile = this.compareLeftFile;
        const rightFile = this.compareRightFile;

        if (!leftFile || !rightFile) return;

        // Find indices for removal
        const leftFileIndex = this.mediaFiles.findIndex((f) => f.path === leftFile.path);
        const rightFileIndex = this.mediaFiles.findIndex((f) => f.path === rightFile.path);

        if (leftFileIndex === -1 || rightFileIndex === -1) {
            console.error('Could not find files in mediaFiles array');
            return;
        }

        // Get cached ML features, with fallback extraction from displayed media
        let leftFeatures = null;
        let rightFeatures = null;
        if (this.isMlEnabled && this.mlWorker) {
            leftFeatures = this.featureCache.get(leftFile.path);
            rightFeatures = this.featureCache.get(rightFile.path);

            // Fallback: extract from displayed media if not cached (must happen before cleanup)
            if (!leftFeatures && this.leftMedia) {
                try {
                    console.log('[ML Debug] Fallback extraction for left:', leftFile.name);
                    leftFeatures = await this.extractFeaturesFromMediaElement(this.leftMedia);
                    if (leftFeatures) {
                        this.featureCache.set(leftFile.path, leftFeatures);
                        this.featureCacheDirty = true;
                        const leftInfo = this.mediaFiles.find((f) => f.path === leftFile.path);
                        if (leftInfo) {
                            this.featureMetadata.set(leftFile.path, {
                                size: leftInfo.size,
                                mtime: leftInfo.mtimeMs || 0,
                            });
                        }
                        console.log('[ML Debug] Left features extracted successfully');
                    }
                } catch (err) {
                    console.warn('[ML Debug] Could not extract left features:', err);
                }
            }
            if (!rightFeatures && this.rightMedia) {
                try {
                    console.log('[ML Debug] Fallback extraction for right:', rightFile.name);
                    rightFeatures = await this.extractFeaturesFromMediaElement(this.rightMedia);
                    if (rightFeatures) {
                        this.featureCache.set(rightFile.path, rightFeatures);
                        this.featureCacheDirty = true;
                        const rightInfo = this.mediaFiles.find((f) => f.path === rightFile.path);
                        if (rightInfo) {
                            this.featureMetadata.set(rightFile.path, {
                                size: rightInfo.size,
                                mtime: rightInfo.mtimeMs || 0,
                            });
                        }
                        console.log('[ML Debug] Right features extracted successfully');
                    }
                } catch (err) {
                    console.warn('[ML Debug] Could not extract right features:', err);
                }
            }

            // Use combined features (64-dim basic + 512-dim CLIP) for ML pipeline
            const leftCombined = this.getCombinedFeatures(leftFile.path);
            leftFeatures = leftCombined || (leftFeatures ? Array.from(leftFeatures) : null);
            const rightCombined = this.getCombinedFeatures(rightFile.path);
            rightFeatures = rightCombined || (rightFeatures ? Array.from(rightFeatures) : null);

            // Debug: log feature status
            console.log(
                '[ML Debug] Rating pair - Left features:',
                leftFeatures ? 'YES' : 'NO',
                '| Right features:',
                rightFeatures ? 'YES' : 'NO'
            );
        }

        try {
            // Cleanup both media in parallel before moving
            const cleanupPromises = [];
            if (this.leftMedia) {
                cleanupPromises.push(this.cleanupCompareMedia('left'));
            }
            if (this.rightMedia) {
                cleanupPromises.push(this.cleanupCompareMedia('right'));
            }
            await Promise.all(cleanupPromises);
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Move primary file (the one being rated)
            const primaryFile = primarySide === 'left' ? leftFile : rightFile;
            const primaryFolderPath = primaryAction === 'like' ? this.customLikeFolder : this.customDislikeFolder;
            const primaryFolderName = window.electronAPI.path.basename(primaryFolderPath);

            let folderExists = await window.electronAPI.checkFolderExists(primaryFolderPath);
            if (!folderExists) {
                const shouldCreate = await this.showFolderCreationDialog(primaryFolderPath);
                if (!shouldCreate) return;
                const createResult = await window.electronAPI.createFolder(primaryFolderPath);
                if (!createResult.success) {
                    throw new Error(createResult.error);
                }
            }

            const primaryMoveResult = await window.electronAPI.moveFile({
                sourcePath: primaryFile.path,
                targetFolder: primaryFolderPath,
                fileName: primaryFile.name,
            });

            if (!primaryMoveResult.success) {
                throw new Error(primaryMoveResult.error);
            }

            // Store primary move in history (include ML features for reversal)
            const primaryFeatures = primarySide === 'left' ? leftFeatures : rightFeatures;
            this.moveHistory.push({
                fileName: primaryFile.name,
                originalPath: primaryFile.path,
                newPath: primaryMoveResult.targetPath,
                fileSize: primaryFile.size,
                fileType: primaryFile.type,
                actionType: primaryAction,
                mlFeatures: primaryFeatures ? Array.from(primaryFeatures) : null,
                compareMode: true,
            });

            // Move secondary file (the other one)
            const secondaryFile = primarySide === 'left' ? rightFile : leftFile;
            const secondaryFolderPath = secondaryAction === 'like' ? this.customLikeFolder : this.customDislikeFolder;
            const secondaryFolderName = window.electronAPI.path.basename(secondaryFolderPath);

            folderExists = await window.electronAPI.checkFolderExists(secondaryFolderPath);
            if (!folderExists) {
                const createResult = await window.electronAPI.createFolder(secondaryFolderPath);
                if (!createResult.success) {
                    throw new Error(createResult.error);
                }
            }

            const secondaryMoveResult = await window.electronAPI.moveFile({
                sourcePath: secondaryFile.path,
                targetFolder: secondaryFolderPath,
                fileName: secondaryFile.name,
            });

            if (!secondaryMoveResult.success) {
                throw new Error(secondaryMoveResult.error);
            }

            // Store secondary move in history (include ML features for reversal)
            const secondaryFeatures = primarySide === 'left' ? rightFeatures : leftFeatures;
            this.moveHistory.push({
                fileName: secondaryFile.name,
                originalPath: secondaryFile.path,
                newPath: secondaryMoveResult.targetPath,
                fileSize: secondaryFile.size,
                fileType: secondaryFile.type,
                actionType: secondaryAction,
                mlFeatures: secondaryFeatures ? Array.from(secondaryFeatures) : null,
                compareMode: true,
            });

            // Show notifications (if enabled)
            if (this.showRatingConfirmations) {
                const primaryFileName =
                    primaryFile.name.length > 20 ? primaryFile.name.substring(0, 20) + '...' : primaryFile.name;
                const secondaryFileName =
                    secondaryFile.name.length > 20 ? secondaryFile.name.substring(0, 20) + '...' : secondaryFile.name;

                this.showNotification(
                    `${primaryAction === 'like' ? '👍' : '👎'} ${primaryFileName} → ${primaryFolderName}`,
                    primaryAction === 'like' ? 'success' : 'dislike'
                );
                this.showNotification(
                    `${secondaryAction === 'like' ? '👍' : '👎'} ${secondaryFileName} → ${secondaryFolderName}`,
                    secondaryAction === 'like' ? 'success' : 'dislike'
                );
            }

            // Update ML model with both ratings (using pre-extracted features from earlier)
            const mlSortedCompare = this.isSortedByPrediction && this.isCompareMode;

            if (primaryFeatures) {
                this.updateMlModelWithFeatures(primaryFeatures, primaryAction);
            }
            if (secondaryFeatures) {
                this.updateMlModelWithFeatures(secondaryFeatures, secondaryAction);
            }

            // Remove both files from current view and clean up caches
            this.removeFileFromList(leftFile.path);
            this.removeFileFromList(rightFile.path);

            // Clear stored file references
            this.compareLeftFile = null;
            this.compareRightFile = null;

            // Reset ML pair index to show new highest vs lowest
            this.mlComparePairIndex = 0;

            // TASK-022: Clean switch to single mode when <2 files remain
            if (this.mediaFiles.length < 2) {
                // Reset state flags
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
                this.hideLoadingSpinner();

                // Clear pending ML state
                if (this.pendingCompareTimeout) {
                    clearTimeout(this.pendingCompareTimeout);
                    this.pendingCompareTimeout = null;
                }
                this.pendingCompareRefresh = false;
                this.pendingCompareUpdates = 0;
                this.previousScores = null;

                // switchToSingleModeUI() tears down the stale compare wrappers.
                this.switchToSingleModeUI();
                this.updateFolderInfo();

                if (this.mediaFiles.length === 1) {
                    this.showNotification('Last pair rated — switched to single view', 'info');
                    this.currentIndex = 0;
                    await this.showMedia();
                } else {
                    this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                    this.showEmptyStateWithUndo();
                }
                return;
            }

            // Ensure current index can show a pair
            if (this.currentIndex >= this.mediaFiles.length - 1) {
                this.currentIndex = 0;
            }

            this.updateFolderInfo();

            // If ML-sorted compare mode, defer showMedia() until re-score completes
            if (mlSortedCompare && primaryFeatures && secondaryFeatures) {
                // Clear any existing pending state from a prior rating
                if (this.pendingCompareTimeout) {
                    clearTimeout(this.pendingCompareTimeout);
                    this.pendingCompareTimeout = null;
                }
                // Snapshot scores BEFORE re-score for delta notification
                if (this.predictionScores.size > 0) {
                    this.previousScores = new Map(this.predictionScores);
                }
                this.pendingCompareRefresh = true;
                this.pendingCompareUpdates = 2;
                // Keep mediaNavigationInProgress true to block spurious showMedia() calls
                this.mediaNavigationInProgress = true;
                // Fallback timeout: show with stale scores after 3s rather than blocking forever
                this.pendingCompareTimeout = setTimeout(() => {
                    if (this.pendingCompareRefresh) {
                        console.warn('[ML Debug] Re-score timeout — showing pair with stale scores');
                        this.pendingCompareRefresh = false;
                        this.pendingCompareUpdates = 0;
                        this.pendingCompareTimeout = null;
                        this.previousScores = null;
                        this.mediaNavigationInProgress = false;
                        this.showMedia();
                    }
                }, 3000);
            } else {
                await this.showMedia();
            }
        } catch (error) {
            console.error('Error moving compare files:', error);
            this.showError(`Failed to move files: ${error.message}`);
        }
    }

    async cleanupCompareMedia(side) {
        const media = side === 'left' ? this.leftMedia : this.rightMedia;
        const listeners = side === 'left' ? this.videoEventListenersLeft : this.videoEventListenersRight;

        if (!media) return;

        // Clean up zoom popover and its document-level listeners (AbortController)
        this.removeZoomPopover(side);

        this.isBeingCleaned = true;

        // Remove event listeners
        listeners.forEach(({ event, handler }) => {
            media.removeEventListener(event, handler);
        });

        if (side === 'left') {
            this.videoEventListenersLeft = [];
        } else {
            this.videoEventListenersRight = [];
        }

        if (media.tagName === 'VIDEO') {
            media.pause();
            media.currentTime = 0;
            media.removeAttribute('src');
            media.load();
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (media.parentNode) {
            media.remove();
        }

        if (side === 'left') {
            this.leftMedia = null;
        } else {
            this.rightMedia = null;
        }

        this.isBeingCleaned = false;

        // Release any object URLs created for decoded JXL frames
        this.revokeJxlObjectURLs();
    }

    // Visual Similarity Sorting Functions

    async handleSortBySimilarity(forceResort = false) {
        // Sorting is disabled in tournament mode (strict/deterministic) — exit first to sort.
        if (this.isTournamentMode) return;
        // If currently computing, cancel the operation
        if (this.isComputingHashes && this.sortAbortController) {
            this.sortAbortController.abort();
            this.showNotification('❌ Sorting cancelled', 'info');
            return;
        }

        if (this.isComputingHashes) {
            this.showNotification('⏳ Hash computation already in progress', 'info');
            return;
        }

        if (this.mediaFiles.length < 2) {
            this.showNotification('Need at least 2 media files to sort', 'error');
            return;
        }

        // Warn about large datasets (skipped when already sorted, including force re-sort)
        if (this.mediaFiles.length > 1000 && !this.isSortedBySimilarity) {
            const cacheFile = `${this.baseFolderPath}\\.hash_cache.json`;
            const confirmed = confirm(
                `Sorting ${this.mediaFiles.length} files may take a very long time and could freeze the application.\n\n` +
                    `Consider sorting smaller folders (recommended: < 1000 files).\n\n` +
                    `Hash data will be cached at:\n${cacheFile}\n\n` +
                    `Continue anyway?`
            );
            if (!confirmed) {
                return;
            }
        }

        // Toggle sorting (skip restore when force re-sorting)
        if (this.isSortedBySimilarity && !forceResort) {
            // Restore original order
            this.mediaFiles = [...this.originalMediaFiles];
            this.isSortedBySimilarity = false;
            this.currentIndex = 0;
            await this.showMedia();
            this.showNotification('📋 Restored original order', 'success');
            this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Sort by Similarity';
            return;
        }

        const wasAlreadySorted = this.isSortedBySimilarity;

        try {
            this.isComputingHashes = true;
            this.sortAbortController = new AbortController();
            this.sortSimilarityBtn.disabled = true;
            this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Cancel';
            this.sortSimilarityBtn.disabled = false; // Re-enable for cancel

            // Save original order (preserve existing snapshot when force re-sorting,
            // so "Restore Order" always returns to the true disk order)
            if (!wasAlreadySorted) {
                this.originalMediaFiles = [...this.mediaFiles];
            }

            const algorithmNames = {
                vptree: 'VP-Tree (fastest)',
                mst: 'MST (best quality)',
                simple: 'Simple (limited)',
                clip: 'CLIP (semantic)',
            };
            const algorithmName = algorithmNames[this.sortAlgorithm] || this.sortAlgorithm;

            // Force re-sort: delete cached order and skip cache lookup
            if (forceResort) {
                this.showNotification('🔄 Force re-sorting, ignoring cache...', 'info');
                await this.deleteSortCache(this.sortAlgorithm);
            }

            // Check for cached sort order first (bypassed when force re-sorting)
            const cachedSortData = forceResort ? null : await this.loadSortCache(this.sortAlgorithm);
            if (cachedSortData && cachedSortData.sortedPaths.length > 0) {
                this.updateSortProgress({ phase: 'Loading cached sort order…' });

                // Load hash cache for inserting new files
                await this.loadHashCache();

                // Apply cached order — pass current sortAlgorithm explicitly so the
                // algorithm threads through to insertNewFilesInSortedOrder even if the
                // cached entry was written before the algorithm field existed (older caches).
                const stats = await this.applyCachedSortOrder(cachedSortData, this.sortAlgorithm);

                // Save updated hash cache if new files were processed
                if (stats.added > 0) {
                    await this.saveHashCache();
                    // Update sort cache with new files included
                    const currentFile = this.mediaFiles[0];
                    await this.saveSortCache(
                        this.sortAlgorithm,
                        this.mediaFiles.map((f) => f.path),
                        currentFile ? currentFile.path : null
                    );
                }

                // Sorting completed from cache!
                this.isSortedBySimilarity = true;
                this.currentIndex = 0;
                this.clearProgressNotification();

                // Show success notification with cache stats
                let message = `✅ Restored cached ${algorithmName} order`;
                const details = [];
                if (stats.cached > 0) details.push(`${stats.cached} cached`);
                if (stats.added > 0) details.push(`${stats.added} new`);
                if (stats.removed > 0) details.push(`${stats.removed} removed`);
                if (details.length > 0) message += ` (${details.join(', ')})`;
                if (typeof cachedSortData.timestamp === 'number') {
                    message += ` — cached ${this.formatTimeAgo(cachedSortData.timestamp)}`;
                }
                this.showNotification(message, 'success');

                this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Restore Order';
            } else {
                // No cache - perform full sorting
                let sortedPaths;
                let sortedCount;

                if (this.sortAlgorithm === 'clip') {
                    // CLIP semantic sorting — uses clipCache, no hash computation
                    if (!this.enableClipFeatures) {
                        throw new Error('CLIP features are disabled. Enable in Settings (F1) to use semantic sorting.');
                    }

                    // Lazy extraction (Group P3): vectors are no longer pre-warmed on folder open.
                    // If any current file lacks an in-memory CLIP vector, extract now and wait —
                    // kickoff loads the cache + model and runs extraction to completion (cancelable
                    // progress card). Gated so a repeat CLIP sort (vectors already cached) skips the
                    // ~40s feature-cache reload.
                    if (this.clipVectorsNeedExtraction()) {
                        await this.kickoffBackgroundExtractionIfEnabled();
                    }

                    // Collect CLIP vectors from clipCache (Float32Array → plain Array for postMessage serialization)
                    const clipVectors = {};
                    let vectorCount = 0;
                    for (const file of this.mediaFiles) {
                        const vec = this.clipCache.get(file.path);
                        if (vec) {
                            clipVectors[file.path] = Array.from(vec);
                            vectorCount++;
                        }
                    }

                    if (vectorCount < 2) {
                        throw new Error(
                            `Only ${vectorCount} files have CLIP embeddings. Wait for background extraction to complete, then retry.`
                        );
                    }

                    this.showNotification(
                        `🧠 Using CLIP embeddings for ${vectorCount} files (${this.mediaFiles.length - vectorCount} without vectors appended at end)`,
                        'info'
                    );

                    this.updateSortProgress({ phase: `Sorting with ${algorithmName}…` });

                    if (this.sortAbortController.signal.aborted) {
                        throw new Error('Sorting cancelled by user');
                    }

                    sortedPaths = await this.runSortingWorker({
                        algorithm: 'clip',
                        mediaFiles: this.mediaFiles.map((f) => ({ path: f.path })),
                        clipVectors,
                        currentIndex: this.currentIndex,
                    });

                    sortedCount = vectorCount;
                } else {
                    // Hash-based sorting (vptree, mst, simple)
                    // Load cached hashes
                    const cachedCount = await this.loadHashCache();

                    // Show cache location (one notification)
                    const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.hash_cache.json');
                    this.showNotification(`💾 Cache: ${cacheFile} (${cachedCount} hashes loaded)`, 'info');

                    // Start progress notification
                    this.updateSortProgress({ phase: 'Starting hash computation…' });

                    let processed = 0;
                    let newHashes = 0;
                    let skipped = 0;
                    const total = this.mediaFiles.length;

                    for (const file of this.mediaFiles) {
                        // Check for abort
                        if (this.sortAbortController.signal.aborted) {
                            throw new Error('Sorting cancelled by user');
                        }

                        processed++;

                        if (!this.perceptualHashes.has(file.path)) {
                            try {
                                const hash = await this.computePerceptualHash(file.path);
                                this.perceptualHashes.set(file.path, hash);
                                newHashes++;

                                // Update progress every 5 files or at end
                                if (processed % 5 === 0 || processed === total) {
                                    this.updateSortProgress({
                                        phase: `Computing hashes (${newHashes} new, ${skipped} skipped)`,
                                        current: processed,
                                        total,
                                    });
                                }
                            } catch (error) {
                                console.error(`Failed to compute hash for ${file.path}:`, error);
                                skipped++;
                                // Update progress notification instead of showing separate warning
                                if (processed % 5 === 0 || processed === total) {
                                    this.updateSortProgress({
                                        phase: `Computing hashes (${newHashes} new, ${skipped} skipped)`,
                                        current: processed,
                                        total,
                                    });
                                }
                            }
                        }
                    }

                    // Check if we have enough hashes to sort
                    const filesWithHashes = this.mediaFiles.filter((f) => this.perceptualHashes.has(f.path));
                    if (filesWithHashes.length < 2) {
                        throw new Error(
                            `Only ${filesWithHashes.length} files have valid hashes. Need at least 2 to sort.`
                        );
                    }

                    // Save hash cache
                    await this.saveHashCache();

                    // For Simple algorithm, show K value as separate notification
                    if (this.sortAlgorithm === 'simple') {
                        const savedK = localStorage.getItem('sortKValue');
                        const kValue = savedK ? parseInt(savedK, 10) : 500;
                        const maxK = filesWithHashes.length - 1;
                        const actualK = Math.min(kValue, maxK);
                        this.showNotification(`🔢 Using K=${actualK} neighbors per file (max: ${maxK})`, 'info');
                    }

                    this.updateSortProgress({ phase: `Sorting with ${algorithmName}…` });

                    // Get K value for simple algorithm
                    const savedK = localStorage.getItem('sortKValue');
                    const kValue = savedK ? parseInt(savedK, 10) : 500;

                    // Delegate sorting to Web Worker to prevent UI freeze when minimized
                    sortedPaths = await this.runSortingWorker({
                        algorithm: this.sortAlgorithm,
                        mediaFiles: this.mediaFiles.map((f) => ({ path: f.path })),
                        hashes: Object.fromEntries(this.perceptualHashes),
                        currentIndex: this.currentIndex,
                        maxComparisons: kValue,
                    });

                    sortedCount = filesWithHashes.length;
                }

                // Reorder mediaFiles based on sorted paths
                const pathToFile = new Map(this.mediaFiles.map((f) => [f.path, f]));
                this.mediaFiles = sortedPaths.map((path) => pathToFile.get(path)).filter((f) => f);

                // Save sort cache for this algorithm
                const currentFile = this.mediaFiles[this.currentIndex];
                await this.saveSortCache(
                    this.sortAlgorithm,
                    this.mediaFiles.map((f) => f.path),
                    currentFile ? currentFile.path : null
                );

                // Sorting completed successfully!
                this.isSortedBySimilarity = true;
                this.currentIndex = 0;
                this.clearProgressNotification();

                // Show success notification
                this.showNotification(`✅ Sorted ${sortedCount} files with ${algorithmName}!`, 'success');

                this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Restore Order';
            }
        } catch (error) {
            console.error('Error sorting by similarity:', error);
            this.clearProgressNotification();
            this.showNotification(`❌ Error: ${error.message}`, 'error');

            // Restore original order if sorting failed (but preserve snapshot
            // when force re-sort fails from sorted state, so "Restore Order" still works)
            if (!wasAlreadySorted && this.originalMediaFiles.length > 0) {
                this.mediaFiles = [...this.originalMediaFiles];
                this.originalMediaFiles = [];
            }
        } finally {
            this.isComputingHashes = false;
            this.sortAbortController = null;
            this.sortSimilarityBtn.disabled = false;
            // Restore button label based on state
            if (this.sortSimilarityBtn) {
                this.sortSimilarityBtn.querySelector('.btn-label').textContent = this.isSortedBySimilarity
                    ? 'Restore Order'
                    : 'Sort by Similarity';
            }
        }

        // Show first media after sorting (separate error handling)
        if (this.isSortedBySimilarity) {
            try {
                await this.showMedia();
            } catch (mediaError) {
                console.error('Error showing media after sort:', mediaError);
                // Don't undo the sort - media loading is separate concern
                this.showNotification('⚠️ Sorted successfully but failed to load media', 'warning');
            }
        }
    }

    async computePerceptualHash(filePath) {
        return new Promise((resolve, reject) => {
            const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);
            const timeout = setTimeout(() => {
                reject(new Error('Timeout: processing took too long'));
            }, 30000); // 30 second timeout

            const cleanup = () => {
                clearTimeout(timeout);
            };

            if (isVideo) {
                // Extract first frame from video
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;

                video.addEventListener('loadeddata', () => {
                    try {
                        video.currentTime = 0.1; // Seek to 0.1s to avoid black frames
                    } catch (error) {
                        cleanup();
                        video.src = '';
                        reject(error);
                    }
                });

                video.addEventListener('seeked', () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 256;
                        canvas.height = 256;
                        const ctx = canvas.getContext('2d');

                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                        const hash = this.blockhash(imageData, 16);
                        cleanup();
                        video.src = '';
                        resolve(hash);
                    } catch (error) {
                        cleanup();
                        video.src = '';
                        reject(error);
                    }
                });

                video.addEventListener('error', (error) => {
                    cleanup();
                    video.src = '';
                    reject(new Error(`Video load error: ${error.message || 'Unknown error'}`));
                });

                video.src = filePath;
            } else {
                // Process image
                const img = new Image();
                img.addEventListener('load', () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 256;
                        canvas.height = 256;
                        const ctx = canvas.getContext('2d');

                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                        const hash = this.blockhash(imageData, 16);
                        cleanup();
                        resolve(hash);
                    } catch (error) {
                        cleanup();
                        reject(error);
                    }
                });

                img.addEventListener('error', (error) => {
                    cleanup();
                    reject(new Error(`Image load error: ${error.message || 'Unknown error'}`));
                });

                if (this.isJxl(filePath)) {
                    this.decodeJxl(filePath)
                        .then((decoded) => {
                            if (!decoded.frames || decoded.frames.length === 0) {
                                cleanup();
                                reject(new Error('JXL decoded with no frames'));
                                return;
                            }
                            // Local, self-contained object URL: revoke as soon as the img loads/fails.
                            // (Do NOT use jxlFrameToObjectURL here — that set is revoked on media-display
                            //  cleanup and could revoke this in-flight extraction URL mid-load.)
                            const url = URL.createObjectURL(
                                new Blob([decoded.frames[0].pngBytes], { type: 'image/png' })
                            );
                            img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
                            img.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
                            img.src = url;
                        })
                        .catch((err) => {
                            cleanup();
                            reject(new Error('JXL decode failed: ' + (err && err.message ? err.message : err)));
                        });
                } else {
                    img.src = filePath;
                }
            }
        });
    }

    blockhash(imageData, bits) {
        // Simple blockhash implementation
        const blockWidth = Math.floor(imageData.width / bits);
        const blockHeight = Math.floor(imageData.height / bits);
        const result = [];

        for (let y = 0; y < bits; y++) {
            for (let x = 0; x < bits; x++) {
                let total = 0;
                let count = 0;

                for (let by = 0; by < blockHeight; by++) {
                    for (let bx = 0; bx < blockWidth; bx++) {
                        const px = x * blockWidth + bx;
                        const py = y * blockHeight + by;
                        const idx = (py * imageData.width + px) * 4;

                        // Convert to grayscale
                        const gray =
                            imageData.data[idx] * 0.299 +
                            imageData.data[idx + 1] * 0.587 +
                            imageData.data[idx + 2] * 0.114;
                        total += gray;
                        count++;
                    }
                }

                result.push(total / count);
            }
        }

        // Convert to binary hash based on median
        const median = result.slice().sort((a, b) => a - b)[Math.floor(result.length / 2)];
        return result.map((val) => (val > median ? '1' : '0')).join('');
    }

    calculateHammingDistance(hash1, hash2) {
        if (!hash1 || !hash2 || hash1.length !== hash2.length) {
            return Infinity;
        }

        let distance = 0;
        for (let i = 0; i < hash1.length; i++) {
            if (hash1[i] !== hash2[i]) {
                distance++;
            }
        }
        return distance;
    }

    calculateCosineDistance(vec1, vec2) {
        // Returns 1 (not Infinity, unlike calculateHammingDistance and the worker's calculateCosineDistance)
        // because cosine distance is bounded [0, 2]; 1 = orthogonal, the natural "no signal" value.
        // Dead-code path in practice — callers gate every invocation behind clipCache truthy checks.
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 1;
        let dot = 0;
        for (let i = 0; i < vec1.length; i++) dot += vec1[i] * vec2[i];
        return 1 - dot;
    }

    // Run sorting in Web Worker to prevent UI freeze when window is minimized
    runSortingWorker(data) {
        return new Promise((resolve, reject) => {
            // Terminate previous worker if exists
            if (this.sortingWorker) {
                this.sortingWorker.terminate();
            }

            try {
                this.sortingWorker = new Worker('sorting-worker.js');
            } catch (err) {
                console.error('Failed to create sorting worker:', err);
                // Fall back to main thread sorting
                reject(new Error('Web Worker not supported, please try again'));
                return;
            }

            this.sortingWorker.onmessage = (e) => {
                const { type, sortedPaths, message, current, total } = e.data;

                switch (type) {
                    case 'progress':
                        this.updateSortProgress({ phase: message, current, total });
                        break;
                    case 'complete':
                        this.sortingWorker.terminate();
                        this.sortingWorker = null;
                        resolve(sortedPaths);
                        break;
                    case 'error':
                        this.sortingWorker.terminate();
                        this.sortingWorker = null;
                        reject(new Error(message));
                        break;
                }
            };

            this.sortingWorker.onerror = (err) => {
                console.error('Sorting worker error:', err);
                this.sortingWorker.terminate();
                this.sortingWorker = null;
                reject(new Error('Sorting worker failed: ' + err.message));
            };

            // Set up abort handling
            if (this.sortAbortController) {
                this.sortAbortController.signal.addEventListener('abort', () => {
                    if (this.sortingWorker) {
                        this.sortingWorker.postMessage({ type: 'abort' });
                    }
                });
            }

            // Send sorting request to worker
            this.sortingWorker.postMessage({ type: 'startSort', data });
        });
    }

    async loadHashCache() {
        if (!this.baseFolderPath) return 0;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.hash_cache.json');
            const cacheData = await window.electronAPI.readFile(cacheFile);

            if (cacheData) {
                const cache = JSON.parse(cacheData);
                // Convert cache entries back to Map with full paths
                this.perceptualHashes = new Map();
                for (const [fileName, hash] of Object.entries(cache)) {
                    // Reconstruct full path from base folder + filename
                    const fullPath = await window.electronAPI.path.join(this.baseFolderPath, fileName);
                    this.perceptualHashes.set(fullPath, hash);
                }
                console.log(`Loaded ${this.perceptualHashes.size} hashes from cache`);
                return this.perceptualHashes.size;
            }
        } catch (_error) {
            // Cache file doesn't exist or is invalid, start fresh
            console.log('No hash cache found, will compute fresh hashes');
        }
        return 0;
    }

    async saveHashCache() {
        if (!this.baseFolderPath) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.hash_cache.json');
            // Store only filenames as keys, not full paths
            const cache = {};
            for (const [fullPath, hash] of this.perceptualHashes.entries()) {
                // Extract filename from full path
                const fileName = await window.electronAPI.path.basename(fullPath);
                cache[fileName] = hash;
            }
            await window.electronAPI.writeFile(cacheFile, JSON.stringify(cache, null, 2));
            console.log(`Hash cache saved to: ${cacheFile}`);
        } catch (error) {
            console.error('Failed to save hash cache:', error);
            this.showNotification('⚠️ Failed to save hash cache', 'warning');
        }
    }

    // ==================== SORT CACHE METHODS ====================

    async loadSortCache(algorithm) {
        if (!this.baseFolderPath) return null;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.sort_cache.json');
            const cacheData = await window.electronAPI.readFile(cacheFile);

            if (cacheData) {
                const cache = JSON.parse(cacheData);
                if (cache[algorithm] && cache[algorithm].sortedPaths) {
                    return cache[algorithm];
                }
            }
        } catch (_error) {
            // Cache file doesn't exist or is invalid
            console.log('No sort cache found for algorithm:', algorithm);
        }
        return null;
    }

    async saveSortCache(algorithm, sortedPaths, startFile) {
        if (!this.baseFolderPath) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.sort_cache.json');

            // Load existing cache or create new
            let cache = {};
            try {
                const existingData = await window.electronAPI.readFile(cacheFile);
                if (existingData) {
                    cache = JSON.parse(existingData);
                }
            } catch (_e) {
                // No existing cache, start fresh
            }

            // Store only filenames, not full paths
            const fileNames = [];
            for (const fullPath of sortedPaths) {
                const fileName = await window.electronAPI.path.basename(fullPath);
                fileNames.push(fileName);
            }

            // Get start file name
            let startFileName = null;
            if (startFile) {
                startFileName = await window.electronAPI.path.basename(startFile);
            }

            cache[algorithm] = {
                algorithm,
                sortedPaths: fileNames,
                timestamp: Date.now(),
                startFile: startFileName,
                totalFiles: fileNames.length,
            };

            await window.electronAPI.writeFile(cacheFile, JSON.stringify(cache, null, 2));
            console.log(`Sort cache saved for ${algorithm}: ${fileNames.length} files`);
        } catch (error) {
            console.error('Failed to save sort cache:', error);
            this.showNotification('⚠️ Failed to save sort cache', 'warning');
        }
    }

    async deleteSortCache(algorithm) {
        if (!this.baseFolderPath) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.sort_cache.json');

            let existingData;
            try {
                existingData = await window.electronAPI.readFile(cacheFile);
            } catch (_e) {
                // Cache file does not exist — nothing to delete
                return;
            }

            let cache = {};
            if (existingData) {
                try {
                    cache = JSON.parse(existingData);
                } catch (_e) {
                    // Malformed cache — overwrite with empty object
                    cache = {};
                }
            }

            if (!cache[algorithm]) return;

            delete cache[algorithm];
            await window.electronAPI.writeFile(cacheFile, JSON.stringify(cache, null, 2));
            console.log(`Sort cache deleted for algorithm: ${algorithm}`);
        } catch (error) {
            console.error('Failed to delete sort cache entry:', error);
            this.showNotification('⚠️ Failed to delete sort cache', 'warning');
        }
    }

    async applyCachedSortOrder(cachedData, algorithm) {
        // Get current file names in folder
        const currentFileNames = new Set();
        const fileNameToFile = new Map();
        for (const file of this.mediaFiles) {
            const fileName = await window.electronAPI.path.basename(file.path);
            currentFileNames.add(fileName);
            fileNameToFile.set(fileName, file);
        }

        // Separate cached files that still exist vs new files
        const cachedOrder = [];
        const removedFiles = [];
        for (const fileName of cachedData.sortedPaths) {
            if (currentFileNames.has(fileName)) {
                cachedOrder.push(fileNameToFile.get(fileName));
                currentFileNames.delete(fileName); // Mark as processed
            } else {
                removedFiles.push(fileName);
            }
        }

        // Remaining files in currentFileNames are new files
        const newFiles = [];
        for (const fileName of currentFileNames) {
            newFiles.push(fileNameToFile.get(fileName));
        }

        // If we have new files, find best positions for them
        if (newFiles.length > 0 && cachedOrder.length > 0) {
            this.updateSortProgress({ phase: `Inserting ${newFiles.length} new files…` });
            // Prefer explicit algorithm from caller; fall back to the cache entry's algorithm
            // field (added in feature/clip-sort-followups). Old caches without either route
            // safely through the Hamming else-branch.
            await this.insertNewFilesInSortedOrder(cachedOrder, newFiles, algorithm ?? cachedData.algorithm);
        } else {
            // Just use cached order (new files at end if any)
            this.mediaFiles = [...cachedOrder, ...newFiles];
        }

        return {
            cached: cachedOrder.length,
            removed: removedFiles.length,
            added: newFiles.length,
        };
    }

    async insertNewFilesInSortedOrder(sortedFiles, newFiles, algorithm) {
        const insertions = [];

        if (algorithm === 'clip') {
            // CLIP path: score by cosine distance over clipCache vectors.
            // Files without CLIP vectors are end-appended (matches sortMediaBySimilarityClip's
            // first-time-sort fallback). No on-demand CLIP extraction here — the cache-hit
            // path is expected to be near-instant; firing main-process inference would
            // add ~100-200ms per missing file via IPC.
            for (let i = 0; i < newFiles.length; i++) {
                if (this.sortAbortController?.signal.aborted) {
                    throw new Error('Sorting cancelled by user');
                }
                const newFile = newFiles[i];
                const newVec = this.clipCache.get(newFile.path);

                if (!newVec) {
                    insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                    continue;
                }

                let bestIndex = sortedFiles.length;
                let bestScore = Infinity;

                for (let j = 0; j <= sortedFiles.length; j++) {
                    let score = 0;
                    let count = 0;

                    if (j > 0) {
                        const prevVec = this.clipCache.get(sortedFiles[j - 1].path);
                        if (prevVec) {
                            score += this.calculateCosineDistance(newVec, prevVec);
                            count++;
                        }
                    }

                    if (j < sortedFiles.length) {
                        const nextVec = this.clipCache.get(sortedFiles[j].path);
                        if (nextVec) {
                            score += this.calculateCosineDistance(newVec, nextVec);
                            count++;
                        }
                    }

                    if (count > 0) {
                        score = score / count;
                        if (score < bestScore) {
                            bestScore = score;
                            bestIndex = j;
                        }
                    }
                }

                insertions.push({ file: newFile, index: bestIndex, distance: bestScore });

                if ((i + 1) % 10 === 0 || i === newFiles.length - 1) {
                    this.updateSortProgress({ phase: 'Placing new files', current: i + 1, total: newFiles.length });
                }
                if ((i + 1) % 25 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        } else {
            // Hash path (vptree, mst, simple, or undefined): unchanged behavior.
            for (let i = 0; i < newFiles.length; i++) {
                if (this.sortAbortController?.signal.aborted) {
                    throw new Error('Sorting cancelled by user');
                }
                const newFile = newFiles[i];

                if (!this.perceptualHashes.has(newFile.path)) {
                    try {
                        const hash = await this.computePerceptualHash(newFile.path);
                        this.perceptualHashes.set(newFile.path, hash);
                    } catch (error) {
                        console.warn(`Failed to compute hash for ${newFile.path}:`, error);
                        insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                        continue;
                    }
                }

                const newHash = this.perceptualHashes.get(newFile.path);
                if (!newHash) {
                    insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                    continue;
                }

                let bestIndex = sortedFiles.length;
                let bestScore = Infinity;

                for (let j = 0; j <= sortedFiles.length; j++) {
                    let score = 0;
                    let count = 0;

                    if (j > 0) {
                        const prevHash = this.perceptualHashes.get(sortedFiles[j - 1].path);
                        if (prevHash) {
                            score += this.calculateHammingDistance(newHash, prevHash);
                            count++;
                        }
                    }

                    if (j < sortedFiles.length) {
                        const nextHash = this.perceptualHashes.get(sortedFiles[j].path);
                        if (nextHash) {
                            score += this.calculateHammingDistance(newHash, nextHash);
                            count++;
                        }
                    }

                    if (count > 0) {
                        score = score / count;
                        if (score < bestScore) {
                            bestScore = score;
                            bestIndex = j;
                        }
                    }
                }

                insertions.push({ file: newFile, index: bestIndex, distance: bestScore });

                if ((i + 1) % 10 === 0 || i === newFiles.length - 1) {
                    this.updateSortProgress({ phase: 'Placing new files', current: i + 1, total: newFiles.length });
                }
                if ((i + 1) % 25 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        }

        // Sort insertions by index descending so we can insert without affecting indices
        insertions.sort((a, b) => b.index - a.index);

        const result = [...sortedFiles];
        for (const { file, index } of insertions) {
            result.splice(index, 0, file);
        }

        this.mediaFiles = result;
    }

    // ==================== ZOOM METHODS ====================

    getZoomTarget(element) {
        // Determine which zoom state to use based on the element
        if (this.isCompareMode) {
            if (element === this.leftMedia || element === this.leftMediaWrapper) {
                return 'left';
            } else if (element === this.rightMedia || element === this.rightMediaWrapper) {
                return 'right';
            }
        }
        return 'single';
    }

    getMediaElement(target) {
        if (target === 'left') return this.leftMedia;
        if (target === 'right') return this.rightMedia;
        return this.currentMedia;
    }

    setZoom(target, scale, translateX, translateY) {
        const state = this.zoomState[target];
        if (!state) return;

        state.scale = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
        state.translateX = translateX;
        state.translateY = translateY;

        const element = this.getMediaElement(target);
        if (element) {
            element.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
            element.style.cursor = state.scale > 1 ? 'grab' : 'default';
        }

        this.updateZoomIndicator(target);
    }

    resetZoom(target) {
        if (target === 'all') {
            this.resetZoom('single');
            this.resetZoom('left');
            this.resetZoom('right');
            return;
        }

        this.setZoom(target, 1, 0, 0);
    }

    zoomAtPoint(target, newScale, clientX, clientY) {
        const element = this.getMediaElement(target);
        if (!element) return;

        const state = this.zoomState[target];
        const rect = element.getBoundingClientRect();

        // Calculate cursor position relative to element center
        const elementCenterX = rect.left + rect.width / 2;
        const elementCenterY = rect.top + rect.height / 2;

        // Cursor offset from center in screen coordinates
        const offsetX = clientX - elementCenterX;
        const offsetY = clientY - elementCenterY;

        // Calculate new translate to keep point under cursor
        const scaleRatio = newScale / state.scale;

        let newTranslateX = state.translateX - offsetX * (scaleRatio - 1);
        let newTranslateY = state.translateY - offsetY * (scaleRatio - 1);

        // Constrain pan to reasonable bounds when zoomed
        if (newScale > 1) {
            const maxTranslateX = (rect.width * (newScale - 1)) / 2;
            const maxTranslateY = (rect.height * (newScale - 1)) / 2;
            newTranslateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, newTranslateX));
            newTranslateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, newTranslateY));
        } else {
            newTranslateX = 0;
            newTranslateY = 0;
        }

        this.setZoom(target, newScale, newTranslateX, newTranslateY);
    }

    cycleZoomStep(target, clientX, clientY) {
        const state = this.zoomState[target];
        const currentScale = state.scale;

        // Find next zoom step
        let nextStep = this.zoomSteps[0];
        for (let i = 0; i < this.zoomSteps.length; i++) {
            if (currentScale < this.zoomSteps[i]) {
                nextStep = this.zoomSteps[i];
                break;
            }
            // If we're at or beyond the last step, reset to 1
            if (i === this.zoomSteps.length - 1) {
                nextStep = this.zoomSteps[0];
            }
        }

        if (nextStep === 1) {
            this.resetZoom(target);
        } else {
            this.zoomAtPoint(target, nextStep, clientX, clientY);
        }
    }

    handleWheelZoom(e, target) {
        e.preventDefault();
        e.stopPropagation();

        const state = this.zoomState[target];
        const delta = e.deltaY > 0 ? -1 : 1;
        const newScale = state.scale * Math.pow(this.zoomFactor, delta);

        this.zoomAtPoint(target, newScale, e.clientX, e.clientY);
    }

    handlePanStart(e, target) {
        const state = this.zoomState[target];
        if (state.scale <= 1) return false;

        this.isPanning = true;
        this.currentPanTarget = target;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.panStartTranslate = { x: state.translateX, y: state.translateY };

        const element = this.getMediaElement(target);
        if (element) {
            element.style.cursor = 'grabbing';
        }

        return true;
    }

    handlePanMove(e) {
        if (!this.isPanning) return;

        const target = this.currentPanTarget;
        const state = this.zoomState[target];
        const element = this.getMediaElement(target);
        if (!element) return;

        const deltaX = e.clientX - this.panStart.x;
        const deltaY = e.clientY - this.panStart.y;

        let newTranslateX = this.panStartTranslate.x + deltaX;
        let newTranslateY = this.panStartTranslate.y + deltaY;

        // Constrain pan to image bounds
        const rect = element.getBoundingClientRect();
        const maxTranslateX = (rect.width * (state.scale - 1)) / 2;
        const maxTranslateY = (rect.height * (state.scale - 1)) / 2;

        newTranslateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, newTranslateX));
        newTranslateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, newTranslateY));

        this.setZoom(target, state.scale, newTranslateX, newTranslateY);
    }

    handlePanEnd() {
        if (!this.isPanning) return;

        const element = this.getMediaElement(this.currentPanTarget);
        if (element) {
            const state = this.zoomState[this.currentPanTarget];
            element.style.cursor = state.scale > 1 ? 'grab' : 'default';
        }

        this.isPanning = false;
        this.currentPanTarget = null;
    }

    updateZoomIndicator(target) {
        const entry = this.zoomControlsMap && this.zoomControlsMap[target];
        if (!entry) return;

        const state = this.zoomState[target];

        // Sync slider and percentage display (skip during slider drag to avoid feedback loop)
        if (!entry.isSliderDragging) {
            entry.slider.value = this.scaleToSlider(state.scale);
        }
        entry.valueDisplay.textContent = `${Math.round(state.scale * 100)}%`;

        // Enable/disable buttons at boundaries
        entry.zoomOutBtn.disabled = state.scale <= this.minZoom;
        entry.zoomInBtn.disabled = state.scale >= this.maxZoom;

        // Toggle button active state when zoomed
        if (entry.toggleBtn) {
            if (state.scale > 1) {
                entry.toggleBtn.classList.add('active');
            } else {
                entry.toggleBtn.classList.remove('active');
            }
        }
    }

    isZoomed() {
        if (this.isCompareMode) {
            return this.zoomState.left.scale > 1 || this.zoomState.right.scale > 1;
        }
        return this.zoomState.single.scale > 1;
    }

    setupZoomEvents(element, target) {
        if (!element) return;

        // Helper to check if element is in fullscreen mode
        const isInFullscreen = () => element.closest('.fullscreen') !== null;

        // Double-click to cycle zoom (disabled in fullscreen - conflicts with click-to-exit)
        element.addEventListener('dblclick', (e) => {
            if (isInFullscreen()) return;
            e.preventDefault();
            e.stopPropagation();
            this.cycleZoomStep(target, e.clientX, e.clientY);
        });

        // Wheel zoom (works in fullscreen)
        element.addEventListener(
            'wheel',
            (e) => {
                this.handleWheelZoom(e, target);
            },
            { passive: false }
        );

        // Pan start (works in fullscreen when zoomed)
        element.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                // Left click only
                if (this.handlePanStart(e, target)) {
                    e.preventDefault();
                }
            }
        });
    }

    // ==================== ML PREDICTION METHODS ====================

    initializeMlWorker() {
        console.log('[ML Debug] initializeMlWorker called, isMlEnabled:', this.isMlEnabled);
        if (!this.isMlEnabled) {
            console.log('[ML Debug] ML is disabled, skipping worker init');
            return;
        }

        if (this.mlWorker) {
            this.mlWorker.terminate();
        }

        try {
            this.mlWorker = new Worker('ml-worker.js');
            console.log('[ML Debug] ML Worker created');

            this.mlWorker.onmessage = (e) => {
                this.handleMlWorkerMessage(e.data);
            };

            this.mlWorker.onerror = (err) => {
                console.error('[ML Debug] ML Worker error:', err);
                this.isMlEnabled = false;
            };

            // Initialize worker (will load saved model if exists)
            this.mlWorker.postMessage({ type: 'init', data: {} });
        } catch (err) {
            console.warn('[ML Debug] ML Worker not available:', err);
            this.isMlEnabled = false;
        }
    }

    handleMlWorkerMessage(message) {
        switch (message.type) {
            case 'initComplete':
                console.log('[ML Debug] ML Model initialized:', message.stats);
                this.mlStats = message.stats;
                this.updateSortPredictionButton();
                // If worker reset the model (version/dim mismatch), clear stale state
                if (message.modelWasReset) {
                    console.warn('ML model was reset (version/dim mismatch) — clearing stale cache');
                    this.mlModelState = null;
                    this.predictionScores = new Map();
                    this.deleteMlModelCache();
                }
                // If model was restored with samples, request scores
                if (message.stats?.isReady && this.mediaFiles.length > 0) {
                    this.requestPredictionScores();
                }
                break;

            case 'trainComplete':
                this.mlModelState = message.modelState;
                this.mlStats = message.stats;
                this.saveMlModel();
                if (message.stats.totalSamples > 0) {
                    this.showNotification(
                        `ML trained: ${message.stats.positiveCount} likes, ${message.stats.negativeCount} dislikes`,
                        'success'
                    );
                }
                // Call training complete callback if waiting
                if (this._trainingCompleteCallback) {
                    this._trainingCompleteCallback();
                    this._trainingCompleteCallback = null;
                }
                // Trigger re-scoring
                this.requestPredictionScores();
                break;

            case 'updateComplete':
                this.mlModelState = message.modelState;
                this.mlStats = message.stats;
                console.log(
                    `[ML Debug] Model updated! Total: ${message.stats.totalSamples} samples ` +
                        `(${message.stats.positiveCount} likes, ${message.stats.negativeCount} dislikes) ` +
                        `| Ready: ${message.stats.isReady}`
                );
                // Show visual feedback that ML learned (subtle, bottom-left)
                this.showMlLearningIndicator(message.stats);
                // Debounce model saving to avoid multiple writes
                if (this._saveModelTimer) {
                    clearTimeout(this._saveModelTimer);
                }
                this._saveModelTimer = setTimeout(() => {
                    this.saveMlModel();
                    this._saveModelTimer = null;
                }, 500);

                // If awaiting compare refresh, bypass debounce
                if (this.pendingCompareRefresh) {
                    this.pendingCompareUpdates--;
                    if (this.pendingCompareUpdates <= 0) {
                        // Both updates received — immediately request re-score
                        this.requestPredictionScores();
                        this.updateSortPredictionButton();
                    }
                    // Don't debounce — we'll handle showMedia() in scoreComplete
                } else {
                    // Normal path: debounce re-scoring
                    if (this._scoreDebounceTimer) {
                        clearTimeout(this._scoreDebounceTimer);
                    }
                    this._scoreDebounceTimer = setTimeout(() => {
                        this.requestPredictionScores();
                        this.updateSortPredictionButton();
                        this._scoreDebounceTimer = null;
                    }, 100);
                }
                break;

            // Handle reversed ML update (undo functionality)
            case 'reverseUpdateComplete':
                console.log('[ML Debug] Model reverse update complete');
                this.mlModelState = message.modelState;
                this.mlStats = message.stats;
                // Debounce model saving
                if (this._saveModelTimer) {
                    clearTimeout(this._saveModelTimer);
                }
                this._saveModelTimer = setTimeout(() => {
                    this.saveMlModel();
                    this._saveModelTimer = null;
                }, 500);

                // If awaiting compare refresh, bypass debounce
                if (this.pendingCompareRefresh) {
                    this.pendingCompareUpdates--;
                    if (this.pendingCompareUpdates <= 0) {
                        this.requestPredictionScores();
                        this.updateSortPredictionButton();
                    }
                } else {
                    // Normal path: debounce re-scoring
                    if (this._scoreDebounceTimer) {
                        clearTimeout(this._scoreDebounceTimer);
                    }
                    this._scoreDebounceTimer = setTimeout(() => {
                        this.requestPredictionScores();
                        this.updateSortPredictionButton();
                        this._scoreDebounceTimer = null;
                    }, 100);
                }
                break;

            case 'scoreComplete':
                this.clearProgressNotification(); // Clear "Scoring" progress
                if (message.scores) {
                    // Build filename->path map once for O(1) lookups
                    const filenameToPath = new Map(this.mediaFiles.map((f) => [f.name, f.path]));
                    for (const [filename, score] of Object.entries(message.scores)) {
                        const path = filenameToPath.get(filename);
                        if (path) {
                            this.predictionScores.set(path, score);
                        }
                    }
                    this.updatePredictionBadges();

                    // Score delta notification (only after rating-triggered re-scores)
                    if (this.previousScores) {
                        let upCount = 0;
                        let downCount = 0;
                        for (const [filePath, newScore] of this.predictionScores) {
                            const oldScore = this.previousScores.get(filePath);
                            if (oldScore !== undefined) {
                                const delta = newScore - oldScore;
                                if (delta > 0.05) {
                                    upCount++;
                                } else if (delta < -0.05) {
                                    downCount++;
                                }
                            }
                        }
                        const total = upCount + downCount;
                        if (total > 0) {
                            this.showNotification(
                                `ML updated: ${total} files rescored (${upCount}↑ ${downCount}↓)`,
                                'info',
                                2000
                            );
                        } else {
                            this.showNotification('ML updated: scores stable', 'info', 2000);
                        }
                        this.previousScores = null;
                    }

                    // If deferred compare pair rendering, show next pair now
                    if (this.pendingCompareRefresh) {
                        clearTimeout(this.pendingCompareTimeout);
                        this.pendingCompareRefresh = false;
                        this.pendingCompareUpdates = 0;
                        this.pendingCompareTimeout = null;
                        this.mediaNavigationInProgress = false;
                        this.showMedia();
                    }
                }
                break;

            case 'sortComplete':
                this.clearProgressNotification(); // Clear "Scoring" progress
                if (message.sortedFilenames) {
                    // Apply sort order
                    const filenameToFile = new Map(this.mediaFiles.map((f) => [f.name, f]));
                    const sorted = message.sortedFilenames.map((name) => filenameToFile.get(name)).filter((f) => f);

                    if (sorted.length > 0) {
                        // Sync prediction scores from worker so badges align with the re-ordered files.
                        // Without this, badges show stale per-path values from prior scoreComplete events.
                        if (message.scores) {
                            for (const [filename, score] of Object.entries(message.scores)) {
                                const file = filenameToFile.get(filename);
                                if (file) this.predictionScores.set(file.path, score);
                            }
                        }

                        this.mediaFiles = sorted;
                        this.currentIndex = 0;
                        this.isSortedByPrediction = true;
                        this.showMedia();
                        this.updateSortPredictionButton();
                        this.showNotification('Sorted by predicted preference', 'success');
                    } else {
                        this.showNotification('No files to sort', 'warning');
                    }
                } else {
                    // Sorting failed - show reason
                    this.showNotification(message.reason || 'Could not sort files', 'warning');
                }
                break;

            case 'progress':
                this.updateProgressNotification(message.message);
                break;

            case 'error':
                console.error('ML Worker error:', message.message);
                break;
        }
    }

    async loadMlModel() {
        if (!this.baseFolderPath || !this.isMlEnabled) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.ml_model.json');
            const data = await window.electronAPI.readFile(cacheFile);

            if (data) {
                const parsed = JSON.parse(data);
                this.mlModelState = parsed.modelState;

                if (this.mlWorker) {
                    this.mlWorker.postMessage({
                        type: 'init',
                        data: { savedModel: this.mlModelState },
                    });
                }
                console.log('ML model loaded from cache');
            }
        } catch (_error) {
            console.log('No ML model cache found');
        }
    }

    async saveMlModel() {
        if (!this.baseFolderPath || !this.mlModelState) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.ml_model.json');
            await window.electronAPI.writeFile(
                cacheFile,
                JSON.stringify({
                    modelState: this.mlModelState,
                    timestamp: Date.now(),
                })
            );
        } catch (error) {
            console.error('Failed to save ML model:', error);
        }
    }

    async deleteMlModelCache() {
        if (!this.baseFolderPath) return;
        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.ml_model.json');
            await window.electronAPI.writeFile(cacheFile, '');
        } catch (_error) {
            // Ignore — file may not exist
        }
    }

    resetMlModel() {
        this.mlModelState = null;
        this.mlStats = null;
        this.predictionScores = new Map();
        if (this.mlWorker) {
            this.mlWorker.postMessage({ type: 'reset' });
        }
        this.updateSortPredictionButton();
    }

    // Feature cache version - must match FEATURE_VERSION in feature-extractor.js
    static FEATURE_CACHE_VERSION = 4;

    // Async mutex serializing ALL feature-cache file IO (load reads + save writes). On Windows,
    // rename(.tmp → .feature_cache.json) fails with EPERM if the destination has an open handle —
    // and the streaming reader holds the file open for ~40s while the 30s auto-save tries to
    // rename over it. Serializing read and write eliminates that overlap. Returns a release fn.
    async _acquireCacheIoLock() {
        const prev = this._cacheIoLock || Promise.resolve();
        let release;
        this._cacheIoLock = new Promise((resolve) => {
            release = resolve;
        });
        await prev; // wait for the previous holder to release
        return release;
    }

    async loadFeatureCache() {
        // Single-flight: concurrent callers (a CLIP-sort's on-demand extraction + a "Sort by Prediction" click) must
        // not both drive the shared main-side streaming session, which would corrupt each
        // other's chunk offsets and close the session out from under the other — yielding an
        // empty/partial feature load. Coalesce concurrent calls into one in-flight load.
        if (this._featureCacheLoadPromise) {
            return this._featureCacheLoadPromise;
        }
        this._featureCacheLoadPromise = this._loadFeatureCacheImpl();
        try {
            return await this._featureCacheLoadPromise;
        } finally {
            this._featureCacheLoadPromise = null;
        }
    }

    async _loadFeatureCacheImpl() {
        if (!this.baseFolderPath) return 0;
        const releaseIoLock = await this._acquireCacheIoLock();
        try {
            return await this._loadFeatureCacheLocked();
        } finally {
            releaseIoLock();
        }
    }

    async _loadFeatureCacheLocked() {
        if (!this.baseFolderPath) return 0;

        const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.feature_cache.json');

        // Build lookup of current files for pruning + staleness validation.
        const currentFiles = new Map();
        for (const file of this.mediaFiles) {
            currentFiles.set(file.name, file);
        }
        const expectedDim = 64;
        const freshFeatureCache = new Map();
        const freshFeatureMetadata = new Map();

        // Validate + populate one cache entry (shared by streaming + legacy paths).
        const processEntry = async (filename, entry) => {
            const currentFile = currentFiles.get(filename);
            if (!currentFile) return; // file no longer in folder — prune
            if (entry.vector?.length !== expectedDim) return; // wrong dimension
            if (entry.size !== currentFile.size || entry.mtime !== currentFile.mtimeMs) return; // stale

            const fullPath = await window.electronAPI.path.join(this.baseFolderPath, filename);
            freshFeatureCache.set(fullPath, new Float32Array(entry.vector));
            freshFeatureMetadata.set(fullPath, { size: entry.size, mtime: entry.mtime });
            if (entry.clipVector && entry.clipVector.length === 512) {
                this.clipCache.set(fullPath, new Float32Array(entry.clipVector));
            }
        };

        // Preferred path: parse in the main process and pull entries in small batches.
        // Keeps the renderer from ever holding the full (potentially 250MB+) JSON string.
        if (window.electronAPI.featureCacheOpen) {
            try {
                const opened = await window.electronAPI.featureCacheOpen(cacheFile);
                if (!opened.success) {
                    // notFound or parse error → start with an empty cache (no crash, no data loss)
                    return 0;
                }
                if (opened.version !== MediaViewer.FEATURE_CACHE_VERSION) {
                    console.warn(
                        `Feature cache version mismatch: found=${opened.version}, expected=${MediaViewer.FEATURE_CACHE_VERSION}. Cache will be invalidated.`
                    );
                    await window.electronAPI.featureCacheClose();
                    this.featureCache = new Map();
                    this.featureMetadata = new Map();
                    return 0;
                }

                const CHUNK = 1000;
                for (let offset = 0; offset < opened.count; offset += CHUNK) {
                    const { entries } = await window.electronAPI.featureCacheChunk(offset, CHUNK);
                    for (const [filename, entry] of entries) {
                        await processEntry(filename, entry);
                    }
                }
                await window.electronAPI.featureCacheClose();
                this.featureCache = freshFeatureCache;
                this.featureMetadata = freshFeatureMetadata;
                return this.featureCache.size;
            } catch (error) {
                console.log('Feature cache streaming load failed, falling back to direct read:', error.message);
                try {
                    await window.electronAPI.featureCacheClose();
                } catch (_e) {
                    // ignore
                }
                // fall through to legacy path
            }
        }

        // Legacy fallback: single read + parse (older preload, or streaming failed).
        // Only safe for modest cache sizes.
        try {
            const data = await window.electronAPI.readFile(cacheFile);
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.version !== MediaViewer.FEATURE_CACHE_VERSION) {
                    console.warn(
                        `Feature cache version mismatch: found=${parsed.version}, expected=${MediaViewer.FEATURE_CACHE_VERSION}. Cache will be invalidated.`
                    );
                    this.featureCache = new Map();
                    this.featureMetadata = new Map();
                    return 0;
                }
                for (const [filename, entry] of Object.entries(parsed.features || {})) {
                    await processEntry(filename, entry);
                }
                this.featureCache = freshFeatureCache;
                this.featureMetadata = freshFeatureMetadata;
                return this.featureCache.size;
            }
        } catch (error) {
            console.log('No feature cache found or error loading:', error.message);
        }
        return 0;
    }

    async saveFeatureCache() {
        // Single-flight: the 30s auto-save interval can fire while an explicit save is still
        // streaming, and both share the main-side featureCacheWriter (one temp file). Skip if a
        // save is already in flight — the in-flight one already captures the latest cache state.
        if (this._featureCacheSavePromise) {
            return this._featureCacheSavePromise;
        }
        this._featureCacheSavePromise = this._saveFeatureCacheImpl();
        try {
            return await this._featureCacheSavePromise;
        } finally {
            this._featureCacheSavePromise = null;
        }
    }

    async _saveFeatureCacheImpl() {
        if (!this.baseFolderPath || this.featureCache.size === 0) return;
        const releaseIoLock = await this._acquireCacheIoLock();
        try {
            return await this._saveFeatureCacheLocked();
        } finally {
            releaseIoLock();
        }
    }

    async _saveFeatureCacheLocked() {
        if (!this.baseFolderPath || this.featureCache.size === 0) return;

        // Round to 6 decimals before serializing. Full-precision floats stringify to
        // ~17 chars each (e.g. "0.12345678901234567"); 6 decimals is well below the
        // noise floor for unit-normalized cosine similarity and ~halves the file size
        // (a 24k-file cache went from 259MB → ~130MB).
        const round6 = (arr) => {
            const out = new Array(arr.length);
            for (let i = 0; i < arr.length; i++) {
                out[i] = Math.round(arr[i] * 1e6) / 1e6;
            }
            return out;
        };

        // Build the serializable entry for one cache item.
        const buildEntry = (fullPath, featureArray) => {
            const meta = this.featureMetadata.get(fullPath);
            const clipVector = this.clipCache.get(fullPath);
            const fileInfo = meta ? null : this.mediaFiles.find((f) => f.path === fullPath);
            return {
                vector: round6(featureArray),
                clipVector: clipVector ? round6(clipVector) : null,
                // Fallback to live file stats (not zeros) so a missing meta doesn't cause a
                // permanent cache miss on next load.
                size: meta ? meta.size : fileInfo?.size || 0,
                mtime: meta ? meta.mtime : fileInfo?.mtimeMs || 0,
            };
        };

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.feature_cache.json');

            // Preferred path: stream batches to main (main appends + atomic-renames). Keeps the
            // renderer from ever building a ~130MB JSON string on every 30s auto-save.
            if (window.electronAPI.featureCacheWriteOpen) {
                const opened = await window.electronAPI.featureCacheWriteOpen(cacheFile, {
                    version: MediaViewer.FEATURE_CACHE_VERSION,
                    featureDim: 64,
                    clipDim: 512,
                });
                if (opened?.success) {
                    const BATCH = 1000;
                    let batch = [];
                    const flush = async () => {
                        if (batch.length === 0) return;
                        const res = await window.electronAPI.featureCacheWriteChunk(batch);
                        if (!res?.success) throw new Error(res?.error || 'write-chunk failed');
                        batch = [];
                    };
                    for (const [fullPath, featureArray] of this.featureCache.entries()) {
                        const filename = await window.electronAPI.path.basename(fullPath);
                        batch.push([filename, buildEntry(fullPath, featureArray)]);
                        if (batch.length >= BATCH) await flush();
                    }
                    await flush();
                    const closed = await window.electronAPI.featureCacheWriteClose();
                    if (!closed?.success) throw new Error(closed?.error || 'write-close failed');
                    return;
                }
                // If open failed, fall through to legacy single-write.
            }

            // Legacy fallback: build the whole object and write once (older preload / small caches).
            const features = {};
            for (const [fullPath, featureArray] of this.featureCache.entries()) {
                const filename = await window.electronAPI.path.basename(fullPath);
                features[filename] = buildEntry(fullPath, featureArray);
            }
            await window.electronAPI.writeFile(
                cacheFile,
                JSON.stringify({
                    version: MediaViewer.FEATURE_CACHE_VERSION,
                    featureDim: 64,
                    clipDim: 512,
                    features,
                })
            );
        } catch (error) {
            console.error('Failed to save feature cache:', error);
        }
    }

    /**
     * Compute features for a file with full metadata support (v2)
     * @param {string} filePath - Path to the file
     * @param {Object} fileInfo - Optional file info from mediaFiles array
     * @returns {Promise<Float32Array>} 64-dimensional feature vector
     */
    async computeFeatures(filePath, fileInfo = null) {
        // Check cache first
        if (this.featureCache.has(filePath)) {
            return this.featureCache.get(filePath);
        }

        const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);
        const ext = filePath.split('.').pop().toLowerCase();

        // Get file info from mediaFiles if not provided
        if (!fileInfo) {
            fileInfo = this.mediaFiles.find((f) => f.path === filePath) || {};
        }

        // Build metadata object for v2 features
        const metadata = {
            fileSize: fileInfo.size || 0,
            isVideo: isVideo,
            format: ext,
            // These will be filled below
            width: 0,
            height: 0,
            videoInfo: null,
            faceInfo: null,
        };

        // Get video metadata via ffprobe if available
        if (isVideo && window.electronAPI.probeVideo) {
            try {
                const probeResult = await window.electronAPI.probeVideo(filePath);
                if (probeResult.success) {
                    metadata.videoInfo = {
                        duration: probeResult.info.duration,
                        fps: probeResult.info.fps,
                        hasAudio: probeResult.info.hasAudio,
                        bitrate: probeResult.info.bitrate,
                    };
                    metadata.width = probeResult.info.width;
                    metadata.height = probeResult.info.height;
                }
            } catch (e) {
                console.warn('Video probe failed:', e.message);
            }
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 30000);
            const cleanup = () => clearTimeout(timeout);

            const processImageData = async (imageData, mediaWidth, mediaHeight) => {
                try {
                    // Update dimensions from actual media
                    if (!metadata.width) metadata.width = mediaWidth;
                    if (!metadata.height) metadata.height = mediaHeight;

                    // Optional: Face detection (only if available and enabled)
                    if (window.FaceDetector && this.enableFaceDetection !== false) {
                        try {
                            // Create canvas for face detection
                            const canvas = document.createElement('canvas');
                            canvas.width = imageData.width;
                            canvas.height = imageData.height;
                            const ctx = canvas.getContext('2d');
                            ctx.putImageData(imageData, 0, 0);

                            const faceResult = await window.FaceDetector.detect(canvas, {
                                minConfidence: 0.5,
                                inputSize: 224,
                            });

                            metadata.faceInfo = {
                                hasFace: faceResult.hasFace,
                                count: faceResult.count,
                                areaRatio: faceResult.areaRatio,
                            };
                        } catch (faceError) {
                            // Face detection failed, continue without it
                            console.warn('Face detection failed:', faceError.message);
                        }
                    }

                    // Feature extraction using extractFeatures from feature-extractor.js (v2 with metadata)
                    const features = extractFeatures(imageData, metadata);
                    this.featureCache.set(filePath, features);
                    const computeFileInfo = this.mediaFiles.find((f) => f.path === filePath);
                    if (computeFileInfo) {
                        this.featureMetadata.set(filePath, {
                            size: computeFileInfo.size,
                            mtime: computeFileInfo.mtimeMs || 0,
                        });
                    }
                    cleanup();
                    resolve(features);
                } catch (error) {
                    cleanup();
                    reject(error);
                }
            };

            if (isVideo) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;

                video.addEventListener('loadeddata', () => {
                    video.currentTime = 0.1;
                });

                video.addEventListener('seeked', () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 256;
                    canvas.height = 256;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, 256, 256);
                    const imageData = ctx.getImageData(0, 0, 256, 256);
                    const videoWidth = video.videoWidth;
                    const videoHeight = video.videoHeight;
                    video.src = '';
                    processImageData(imageData, videoWidth, videoHeight);
                });

                video.addEventListener('error', () => {
                    video.src = '';
                    cleanup();
                    reject(new Error('Video load error'));
                });

                video.src = filePath;
            } else {
                const img = new Image();

                img.addEventListener('load', () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 256;
                    canvas.height = 256;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, 256, 256);
                    const imageData = ctx.getImageData(0, 0, 256, 256);
                    processImageData(imageData, img.naturalWidth, img.naturalHeight);
                });

                img.addEventListener('error', () => {
                    cleanup();
                    reject(new Error('Image load error'));
                });

                if (this.isJxl(filePath)) {
                    this.decodeJxl(filePath)
                        .then((decoded) => {
                            if (!decoded.frames || decoded.frames.length === 0) {
                                cleanup();
                                reject(new Error('JXL decoded with no frames'));
                                return;
                            }
                            // Local, self-contained object URL: revoke as soon as the img loads/fails.
                            // (Do NOT use jxlFrameToObjectURL here — that set is revoked on media-display
                            //  cleanup and could revoke this in-flight extraction URL mid-load.)
                            const url = URL.createObjectURL(
                                new Blob([decoded.frames[0].pngBytes], { type: 'image/png' })
                            );
                            img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
                            img.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
                            img.src = url;
                        })
                        .catch((err) => {
                            cleanup();
                            reject(new Error('JXL decode failed: ' + (err && err.message ? err.message : err)));
                        });
                } else {
                    img.src = filePath;
                }
            }
        });
    }

    async collectBulkRatedTrainingExamples() {
        const liked = [];
        const disliked = [];
        for (const [name, bucket] of this.bulkRated) {
            const file = this.mediaFiles.find((f) => f.name === name);
            if (!file) continue;
            let combined = this.getCombinedFeatures(file.path);
            if (!combined) {
                try {
                    const features = await this.computeFeatures(file.path);
                    const clipVector = await this.extractClipEmbedding(file.path);
                    const merged = new Float32Array(576);
                    merged.set(features, 0);
                    if (clipVector) merged.set(clipVector, 64);
                    combined = Array.from(merged);
                } catch (err) {
                    console.warn(`Skipping bulk-rated ${name}:`, err.message);
                    continue;
                }
            }
            (bucket === 'good' ? liked : disliked).push(combined);
        }
        return { liked, disliked };
    }

    async trainFromHistoricalRatings() {
        if (!this.isMlEnabled || !this.mlWorker) return;
        if (!this.customLikeFolder || !this.customDislikeFolder) return;

        try {
            // Load files from like folder
            const likedResult = await window.electronAPI.loadFolder(this.customLikeFolder);
            const dislikedResult = await window.electronAPI.loadFolder(this.customDislikeFolder);

            if (!likedResult.success && !dislikedResult.success) {
                console.log('No historical ratings found');
                return;
            }

            const likedFiles = likedResult.success ? likedResult.files : [];
            const dislikedFiles = dislikedResult.success ? dislikedResult.files : [];

            if (likedFiles.length === 0 && dislikedFiles.length === 0) {
                console.log('No historical ratings to train from');
                return;
            }

            this.updateProgressNotification('Loading historical ratings...');

            const likedFeatures = [];
            const dislikedFeatures = [];

            // Extract features from liked files
            for (let i = 0; i < likedFiles.length; i++) {
                const file = likedFiles[i];
                try {
                    const features = await this.computeFeatures(file.path);
                    const clipVector = await this.extractClipEmbedding(file.path);
                    const combined = new Float32Array(576);
                    combined.set(features, 0);
                    if (clipVector) combined.set(clipVector, 64);
                    likedFeatures.push(Array.from(combined));

                    if ((i + 1) % 10 === 0) {
                        this.updateProgressNotification(`Processing likes: ${i + 1}/${likedFiles.length}`);
                    }
                } catch (err) {
                    console.warn(`Skipping ${file.name}:`, err.message);
                }
            }

            // Extract features from disliked files
            for (let i = 0; i < dislikedFiles.length; i++) {
                const file = dislikedFiles[i];
                try {
                    const features = await this.computeFeatures(file.path);
                    const clipVector = await this.extractClipEmbedding(file.path);
                    const combined = new Float32Array(576);
                    combined.set(features, 0);
                    if (clipVector) combined.set(clipVector, 64);
                    dislikedFeatures.push(Array.from(combined));

                    if ((i + 1) % 10 === 0) {
                        this.updateProgressNotification(`Processing dislikes: ${i + 1}/${dislikedFiles.length}`);
                    }
                } catch (err) {
                    console.warn(`Skipping ${file.name}:`, err.message);
                }
            }

            // Re-apply corrective bulk ratings (these files stay in the source folder and are
            // never in the like/dislike folders, so a from-scratch rebuild can't recover them).
            const bulkExamples = await this.collectBulkRatedTrainingExamples();
            likedFeatures.push(...bulkExamples.liked);
            dislikedFeatures.push(...bulkExamples.disliked);

            // Send to ML worker for training
            if (likedFeatures.length > 0 || dislikedFeatures.length > 0) {
                this.mlWorker.postMessage({
                    type: 'trainHistorical',
                    data: { likedFeatures, dislikedFeatures },
                });
            }

            this.clearProgressNotification();
        } catch (error) {
            console.error('Error training from historical:', error);
            this.clearProgressNotification();
        }
    }

    /**
     * Train from historical ratings and wait for completion
     * Returns a promise that resolves when training is complete
     */
    async trainFromHistoricalRatingsAndWait() {
        return new Promise(async (resolve) => {
            // Store resolve callback to be called when trainReady is received
            this._trainingCompleteCallback = resolve;

            await this.trainFromHistoricalRatings();

            // If no training happened (no files), resolve immediately
            if (!this.customLikeFolder || !this.customDislikeFolder) {
                this._trainingCompleteCallback = null;
                resolve();
            }

            // Set a timeout in case training never responds
            setTimeout(() => {
                if (this._trainingCompleteCallback) {
                    this._trainingCompleteCallback = null;
                    resolve();
                }
            }, 30000); // 30 second timeout
        });
    }

    getCombinedFeatures(filePath) {
        const features = this.featureCache.get(filePath);
        if (!features) return null;

        const combined = new Float32Array(576);
        combined.set(features, 0);

        const clipVector = this.clipCache.get(filePath);
        if (clipVector) {
            combined.set(clipVector, 64);
        }

        return Array.from(combined);
    }

    // True when CLIP is enabled and at least one current file lacks an in-memory CLIP vector.
    // Gates the lazy on-demand extraction trigger in handleSortBySimilarity's CLIP branch so a
    // repeat CLIP sort (vectors already in memory) does not needlessly reload the ~40s feature
    // cache. See docs/superpowers/specs/2026-06-25-extraction-timing-design.md (D3).
    clipVectorsNeedExtraction() {
        if (!this.enableClipFeatures) return false;
        return this.mediaFiles.some((f) => !this.clipCache.has(f.path));
    }

    async loadBulkRatedFile() {
        this.bulkRated = new Map();
        if (!this.baseFolderPath) return;
        try {
            const result = await window.electronAPI.readBulkRatedFile(this.baseFolderPath);
            if (!result.success || !result.data) return;
            const validNames = new Set(this.mediaFiles.map((f) => f.name));
            let pruned = false;
            for (const name of result.data.good || []) {
                if (validNames.has(name)) this.bulkRated.set(name, 'good');
                else pruned = true;
            }
            for (const name of result.data.bad || []) {
                if (validNames.has(name)) this.bulkRated.set(name, 'bad');
                else pruned = true;
            }
            if (pruned) await this.saveBulkRatedFile();
        } catch (err) {
            console.warn('Failed to load .bulk_rated.json:', err.message);
        }
    }

    async saveBulkRatedFile() {
        if (!this.baseFolderPath) return;
        const data = { version: 1, good: [], bad: [] };
        for (const [name, bucket] of this.bulkRated) {
            if (bucket === 'good') data.good.push(name);
            else if (bucket === 'bad') data.bad.push(name);
        }
        try {
            await window.electronAPI.writeBulkRatedFile(this.baseFolderPath, data);
        } catch (err) {
            console.warn('Failed to save .bulk_rated.json:', err.message);
        }
    }

    async requestPredictionScores() {
        if (!this.isMlEnabled || !this.mlWorker) return;

        // Only use cached features - background extraction handles the actual extraction
        // This prevents duplicate progress indicators and competing extraction processes
        const allFeatures = {};

        for (const file of this.mediaFiles) {
            const combined = this.getCombinedFeatures(file.path);
            if (combined) {
                allFeatures[file.name] = combined;
            }
        }

        if (Object.keys(allFeatures).length > 0) {
            this.mlWorker.postMessage({
                type: 'scoreAll',
                data: { allFeatures },
            });
        }
    }

    updatePredictionBadges() {
        // Only show badges when ML sorting is applied
        if (!this.showPredictionBadges || !this.isSortedByPrediction) {
            this.hidePredictionBadges();
            return;
        }

        // For single mode - update current media and hide compare badges
        if (!this.isCompareMode) {
            // Hide compare mode badges
            const leftBadge = document.getElementById('prediction-badge-left');
            const rightBadge = document.getElementById('prediction-badge-right');
            if (leftBadge) leftBadge.style.display = 'none';
            if (rightBadge) rightBadge.style.display = 'none';

            const currentFile = this.mediaFiles[this.currentIndex];
            if (currentFile) {
                const score = this.predictionScores.get(currentFile.path);
                this.displayPredictionBadge(score, 'single');
            }
        } else {
            // Hide single mode badge
            const singleBadge = document.getElementById('prediction-badge-single');
            if (singleBadge) singleBadge.style.display = 'none';

            // For compare mode - use stored references (may be ML-selected or currentIndex-based)
            const leftFile = this.compareLeftFile;
            const rightFile = this.compareRightFile;

            if (leftFile) {
                const leftScore = this.predictionScores.get(leftFile.path);
                this.displayPredictionBadge(leftScore, 'left');
            }
            if (rightFile) {
                const rightScore = this.predictionScores.get(rightFile.path);
                this.displayPredictionBadge(rightScore, 'right');
            }
        }
    }

    // Both Good / Both Bad live in the compare action bar (#compareActionBar) alongside the
    // floating Undo button. They appear only in AI-sorted compare (not tournament — which has
    // its own undo and tournament-aware Like/Dislike). Each button is toggled individually
    // because Undo, their sibling in the same bar, has a different visibility condition.
    updateBulkRateButtonsVisibility() {
        const show = this.isCompareMode && this.isSortedByPrediction && !this.isTournamentMode;
        const display = show ? 'inline-flex' : 'none';
        if (this.bothGoodBtn) this.bothGoodBtn.style.display = display;
        if (this.bothBadBtn) this.bothBadBtn.style.display = display;
    }

    displayPredictionBadge(score, position) {
        const containerId = `prediction-badge-${position}`;
        let badge = document.getElementById(containerId);

        if (score === undefined || score === null || !this.mlStats?.isReady) {
            if (badge) badge.style.display = 'none';
            return;
        }

        if (!badge) {
            badge = document.createElement('div');
            badge.id = containerId;
            badge.className = 'prediction-badge';

            // Add to appropriate container
            let container;
            if (position === 'single') {
                container = this.mediaContainer;
            } else if (position === 'left') {
                container = document.querySelector('.left-media-wrapper');
            } else if (position === 'right') {
                container = document.querySelector('.right-media-wrapper');
            }

            if (container) {
                container.appendChild(badge);
            }
        }

        const percentage = Math.round(score * 100);
        badge.textContent = `${percentage}%`;
        badge.className = `prediction-badge ${score >= 0.6 ? 'high' : score >= 0.4 ? 'medium' : 'low'}`;
        badge.style.display = 'block';
    }

    hidePredictionBadges() {
        ['single', 'left', 'right'].forEach((pos) => {
            const badge = document.getElementById(`prediction-badge-${pos}`);
            if (badge) badge.style.display = 'none';
        });
    }

    updateSortPredictionButton() {
        if (!this.sortPredictionBtn) return;
        // Sorting is disabled in tournament mode — keep the button hidden even if ML events fire.
        if (this.isTournamentMode) {
            this.sortPredictionBtn.style.display = 'none';
            return;
        }

        const isInitialized = this.mlWorker !== null;
        const isReady = this.mlStats?.isReady;
        const likesCount = this.mlStats?.positiveCount || 0;
        const dislikesCount = this.mlStats?.negativeCount || 0;

        // Button is always enabled if ML is enabled (initialization happens on click)
        this.sortPredictionBtn.disabled = false;
        this.sortPredictionBtn.style.display = this.isMlEnabled ? 'inline-flex' : 'none';

        // Update label based on state
        const labelEl = this.sortPredictionBtn.querySelector('.btn-label');
        if (this.isSortedByPrediction) {
            labelEl.textContent = 'Restore Order';
            this.sortPredictionBtn.title = 'Click to restore original order';
        } else if (!isInitialized) {
            // Not initialized yet - show generic label
            labelEl.textContent = 'Sort by Predicted';
            this.sortPredictionBtn.title = 'Click to initialize ML and sort by predicted preference';
        } else if (!isReady) {
            const needLikes = Math.max(0, 3 - likesCount);
            const needDislikes = Math.max(0, 3 - dislikesCount);
            labelEl.textContent = `Need ${needLikes}+ likes, ${needDislikes}+ dislikes`;
            this.sortPredictionBtn.title = 'Rate more files to enable prediction sorting';
        } else {
            labelEl.textContent = 'Sort by Predicted';
            this.sortPredictionBtn.title = 'Sort by predicted preference (learned from your ratings)';
        }
    }

    async handleSortByPrediction() {
        // Sorting is disabled in tournament mode (strict/deterministic) — exit first to sort.
        if (this.isTournamentMode) return;
        if (!this.isMlEnabled) {
            this.showNotification('ML prediction is disabled', 'warning');
            return;
        }

        // Toggle sorting - restore original order
        if (this.isSortedByPrediction) {
            // Restore original order, but only for files that still exist
            if (this.originalMediaFiles.length > 0) {
                // Filter to only files that are still in the current list (not moved/rated)
                const currentPaths = new Set(this.mediaFiles.map((f) => f.path));
                this.mediaFiles = this.originalMediaFiles.filter((f) => currentPaths.has(f.path));
            }
            this.isSortedByPrediction = false;
            this.mlComparePairIndex = 0; // Reset ML pair index
            this.currentIndex = 0;
            await this.showMedia();
            this.updateSortPredictionButton();
            this.showNotification('Restored original order', 'info');
            return;
        }

        // Lazy initialization: Initialize ML system on first use
        if (!this.mlWorker || this.featureWorkers.length === 0) {
            this.showNotification('Initializing ML system...', 'info');
            console.log('[ML Debug] Lazy initialization of ML system');

            // Initialize workers
            this.initializeMlWorker();
            this.initializeFeaturePool();

            if (this.enableClipFeatures) {
                this.initClipModel();
            }

            // Wait for ML worker to be ready
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Load cached model
            await this.loadMlModel();
        }

        // Always reload feature cache (cleared by loadFolder() on folder switch)
        await this.loadFeatureCache();

        // Train from historical ratings if not already trained
        if (!this.mlStats?.isReady) {
            this.showNotification('Training model from historical ratings...', 'info');
            await this.trainFromHistoricalRatingsAndWait();
            this.updateSortPredictionButton();
        }

        // Check if model is ready after training
        if (!this.mlStats?.isReady) {
            this.showNotification(
                `Need more ratings (${this.mlStats?.positiveCount || 0} likes, ${this.mlStats?.negativeCount || 0} dislikes)`,
                'warning'
            );
            return;
        }

        // Save original order
        this.originalMediaFiles = [...this.mediaFiles];

        // Check how many files need feature extraction
        const uncachedFiles = this.mediaFiles.filter((f) => !this.featureCache.has(f.path));

        if (uncachedFiles.length > 0) {
            // Start background extraction and wait for completion
            this.showNotification(`Extracting features for ${uncachedFiles.length} files...`, 'info');
            await this.startBackgroundFeatureExtraction();
        }

        // Collect all features from cache
        const allFeatures = {};
        for (const file of this.mediaFiles) {
            const combined = this.getCombinedFeatures(file.path);
            if (combined) {
                allFeatures[file.name] = combined;
            }
        }

        if (Object.keys(allFeatures).length === 0) {
            this.showNotification('Could not extract features from any files', 'error');
            return;
        }

        console.log(`Sending ${Object.keys(allFeatures).length} files for ML sorting`);

        this.mlWorker.postMessage({
            type: 'getSortedOrder',
            data: { allFeatures },
        });
    }

    async updateMlModelAfterRating(filePath, actionType) {
        if (!this.isMlEnabled || !this.mlWorker) return;

        let features = this.featureCache.get(filePath);
        if (!features) {
            try {
                features = await this.computeFeatures(filePath);
            } catch (err) {
                console.warn('Could not extract features for ML update:', err);
                return;
            }
        }

        const combined = this.getCombinedFeatures(filePath);
        if (!combined) return;

        this.mlWorker.postMessage({
            type: 'update',
            data: {
                features: combined,
                label: actionType === 'like' ? 1 : 0,
            },
        });
    }

    /**
     * Update ML model with pre-extracted features (used when file will be moved)
     */
    updateMlModelWithFeatures(features, actionType) {
        if (!this.isMlEnabled || !this.mlWorker) {
            console.log('[ML Debug] Update skipped: ML disabled or worker not ready');
            return;
        }
        if (!features) {
            console.warn('[ML Debug] Update skipped: No features provided!');
            return;
        }

        const label = actionType === 'like' ? 1 : 0;
        console.log(
            `[ML Debug] Sending model update: ${actionType} (label=${label}), features length=${features.length}`
        );

        this.mlWorker.postMessage({
            type: 'update',
            data: {
                features: Array.from(features),
                label: label,
            },
        });
    }

    async applyBulkRating(bucket) {
        if (!this.isSortedByPrediction || !this.isCompareMode) return;
        const left = this.compareLeftFile;
        const right = this.compareRightFile;
        if (!left || !right) return;

        const actionType = bucket === 'good' ? 'like' : 'dislike';
        const bulkFiles = [];
        for (const f of [left, right]) {
            const features = this.getCombinedFeatures(f.path);
            if (features) {
                this.updateMlModelWithFeatures(features, actionType);
            }
            bulkFiles.push({ name: f.name, features });
            this.bulkRated.set(f.name, bucket);
        }

        await this.saveBulkRatedFile();

        this.moveHistory.push({
            bothGood: bucket === 'good',
            bothBad: bucket === 'bad',
            bulkFiles,
            // Pair index BEFORE nextMedia() advances — lets undo return to the rated pair.
            prevPairIndex: this.mlComparePairIndex,
        });

        this.showNotification(
            bucket === 'good'
                ? '👍 Both files marked good (model updated)'
                : '👎 Both files marked bad (model updated)',
            'success'
        );

        this.nextMedia();
    }

    async handleBothGood() {
        await this.applyBulkRating('good');
    }

    async handleBothBad() {
        await this.applyBulkRating('bad');
    }

    /**
     * Reverse a previous ML model update (for undo functionality)
     * @param {Float32Array|number[]} features - Feature vector of the sample
     * @param {string} actionType - Original action ('like' or 'dislike')
     */
    reverseMlModelUpdate(features, actionType) {
        if (!this.isMlEnabled || !this.mlWorker || !features) return;

        this.mlWorker.postMessage({
            type: 'reverseUpdate',
            data: {
                features: Array.from(features),
                label: actionType === 'like' ? 1 : 0,
            },
        });
    }

    /**
     * Extract features from currently displayed media element (single mode)
     */
    async extractFeaturesFromDisplayedMedia() {
        return this.extractFeaturesFromMediaElement(this.currentMedia);
    }

    /**
     * Extract features from a media element (image or video)
     */
    async extractFeaturesFromMediaElement(mediaElement) {
        if (!mediaElement) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        if (mediaElement.tagName === 'VIDEO') {
            // Draw current video frame
            ctx.drawImage(mediaElement, 0, 0, 256, 256);
        } else if (mediaElement.tagName === 'IMG') {
            // Draw image
            ctx.drawImage(mediaElement, 0, 0, 256, 256);
        } else {
            return null;
        }

        const imageData = ctx.getImageData(0, 0, 256, 256);
        return extractFeatures(imageData);
    }

    /**
     * Prioritize feature extraction for currently displayed files
     * Called after showing media to ensure features are ready for rating
     */
    async prioritizeDisplayedFilesExtraction() {
        // Skip silently if ML not initialized yet (will be initialized when user clicks sort button)
        if (!this.isMlEnabled || this.featureWorkers.length === 0) {
            return;
        }

        const filesToExtract = [];

        if (this.isCompareMode) {
            // Compare mode: extract for both displayed files
            if (this.compareLeftFile && !this.featureCache.has(this.compareLeftFile.path)) {
                filesToExtract.push({ file: this.compareLeftFile, media: this.leftMedia, side: 'left' });
            }
            if (this.compareRightFile && !this.featureCache.has(this.compareRightFile.path)) {
                filesToExtract.push({ file: this.compareRightFile, media: this.rightMedia, side: 'right' });
            }
        } else {
            // Single mode: extract for current file
            const currentFile = this.mediaFiles[this.currentIndex];
            if (currentFile && !this.featureCache.has(currentFile.path)) {
                filesToExtract.push({ file: currentFile, media: this.currentMedia, side: 'single' });
            }
        }

        if (filesToExtract.length === 0) return;

        console.log(`[ML Debug] Prioritizing extraction for ${filesToExtract.length} displayed file(s)`);

        // Extract from displayed media elements directly (faster than loading from disk)
        for (const { file, media, side } of filesToExtract) {
            if (media && (media.complete || media.readyState >= 2)) {
                try {
                    const features = await this.extractFeaturesFromMediaElement(media);
                    if (features) {
                        this.featureCache.set(file.path, features);
                        this.featureCacheDirty = true;
                        const prioFileInfo = this.mediaFiles.find((f) => f.path === file.path);
                        if (prioFileInfo) {
                            this.featureMetadata.set(file.path, {
                                size: prioFileInfo.size,
                                mtime: prioFileInfo.mtimeMs || 0,
                            });
                        }
                        console.log(`[ML Debug] Priority extraction complete for ${side}: ${file.name}`);
                    }
                } catch (err) {
                    console.warn(`[ML Debug] Priority extraction failed for ${side}:`, err);
                }
            } else {
                // Media not ready yet, queue for background extraction with high priority
                try {
                    const imageData = await this.loadMediaAsImageData(file.path);
                    await this.enqueueFeatureExtraction(file.path, imageData, 0); // Priority 0 = highest
                    console.log(`[ML Debug] Queued priority extraction for ${side}: ${file.name}`);
                } catch (err) {
                    console.warn(`[ML Debug] Could not queue extraction for ${side}:`, err);
                }
            }
        }
    }

    // ==================== FEATURE EXTRACTION WORKER POOL ====================

    /**
     * Initialize the feature extraction worker pool
     */
    initializeFeaturePool() {
        console.log('[ML Debug] initializeFeaturePool called');
        // Terminate any existing workers
        this.shutdownFeaturePool();

        try {
            for (let i = 0; i < this.featureWorkerCount; i++) {
                const worker = new Worker('feature-worker.js');
                worker.busy = false;
                worker.index = i;

                worker.onmessage = (e) => this.handleFeatureWorkerMessage(i, e.data);
                worker.onerror = (err) => this.handleFeatureWorkerError(i, err);

                this.featureWorkers.push(worker);
            }

            console.log(`[ML Debug] Feature extraction pool initialized with ${this.featureWorkerCount} workers`);

            // Start auto-save interval (every 30 seconds)
            this.startFeatureCacheAutoSave();
        } catch (err) {
            console.warn('[ML Debug] Failed to initialize feature workers:', err);
        }
    }

    // ==================== CLIP FEATURES (Main Process IPC) ====================

    async initClipModel() {
        if (!this.enableClipFeatures) return;
        if (!window.electronAPI.loadClipModel) return;

        // Listen for download progress (returns cleanup function)
        let removeProgressListener;
        if (window.electronAPI.onClipDownloadProgress) {
            removeProgressListener = window.electronAPI.onClipDownloadProgress((data) => {
                this.clipModelDownloading = true;
                if (data.progress % 10 === 0) {
                    this.showNotification(`Downloading CLIP model... ${data.progress}%`, 'info');
                }
            });
        }

        try {
            const result = await window.electronAPI.loadClipModel();
            this.clipModelDownloading = false;
            if (result.success) {
                this.clipWorkerReady = true;
                this.showNotification('CLIP model loaded', 'success');
            } else {
                this.clipWorkerReady = false;
                console.error('CLIP model failed to load:', result.error);
                this.showNotification('CLIP model unavailable — using basic features only', 'warning');
            }
        } catch (err) {
            this.clipWorkerReady = false;
            this.clipModelDownloading = false;
            console.error('CLIP model init error:', err.message);
            this.showNotification('CLIP model unavailable — using basic features only', 'warning');
        } finally {
            if (removeProgressListener) {
                removeProgressListener();
            }
        }
    }

    async extractClipEmbedding(filePath, _imageData = null) {
        if (!this.clipWorkerReady || !this.enableClipFeatures) {
            return null;
        }

        const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);

        if (isVideo) {
            return this.extractClipFromVideo(filePath);
        }

        if (this.isJxl(filePath)) {
            try {
                const decoded = await this.decodeJxl(filePath);
                if (!decoded.frames || decoded.frames.length === 0) {
                    return null;
                }
                // Send a COPY of the cached frame-0 PNG bytes (no transfer — display still needs them).
                const result = await window.electronAPI.extractClipEmbeddingFromBuffer(decoded.frames[0].pngBytes);
                if (result.success) {
                    return new Float32Array(result.embedding);
                }
                console.warn('CLIP extraction failed (jxl):', result.error);
                return null;
            } catch (err) {
                console.warn('CLIP extraction error (jxl):', err.message);
                return null;
            }
        }

        try {
            const result = await window.electronAPI.extractClipEmbedding(filePath);
            if (result.success) {
                return new Float32Array(result.embedding);
            }
            console.warn('CLIP extraction failed:', result.error);
            return null;
        } catch (err) {
            console.warn('CLIP extraction error:', err.message);
            return null;
        }
    }

    async extractClipFromVideo(filePath) {
        if (!window.electronAPI.extractKeyframes) return null;

        try {
            const result = await window.electronAPI.extractKeyframes(filePath, 20);
            if (!result.success || !result.framePaths || result.framePaths.length === 0) {
                return null;
            }

            const batchResult = await window.electronAPI.extractClipEmbeddingBatch(result.framePaths);

            // Clean up temp files
            if (result.tempDir) {
                window.electronAPI.cleanupKeyframes(result.tempDir).catch(() => {});
            }

            if (batchResult.success) {
                return new Float32Array(batchResult.embedding);
            }
            return null;
        } catch (err) {
            console.warn('Video CLIP extraction failed:', err.message);
            return null;
        }
    }

    /**
     * Shutdown the feature extraction worker pool
     */
    shutdownFeaturePool() {
        this.stopFeatureCacheAutoSave();
        this.cancelBackgroundExtraction();

        for (const worker of this.featureWorkers) {
            try {
                worker.terminate();
            } catch (_e) {
                // Ignore termination errors
            }
        }

        this.featureWorkers = [];
        this.featureTaskQueue = [];

        // Reject all pending tasks
        for (const [_taskId, task] of this.featurePendingTasks) {
            task.reject(new Error('Worker pool shutdown'));
        }
        this.featurePendingTasks.clear();
    }

    /**
     * Handle message from a feature extraction worker
     * @param {number} workerIndex - Index of the worker
     * @param {Object} message - Message from worker
     */
    handleFeatureWorkerMessage(workerIndex, message) {
        const worker = this.featureWorkers[workerIndex];
        if (!worker) return;

        switch (message.type) {
            case 'result': {
                const task = this.featurePendingTasks.get(message.id);
                if (task) {
                    // Store in cache
                    const features = new Float32Array(message.features);
                    this.featureCache.set(task.filePath, features);
                    this.featureCacheDirty = true;
                    // Store metadata for cache serialization
                    const fileInfo = this.mediaFiles.find((f) => f.path === task.filePath);
                    if (fileInfo) {
                        this.featureMetadata.set(task.filePath, {
                            size: fileInfo.size,
                            mtime: fileInfo.mtimeMs || 0,
                        });
                    }

                    task.resolve(features);
                    this.featurePendingTasks.delete(message.id);
                }

                worker.busy = false;
                this.dispatchNextFeatureTask();
                break;
            }

            case 'error': {
                const task = this.featurePendingTasks.get(message.id);
                if (task) {
                    if (task.retries < 2) {
                        // Retry the task
                        task.retries++;
                        this.featureTaskQueue.unshift(task);
                        console.warn(`Retrying feature extraction for ${task.filePath} (attempt ${task.retries + 1})`);
                    } else {
                        task.reject(new Error(message.message));
                    }
                    this.featurePendingTasks.delete(message.id);
                }

                worker.busy = false;
                this.dispatchNextFeatureTask();
                break;
            }

            case 'progress':
                // Progress from batch operations (not used for single extractions)
                break;
        }
    }

    /**
     * Handle error from a feature extraction worker
     * @param {number} workerIndex - Index of the worker
     * @param {Error} error - Error object
     */
    handleFeatureWorkerError(workerIndex, error) {
        console.error(`Feature worker ${workerIndex} error:`, error);

        // Respawn the crashed worker
        try {
            const oldWorker = this.featureWorkers[workerIndex];
            if (oldWorker) {
                oldWorker.terminate();
            }

            const newWorker = new Worker('feature-worker.js');
            newWorker.busy = false;
            newWorker.index = workerIndex;
            newWorker.onmessage = (e) => this.handleFeatureWorkerMessage(workerIndex, e.data);
            newWorker.onerror = (err) => this.handleFeatureWorkerError(workerIndex, err);

            this.featureWorkers[workerIndex] = newWorker;
            console.log(`Feature worker ${workerIndex} respawned`);

            this.dispatchNextFeatureTask();
        } catch (err) {
            console.error(`Failed to respawn feature worker ${workerIndex}:`, err);
        }
    }

    /**
     * Calculate priority for a file based on distance from current index
     * Lower value = higher priority
     * @param {number} fileIndex - Index of the file in mediaFiles
     * @returns {number} Priority value
     */
    calculateFeaturePriority(fileIndex) {
        const distance = Math.abs(fileIndex - this.currentIndex);
        // Slightly prefer forward direction
        const direction = fileIndex >= this.currentIndex ? 0 : 1;
        return distance * 2 + direction;
    }

    /**
     * Enqueue a file for feature extraction
     * @param {string} filePath - Path to the file
     * @param {ImageData} imageData - Extracted image data
     * @param {number} priority - Priority value (lower = higher priority)
     * @returns {Promise<Float32Array>} Promise resolving to features
     */
    enqueueFeatureExtraction(filePath, imageData, priority) {
        // Check cache first
        if (this.featureCache.has(filePath)) {
            return Promise.resolve(this.featureCache.get(filePath));
        }

        const taskId = ++this.featureTaskIdCounter;

        return new Promise((resolve, reject) => {
            const task = {
                id: taskId,
                filePath,
                imageData,
                priority,
                retries: 0,
                resolve,
                reject,
            };

            // Insert into priority queue (sorted by priority)
            const insertIndex = this.featureTaskQueue.findIndex((t) => t.priority > priority);
            if (insertIndex === -1) {
                this.featureTaskQueue.push(task);
            } else {
                this.featureTaskQueue.splice(insertIndex, 0, task);
            }

            this.dispatchNextFeatureTask();
        });
    }

    /**
     * Dispatch the next task to an available worker
     */
    dispatchNextFeatureTask() {
        if (this.featureTaskQueue.length === 0) return;

        // Find an available worker
        const availableWorker = this.featureWorkers.find((w) => !w.busy);
        if (!availableWorker) return;

        const task = this.featureTaskQueue.shift();
        availableWorker.busy = true;

        this.featurePendingTasks.set(task.id, task);

        // Send to worker
        availableWorker.postMessage({
            type: 'extract',
            data: {
                id: task.id,
                pixels: task.imageData.data,
                width: task.imageData.width,
                height: task.imageData.height,
            },
        });
    }

    /**
     * Cancel all pending feature extractions
     */
    cancelPendingFeatureExtractions() {
        // Clear the queue
        for (const task of this.featureTaskQueue) {
            task.reject(new Error('Extraction cancelled'));
        }
        this.featureTaskQueue = [];

        // Note: We don't cancel in-flight tasks, they will complete and be ignored
    }

    /**
     * Load media file and extract ImageData for worker processing
     * @param {string} filePath - Path to the media file
     * @returns {Promise<ImageData>} Promise resolving to ImageData
     */
    loadMediaAsImageData(filePath) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Media load timeout'));
            }, 15000);

            const cleanup = () => clearTimeout(timeout);

            const processMedia = (mediaElement) => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 256;
                    canvas.height = 256;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(mediaElement, 0, 0, 256, 256);
                    const imageData = ctx.getImageData(0, 0, 256, 256);
                    cleanup();
                    resolve(imageData);
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            };

            const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);

            if (isVideo) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;

                video.addEventListener('loadeddata', () => {
                    video.currentTime = 0.1;
                });

                video.addEventListener('seeked', () => {
                    processMedia(video);
                    video.src = '';
                });

                video.addEventListener('error', () => {
                    cleanup();
                    reject(new Error('Video load error'));
                });

                video.src = filePath;
            } else {
                const img = new Image();

                img.addEventListener('load', () => {
                    processMedia(img);
                });

                img.addEventListener('error', () => {
                    cleanup();
                    reject(new Error('Image load error'));
                });

                if (this.isJxl(filePath)) {
                    this.decodeJxl(filePath)
                        .then((decoded) => {
                            if (!decoded.frames || decoded.frames.length === 0) {
                                cleanup();
                                reject(new Error('JXL decoded with no frames'));
                                return;
                            }
                            // Local, self-contained object URL: revoke as soon as the img loads/fails.
                            // (Do NOT use jxlFrameToObjectURL here — that set is revoked on media-display
                            //  cleanup and could revoke this in-flight extraction URL mid-load.)
                            const url = URL.createObjectURL(
                                new Blob([decoded.frames[0].pngBytes], { type: 'image/png' })
                            );
                            img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
                            img.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
                            img.src = url;
                        })
                        .catch((err) => {
                            cleanup();
                            reject(new Error('JXL decode failed: ' + (err && err.message ? err.message : err)));
                        });
                } else {
                    img.src = filePath;
                }
            }
        });
    }

    async kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        // No folder loaded → nothing to extract. Defensive: the lazy CLIP-sort caller already
        // gates on clipVectorsNeedExtraction() (false for an empty folder), so this guards any
        // future caller and avoids a surprise ~87 MB model download with nothing on screen.
        if (this.mediaFiles.length === 0) return;
        try {
            // Fire immediately, before the awaited cache-load / model-load, so the
            // otherwise-silent kickoff window (and the kickoff-never-fired failure
            // class) is visible. Transient info toast (auto-dismisses in 2s).
            this.showNotification('⏳ Starting feature extraction…', 'info');
            if (this.featureWorkers.length === 0) {
                this.initializeFeaturePool();
            }
            // loadFolder() clears featureCache/clipCache/featureMetadata; rehydrate from
            // disk before extraction so cached entries are honored on every folder switch.
            await this.loadFeatureCache();
            // Await CLIP model load so extraction sees clipWorkerReady === true. Without
            // this, on cold start (first 87 MB download) every extractClipEmbedding call
            // returns null while the IPC is in flight and the run silently completes
            // with zero CLIP vectors.
            if (!this.clipWorkerReady) {
                await this.initClipModel();
            }
            await this.startBackgroundFeatureExtraction();
        } catch (err) {
            if (window.electronAPI?.logError) {
                window.electronAPI.logError(`Background extraction failed: ${err?.message ?? err}`);
            }
        }
    }

    /**
     * Start background feature extraction for all uncached files
     */
    async startBackgroundFeatureExtraction() {
        if (this.featureWorkers.length === 0 || this.mediaFiles.length === 0) {
            return;
        }

        // Cancel any pending CLIP unload — extraction is restarting, keep the model loaded
        if (this.clipUnloadTimer !== null) {
            clearTimeout(this.clipUnloadTimer);
            this.clipUnloadTimer = null;
        }

        // Cancel any existing background extraction
        this.cancelBackgroundExtraction();

        this.isBackgroundExtracting = true;
        this.backgroundExtractionAbort = new AbortController();
        this.extractionStartTime = Date.now();
        this.extractionCompletionTimes = [];
        const runId = ++this.extractionRunId;

        // Get files that need extraction (not in cache, or missing CLIP)
        const filesToProcess = this.mediaFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => {
                const hasFeatures = this.featureCache.has(file.path);
                const hasClip = !this.enableClipFeatures || this.clipCache.has(file.path);
                return !hasFeatures || !hasClip;
            });

        if (filesToProcess.length === 0) {
            this.isBackgroundExtracting = false;
            this.hideBackgroundExtractionProgress();
            this.showNotification(`All ${this.mediaFiles.length} features loaded from cache`, 'success');
            return;
        }

        // Sort by priority (distance from current index)
        filesToProcess.sort((a, b) => this.calculateFeaturePriority(a.index) - this.calculateFeaturePriority(b.index));

        const cachedCount = this.mediaFiles.length - filesToProcess.length;
        let completedCount = cachedCount;
        const totalCount = this.mediaFiles.length;

        // Show progress with cache info
        this.showBackgroundExtractionProgress(completedCount, totalCount, null, false, cachedCount);

        // Process in batches to avoid memory pressure
        const BATCH_SIZE = 10;
        for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
            if (this.backgroundExtractionAbort?.signal.aborted) {
                break;
            }

            // Yield while user is navigating/rating
            await this.awaitExtractionGate(this.backgroundExtractionAbort.signal);
            if (this.backgroundExtractionAbort?.signal.aborted) break;

            const batch = filesToProcess.slice(i, i + BATCH_SIZE);
            const promises = [];

            for (const { file, index } of batch) {
                if (this.backgroundExtractionAbort?.signal.aborted) {
                    break;
                }

                try {
                    const needsHandCrafted = !this.featureCache.has(file.path);
                    const imageData = needsHandCrafted ? await this.loadMediaAsImageData(file.path) : null;
                    const priority = this.calculateFeaturePriority(index);

                    const featurePromise = this.enqueueFeatureExtraction(file.path, imageData, priority)
                        .then(() => {
                            if (this.extractionRunId !== runId) return;
                        })
                        .catch((err) => {
                            if (this.extractionRunId !== runId) return;
                            console.warn(`Feature extraction failed for ${file.name}:`, err.message);
                        });

                    const clipPromise = this.extractClipEmbedding(file.path, imageData)
                        .then((clipVector) => {
                            if (this.extractionRunId !== runId) return;
                            if (clipVector) {
                                this.clipCache.set(file.path, clipVector);
                                this.featureCacheDirty = true;
                            }
                        })
                        .catch((err) => {
                            if (this.extractionRunId !== runId) return;
                            console.warn(`CLIP extraction failed for ${file.name}:`, err.message);
                        });

                    const combinedPromise = Promise.all([featurePromise, clipPromise]).then(() => {
                        if (this.extractionRunId !== runId) return;
                        completedCount++;
                        this.recordExtractionCompletion(completedCount, totalCount);
                    });

                    promises.push(combinedPromise);
                } catch (err) {
                    console.warn(`Failed to load ${file.name}:`, err.message);
                    completedCount++;
                    this.showBackgroundExtractionProgress(completedCount, totalCount);
                }
            }

            // Wait for batch to complete
            await Promise.all(promises);
        }

        this.isBackgroundExtracting = false;

        // Clean up pause state (may still be set if user acted just before completion)
        if (this.extractionResumeTimer !== null) {
            clearTimeout(this.extractionResumeTimer);
            this.extractionResumeTimer = null;
        }
        this.extractionPaused = false;
        if (this.extractionResumeResolve !== null) {
            this.extractionResumeResolve();
            this.extractionResumeResolve = null;
        }

        this.hideBackgroundExtractionProgress();

        // Show completion notification with total time (skip if a new run started)
        if (this.extractionRunId === runId && this.extractionStartTime) {
            const totalSecs = Math.round((Date.now() - this.extractionStartTime) / 1000);
            const timeStr = this.formatElapsed(totalSecs);
            const extractedCount = totalCount - cachedCount;
            const cacheNote = cachedCount > 0 ? ` (${cachedCount} cached, ${extractedCount} extracted)` : '';
            this.showNotification(
                `Feature extraction complete \u2014 ${totalCount} files${cacheNote} in ${timeStr}`,
                'success'
            );
            this.extractionStartTime = null;
        }

        // Save cache after extraction
        if (this.featureCacheDirty) {
            await this.saveFeatureCache();
            this.featureCacheDirty = false;
        }

        // Trigger ML scoring if enabled and model is ready
        if (this.isMlEnabled && this.mlStats?.isReady) {
            this.requestPredictionScores();
        }

        // Schedule CLIP model unload 30s from now to reclaim ~200-400 MB.
        // If extraction restarts within the grace window, the timer is cleared
        // at the start of startBackgroundFeatureExtraction(). The existing
        // loadClipModel() lazy path re-loads transparently on next CLIP IPC.
        if (this.enableClipFeatures) {
            this.clipUnloadTimer = setTimeout(() => this._handleClipUnloadTimer(), CLIP_UNLOAD_DELAY_MS);
        }
    }

    // Timer callback: unload the CLIP model after the idle grace window. Re-checks
    // enableClipFeatures at fire time (toggle-off during the window cancels the unload),
    // awaits the IPC + handles errors, and only resets clipWorkerReady on a SUCCESSFUL
    // unload — the IPC returns { success:false, reason:'loading' } when a load is in
    // flight, in which case the model stays resident and the flag must stay true.
    async _handleClipUnloadTimer() {
        this.clipUnloadTimer = null;
        if (!this.enableClipFeatures) return;
        try {
            const result = await window.electronAPI.unloadClipModel();
            if (result && result.success) {
                this.clipWorkerReady = false;
            }
        } catch (err) {
            window.electronAPI.logError('CLIP model unload failed: ' + (err && err.message ? err.message : err));
        }
    }

    /**
     * Cancel background feature extraction
     */
    cancelBackgroundExtraction() {
        if (this.backgroundExtractionAbort) {
            this.backgroundExtractionAbort.abort();
            this.backgroundExtractionAbort = null;
        }

        // Clear pause state
        if (this.extractionResumeTimer !== null) {
            clearTimeout(this.extractionResumeTimer);
            this.extractionResumeTimer = null;
        }
        this.extractionPaused = false;
        if (this.extractionResumeResolve !== null) {
            this.extractionResumeResolve();
            this.extractionResumeResolve = null;
        }

        this.cancelPendingFeatureExtractions();
        this.isBackgroundExtracting = false;
        this.extractionStartTime = null;
        this.extractionCompletionTimes = [];
        this._extractionCachedCount = 0;
        this.hideBackgroundExtractionProgress();
    }

    /**
     * Signal that the user performed a navigation or rating action.
     * Pauses background extraction and schedules resume after 2s idle.
     */
    signalUserActivity() {
        if (!this.isBackgroundExtracting) return;

        // Reset the idle timer on every activity signal (debounce)
        if (this.extractionResumeTimer !== null) {
            clearTimeout(this.extractionResumeTimer);
        }

        if (!this.extractionPaused) {
            this.extractionPaused = true;
            // Show paused state in progress indicator
            this.showBackgroundExtractionProgress(null, null, null, true);
        }

        this.extractionResumeTimer = setTimeout(() => {
            this.resumeExtraction();
        }, 2000);
    }

    /**
     * Resume extraction after idle period. Called by the resume timer.
     */
    resumeExtraction() {
        this.extractionResumeTimer = null;
        if (!this.extractionPaused) return;
        this.extractionPaused = false;

        // Reset indicator from "Paused" to "Extracting" immediately
        this.showBackgroundExtractionProgress(null, null, null, false);

        // Unblock the awaiting gate
        if (this.extractionResumeResolve !== null) {
            this.extractionResumeResolve();
            this.extractionResumeResolve = null;
        }
    }

    /**
     * Async gate for the extraction loop. Resolves immediately when not paused;
     * blocks until resumeExtraction() is called when paused.
     * @param {AbortSignal} signal - Abort signal to unblock on cancellation
     * @returns {Promise<void>}
     */
    awaitExtractionGate(signal) {
        if (!this.extractionPaused || signal.aborted) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.extractionResumeResolve = resolve;
            signal.addEventListener('abort', resolve, { once: true });
        });
    }

    /**
     * Record a file completion and update extraction progress with ETA
     * @param {number} completedCount - Files completed so far
     * @param {number} totalCount - Total files to process
     */
    recordExtractionCompletion(completedCount, totalCount) {
        if (!this.isBackgroundExtracting) return;

        const now = Date.now();
        this.extractionCompletionTimes.push(now);
        if (this.extractionCompletionTimes.length > 20) {
            this.extractionCompletionTimes.shift();
        }

        let etaText = null;
        const times = this.extractionCompletionTimes;
        const remaining = totalCount - completedCount;
        if (remaining > 0 && times.length >= 5) {
            const elapsed = times[times.length - 1] - times[0];
            if (elapsed > 0) {
                const rate = (times.length - 1) / (elapsed / 1000); // files per second
                const etaSeconds = remaining / rate;
                etaText = this.formatEta(etaSeconds);
            }
        }

        this.showBackgroundExtractionProgress(completedCount, totalCount, etaText);
    }

    /**
     * Show subtle background extraction progress indicator
     * @param {number} current - Current count
     * @param {number} total - Total count
     * @param {string|null} etaText - Formatted ETA string (e.g. "~3m 12s")
     * @param {boolean} [paused=false] - When true, renders paused state instead of extracting
     */
    showBackgroundExtractionProgress(current, total, etaText = null, paused = false, cachedCount = 0) {
        // Store last known counts for paused state redisplay
        if (current !== null) this._extractionLastCurrent = current;
        if (total !== null) this._extractionLastTotal = total;
        if (cachedCount > 0) this._extractionCachedCount = cachedCount;
        const displayCached = this._extractionCachedCount || 0;
        const displayCurrent = current ?? this._extractionLastCurrent ?? 0;
        const displayTotal = total ?? this._extractionLastTotal ?? 0;

        let indicator = document.getElementById('featureExtractionProgress');

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'featureExtractionProgress';
            indicator.style.cssText = `
                position: fixed;
                bottom: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 1000;
                display: flex;
                align-items: center;
                gap: 8px;
                backdrop-filter: blur(4px);
            `;
            document.body.appendChild(indicator);
        }

        const percentage = displayTotal > 0 ? Math.round((displayCurrent / displayTotal) * 100) : 0;

        if (paused) {
            indicator.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
                <span>Paused \u2014 ${displayCurrent}/${displayTotal} (${percentage}%)${displayCached > 0 ? ` \u2014 ${displayCached} cached` : ''}</span>
            `;
        } else {
            const etaSuffix = etaText ? ` \u2014 ${etaText}` : '';
            indicator.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                    <path d="M12 2v4m0 12v4m-7-7H3m18 0h-2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4"/>
                </svg>
                <span>Extracting features: ${displayCurrent}/${displayTotal} (${percentage}%)${displayCached > 0 ? ` \u2014 ${displayCached} cached` : ''}${etaSuffix}</span>
            `;
        }

        // Add spin animation if not already present
        if (!document.getElementById('featureExtractionSpinStyle')) {
            const style = document.createElement('style');
            style.id = 'featureExtractionSpinStyle';
            style.textContent = `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Hide background extraction progress indicator
     */
    hideBackgroundExtractionProgress() {
        const indicator = document.getElementById('featureExtractionProgress');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Start auto-save interval for feature cache
     */
    startFeatureCacheAutoSave() {
        this.stopFeatureCacheAutoSave();

        this.featureCacheAutoSaveInterval = setInterval(async () => {
            if (this.featureCacheDirty && this.baseFolderPath) {
                await this.saveFeatureCache();
                this.featureCacheDirty = false;
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Stop auto-save interval
     */
    stopFeatureCacheAutoSave() {
        if (this.featureCacheAutoSaveInterval) {
            clearInterval(this.featureCacheAutoSaveInterval);
            this.featureCacheAutoSaveInterval = null;
        }
    }

    loadShortcuts() {
        const raw = localStorage.getItem('customShortcuts');
        let custom = {};
        if (raw) {
            try {
                custom = JSON.parse(raw);
            } catch (_e) {
                // Invalid JSON — ignore and use defaults
            }
        }
        // One-time migration. saveShortcut persists the FULL shortcuts object, so a binding
        // frozen before a default change (e.g. next: 'KeyD') would otherwise override the new
        // default (next: 'KeyS') forever. Bump the version and drop the now-stale overrides so
        // the new defaults reach existing users; intentional remaps of other actions are kept.
        // v1 -> v2: 'next' remapped KeyD -> KeyS in single + compare (compare also gained
        // bothGood/bothBad, which simply fall through to defaults since they were never stored).
        if (raw && (custom.version || 1) < 2) {
            if (custom.single) delete custom.single.next;
            if (custom.compare) delete custom.compare.next;
            custom.version = 2;
            if (typeof localStorage.setItem === 'function') {
                localStorage.setItem('customShortcuts', JSON.stringify(custom));
            }
        }
        return {
            single: Object.assign({}, DEFAULT_SHORTCUTS.single, custom.single),
            compare: Object.assign({}, DEFAULT_SHORTCUTS.compare, custom.compare),
            tournament: Object.assign({}, DEFAULT_SHORTCUTS.tournament, custom.tournament),
        };
    }

    buildKeyString(e) {
        let key = '';
        if (e.ctrlKey) key += 'Ctrl+';
        if (e.shiftKey) key += 'Shift+';
        key += e.code;
        return key;
    }

    buildReverseMap() {
        const reverse = { single: {}, compare: {}, tournament: {} };
        for (const mode of ['single', 'compare', 'tournament']) {
            for (const [action, key] of Object.entries(this.shortcuts[mode] ?? {})) {
                reverse[mode][key] = action;
            }
        }
        return reverse;
    }

    executeAction(action) {
        const actions = {
            like: () => this.handleLike(),
            dislike: () => this.handleDislike(),
            next: () => this.nextMedia(),
            previous: () => this.previousMedia(),
            undo: () => {
                if (this.isTournamentMode) {
                    this.handleTournamentUndo();
                } else {
                    this.handleCancel();
                }
            },
            leftLike: () => this.handleLeftLike(),
            leftDislike: () => this.handleLeftDislike(),
            rightLike: () => this.handleRightLike(),
            rightDislike: () => this.handleRightDislike(),
            bothGood: () => this.handleBothGood(),
            bothBad: () => this.handleBothBad(),
            bothWin: () => this.handleTournamentDraw('win'),
            bothLose: () => this.handleTournamentDraw('lose'),
            leftSpecial: () => {
                if (this.isTournamentMode) this.handleTournamentSpecial('left');
            },
            rightSpecial: () => {
                if (this.isTournamentMode) this.handleTournamentSpecial('right');
            },
        };
        actions[action]?.();
    }

    checkShortcutConflict(mode, currentAction, newKey) {
        // Block reserved keys used by fixed utility shortcuts
        const reservedKeys = ['F1', 'Space', 'KeyI', 'KeyZ', 'KeyX', 'Escape'];
        if (reservedKeys.includes(newKey)) {
            return '_reserved';
        }
        for (const [action, key] of Object.entries(this.shortcuts[mode])) {
            if (key === newKey && action !== currentAction) {
                return action;
            }
        }
        return null;
    }

    saveShortcut(mode, action, newKey) {
        this.shortcuts[mode][action] = newKey;
        this.shortcutReverseMap = this.buildReverseMap();

        // Persist the current shortcuts — loadShortcuts merges on load so full save is safe.
        // version must be written so the v1->v2 migration in loadShortcuts does not re-run and
        // clobber an intentional 'next' remap on the next load.
        const custom = {
            version: 2,
            single: Object.assign({}, this.shortcuts.single),
            compare: Object.assign({}, this.shortcuts.compare),
        };
        localStorage.setItem('customShortcuts', JSON.stringify(custom));
    }

    keyDisplayName(keyStr) {
        return keyStr.replace('Key', '').replace('Digit', '').replace('+Key', '+').replace('+Digit', '+');
    }

    renderShortcutRows() {
        const singleGrid = document.getElementById('shortcutSingleGrid');
        const compareGrid = document.getElementById('shortcutCompareGrid');
        if (!singleGrid || !compareGrid) return;

        singleGrid.innerHTML = '';
        compareGrid.innerHTML = '';

        for (const [action, key] of Object.entries(this.shortcuts.single)) {
            const row = document.createElement('div');
            row.className = 'shortcut-item';
            row.innerHTML = `<kbd class="shortcut-key" data-action="${action}" data-mode="single">${this.keyDisplayName(key)}</kbd> <span>${ACTION_LABELS[action]}</span>`;
            singleGrid.appendChild(row);
        }

        for (const [action, key] of Object.entries(this.shortcuts.compare)) {
            const row = document.createElement('div');
            row.className = 'shortcut-item';
            row.innerHTML = `<kbd class="shortcut-key" data-action="${action}" data-mode="compare">${this.keyDisplayName(key)}</kbd> <span>${ACTION_LABELS[action]}</span>`;
            compareGrid.appendChild(row);
        }
    }

    startListeningMode(kbdElement) {
        this.stopListeningMode();

        const action = kbdElement.dataset.action;
        const mode = kbdElement.dataset.mode;

        kbdElement.classList.add('listening');
        kbdElement.textContent = 'Press a key...';

        const existingWarning = kbdElement.parentElement.querySelector('.shortcut-conflict-warning');
        if (existingWarning) existingWarning.remove();

        this._listeningState = { kbdElement, action, mode };

        this._listeningHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                this.stopListeningMode();
                return;
            }

            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            const newKey = this.buildKeyString(e);
            const conflict = this.checkShortcutConflict(mode, action, newKey);

            if (conflict) {
                const warning = document.createElement('div');
                warning.className = 'shortcut-conflict-warning';
                warning.textContent =
                    conflict === '_reserved'
                        ? 'Reserved key (used by fixed shortcut)'
                        : `Already used by "${ACTION_LABELS[conflict]}"`;
                const existingWarn = kbdElement.parentElement.querySelector('.shortcut-conflict-warning');
                if (existingWarn) existingWarn.remove();
                kbdElement.parentElement.appendChild(warning);
                return;
            }

            this.saveShortcut(mode, action, newKey);
            this.stopListeningMode();
            this.renderShortcutRows();
            this.attachShortcutKeyListeners();
        };

        document.addEventListener('keydown', this._listeningHandler, true);
    }

    stopListeningMode() {
        if (!this._listeningState) return;

        const { kbdElement, action, mode } = this._listeningState;
        kbdElement.classList.remove('listening');
        kbdElement.textContent = this.keyDisplayName(this.shortcuts[mode][action]);

        const warning = kbdElement.parentElement.querySelector('.shortcut-conflict-warning');
        if (warning) warning.remove();

        if (this._listeningHandler) {
            document.removeEventListener('keydown', this._listeningHandler, true);
            this._listeningHandler = null;
        }
        this._listeningState = null;
    }

    attachShortcutKeyListeners() {
        const keys = document.querySelectorAll('.shortcut-key');
        keys.forEach((kbd) => {
            const newKbd = kbd.cloneNode(true);
            kbd.parentNode.replaceChild(newKbd, kbd);
            newKbd.addEventListener('click', () => this.startListeningMode(newKbd));
        });
    }

    resetShortcuts() {
        this.stopListeningMode();
        this.shortcuts = {
            single: Object.assign({}, DEFAULT_SHORTCUTS.single),
            compare: Object.assign({}, DEFAULT_SHORTCUTS.compare),
            tournament: Object.assign({}, DEFAULT_SHORTCUTS.tournament),
        };
        this.shortcutReverseMap = this.buildReverseMap();
        localStorage.removeItem('customShortcuts');
        this.renderShortcutRows?.();
        this.attachShortcutKeyListeners?.();
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
        }
        to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
    }

    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
        to {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
        }
    }

    @keyframes slideOutTop {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
`;
document.head.appendChild(style);

// Initialize the viewer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== MediaViewer Starting ===');
    console.log('DOM loaded, initializing MediaViewer...');
    const viewer = new MediaViewer();
    window.mediaViewer = viewer; // For debugging
    console.log('[ML Debug] MediaViewer initialized. ML setting:', viewer.isMlEnabled);
    console.log('[ML Debug] ML will initialize when "Sort by Prediction" is clicked');
});
