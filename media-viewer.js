// MinHeap (Priority Queue) for efficient MST construction
class MinHeap {
    constructor(compareFunc = (a, b) => a.distance - b.distance) {
        this.heap = [];
        this.compareFunc = compareFunc;
    }

    size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    push(item) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.isEmpty()) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.bubbleDown(0);
        return min;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compareFunc(this.heap[index], this.heap[parentIndex]) >= 0) break;

            [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
            index = parentIndex;
        }
    }

    bubbleDown(index) {
        while (true) {
            let minIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;

            if (leftChild < this.heap.length &&
                this.compareFunc(this.heap[leftChild], this.heap[minIndex]) < 0) {
                minIndex = leftChild;
            }

            if (rightChild < this.heap.length &&
                this.compareFunc(this.heap[rightChild], this.heap[minIndex]) < 0) {
                minIndex = rightChild;
            }

            if (minIndex === index) break;

            [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
            index = minIndex;
        }
    }
}

// VP-Tree (Vantage Point Tree) for fast nearest neighbor search
class VPTree {
    constructor(items, distanceFunc) {
        this.distanceFunc = distanceFunc;
        this.root = this.buildTree(items);
    }

    buildTree(items) {
        if (!items || items.length === 0) return null;

        // Select vantage point (first item for simplicity, could be random)
        const vantagePoint = items[0];

        if (items.length === 1) {
            return { vantagePoint, left: null, right: null, radius: 0 };
        }

        // Calculate distances from vantage point to all other points
        const distances = items.slice(1).map(item => ({
            item,
            distance: this.distanceFunc(vantagePoint, item)
        }));

        // Find median using QuickSelect - O(n) instead of O(n log n) sort
        const medianIndex = Math.floor(distances.length / 2);
        const median = this.quickSelect(distances, medianIndex);
        const radius = median.distance;

        // Split into inside (< radius) and outside (>= radius)
        // QuickSelect already partitioned the array around median
        const inside = [];
        const outside = [];
        for (const d of distances) {
            if (d.distance < radius) {
                inside.push(d.item);
            } else if (d.distance > radius) {
                outside.push(d.item);
            } else {
                // Items equal to radius - split evenly
                if (inside.length <= outside.length) {
                    inside.push(d.item);
                } else {
                    outside.push(d.item);
                }
            }
        }

        return {
            vantagePoint,
            radius,
            left: this.buildTree(inside),
            right: this.buildTree(outside)
        };
    }

    // Partition for QuickSelect - O(n)
    partition(arr, left, right, pivotIndex, compareFunc) {
        const pivotValue = arr[pivotIndex];
        // Move pivot to end
        [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]];
        let storeIndex = left;

        // Move all smaller elements to the left
        for (let i = left; i < right; i++) {
            if (compareFunc(arr[i], pivotValue) < 0) {
                [arr[storeIndex], arr[i]] = [arr[i], arr[storeIndex]];
                storeIndex++;
            }
        }

        // Move pivot to its final position
        [arr[right], arr[storeIndex]] = [arr[storeIndex], arr[right]];
        return storeIndex;
    }

    // QuickSelect - find k-th element in O(n) average case
    quickSelect(arr, k, compareFunc = (a, b) => a.distance - b.distance) {
        if (arr.length === 0) return null;
        if (arr.length === 1) return arr[0];

        let left = 0;
        let right = arr.length - 1;

        while (left <= right) {
            // Use middle as pivot for better average case
            const pivotIndex = Math.floor((left + right) / 2);
            const newPivot = this.partition(arr, left, right, pivotIndex, compareFunc);

            if (newPivot === k) {
                return arr[k];
            } else if (k < newPivot) {
                right = newPivot - 1;
            } else {
                left = newPivot + 1;
            }
        }

        return arr[k];
    }

    findNearest(target, excludeSet = new Set()) {
        if (!this.root) return null;

        let best = { item: null, distance: Infinity };

        const search = (node) => {
            if (!node) return;

            const vp = node.vantagePoint;

            // Skip excluded nodes entirely - don't calculate distance
            if (excludeSet.has(vp)) {
                // Still need to search children, but use Infinity for pruning decisions
                // This prevents excluded nodes from affecting pruning logic
                if (best.distance === Infinity) {
                    // Haven't found any valid candidate yet, must search both sides
                    search(node.left);
                    search(node.right);
                } else {
                    // We have a valid candidate, use normal pruning
                    // But we need targetDistance for pruning - calculate it only for this
                    const targetDistance = this.distanceFunc(target, vp);
                    if (targetDistance < node.radius) {
                        search(node.left);
                        if (targetDistance + best.distance >= node.radius) {
                            search(node.right);
                        }
                    } else {
                        search(node.right);
                        if (targetDistance - best.distance <= node.radius) {
                            search(node.left);
                        }
                    }
                }
                return;
            }

            // Calculate distance once and reuse it
            const targetDistance = this.distanceFunc(target, vp);

            // Check if this is a better match
            if (targetDistance < best.distance) {
                best = { item: vp, distance: targetDistance };
            }

            // Determine which side to search first using the same targetDistance
            if (targetDistance < node.radius) {
                // Target is inside radius, search left first
                search(node.left);
                // Only search right if there could be a closer point
                if (targetDistance + best.distance >= node.radius) {
                    search(node.right);
                }
            } else {
                // Target is outside radius, search right first
                search(node.right);
                // Only search left if there could be a closer point
                if (targetDistance - best.distance <= node.radius) {
                    search(node.left);
                }
            }
        };

        search(this.root);
        return best.item;
    }

    // Find K nearest neighbors (for MST graph construction)
    // Uses bounded max-heap to limit memory and enable early termination
    findKNearest(target, k, excludeSet = new Set()) {
        if (!this.root) return [];

        // Bounded results array - maintain only k best candidates
        const results = []; // Array of {item, distance}, kept sorted descending
        let worstDistance = Infinity; // Max distance in current results

        const search = (node) => {
            if (!node) return;

            const vp = node.vantagePoint;

            // Skip excluded nodes - don't calculate distance
            if (excludeSet.has(vp)) {
                // Still search children
                search(node.left);
                search(node.right);
                return;
            }

            const targetDistance = this.distanceFunc(target, vp);

            // Only consider this node if it's better than worst or we haven't found k yet
            if (results.length < k || targetDistance < worstDistance) {
                // Add to results
                if (results.length < k) {
                    results.push({ item: vp, distance: targetDistance });
                    // Keep sorted descending (worst first)
                    results.sort((a, b) => b.distance - a.distance);
                } else {
                    // Replace worst (first element) if this is better
                    if (targetDistance < results[0].distance) {
                        results[0] = { item: vp, distance: targetDistance };
                        // Re-sort to maintain descending order
                        results.sort((a, b) => b.distance - a.distance);
                    }
                }

                // Update worst distance for pruning
                worstDistance = results.length > 0 ? results[0].distance : Infinity;
            }

            // Search subtrees with pruning based on worstDistance
            if (targetDistance < node.radius) {
                search(node.left);
                // Only search right if there could be a closer point
                if (results.length < k || targetDistance + worstDistance >= node.radius) {
                    search(node.right);
                }
            } else {
                search(node.right);
                // Only search left if there could be a closer point
                if (results.length < k || targetDistance - worstDistance <= node.radius) {
                    search(node.left);
                }
            }
        };

        search(this.root);

        // Return sorted ascending by distance
        return results.reverse();
    }
}

class MediaViewer {
    constructor() {
        this.mediaFiles = [];
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

        // ML Prediction state
        this.mlWorker = null;
        this.featureCache = new Map();      // Map<filePath, Float32Array>
        this.predictionScores = new Map();  // Map<filePath, number (0-1)>
        this.mlModelState = null;           // Persisted model weights
        this.isMlEnabled = localStorage.getItem('mlPredictionEnabled') !== 'false';
        this.showPredictionBadges = localStorage.getItem('showPredictionBadges') !== 'false';
        this.isSortedByPrediction = false;
        this.mlStats = null;                // Current model statistics
        this.compareLeftFile = null;        // Current left file in compare mode (highest score)
        this.compareRightFile = null;       // Current right file in compare mode (lowest score)
        this.mlComparePairIndex = 0;        // Index for ML pair selection (0 = highest vs lowest)

        // Feature extraction worker pool state
        this.featureWorkers = [];           // Array of Worker instances
        this.featureWorkerCount = 4;        // Number of parallel workers
        this.featureTaskQueue = [];         // Priority queue of pending tasks
        this.featurePendingTasks = new Map(); // Map<taskId, {resolve, reject, filePath, retries}>
        this.featureTaskIdCounter = 0;      // Incrementing task ID
        this.isBackgroundExtracting = false;
        this.backgroundExtractionAbort = null; // AbortController for cancellation
        this.featureCacheDirty = false;     // Flag for auto-save
        this.featureCacheAutoSaveInterval = null;

        // User settings
        this.showRatingConfirmations = localStorage.getItem('showRatingConfirmations') !== 'false'; // default: true
        this.autoCloseErrors = localStorage.getItem('autoCloseErrors') === 'true'; // default: false
        this.customLikeFolder = localStorage.getItem('customLikeFolder') || '';
        this.customDislikeFolder = localStorage.getItem('customDislikeFolder') || '';
        this.customSpecialFolder = localStorage.getItem('customSpecialFolder') || '';

        // Zoom state for each view
        this.zoomState = {
            single: { scale: 1, translateX: 0, translateY: 0 },
            left: { scale: 1, translateX: 0, translateY: 0 },
            right: { scale: 1, translateX: 0, translateY: 0 }
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
        this.initializeMlWorker();
        this.initializeFeaturePool();

        if (!window.electronAPI) {
            console.error('Electron API not available');
            this.showError('Electron API not available. Please make sure you\'re running this in Electron.');
        }
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
    }

    updateSortSettingsVisibility() {
        if (!this.sortSettings) return;

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
                lucide.createIcons({ nodes: [modal] });
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

    // Convert Windows path to properly encoded file:// URL
    pathToFileURL(filePath) {
        // Replace backslashes with forward slashes
        let normalized = filePath.replace(/\\/g, '/');
        // Encode special characters while preserving forward slashes and colon
        let encoded = normalized.split('/').map(part => encodeURIComponent(part)).join('/');
        // Add file:// protocol
        return `file:///${encoded}`;
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
                infoNotifications.slice(0, infoNotifications.length - 1).forEach(n => n.remove());
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
        const displayTime = type === 'error'
            ? (this.autoCloseErrors ? 8000 : 0)
            : (type === 'warning' ? 5000 : 2000);
        if (displayTime > 0) {
            const autoCloseTimeout = setTimeout(closeNotification, displayTime);
            closeBtn.addEventListener('click', () => clearTimeout(autoCloseTimeout), { once: true });
        }
    }

    showError(message, options = {}) {
        console.error('Error:', message);
        this.showNotification(`❌ ${message}`, 'error', options);
    }

    removeFailedFile(index, side = null) {
        if (index < 0 || index >= this.mediaFiles.length) return;

        // Remove the file from array
        this.mediaFiles.splice(index, 1);

        // Handle navigation after removal
        if (this.mediaFiles.length === 0) {
            // No files left
            this.showDropZone();
            return;
        }

        // Adjust current index if needed
        if (this.currentIndex >= this.mediaFiles.length) {
            this.currentIndex = Math.max(0, this.mediaFiles.length - 1);
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
            // Update existing notification
            const messageSpan = this.progressNotification.querySelector('.progress-message');
            if (messageSpan) {
                messageSpan.textContent = message;
            }
        }
    }

    // Clear progress notification
    clearProgressNotification() {
        if (this.progressNotification && this.progressNotification.parentNode) {
            this.progressNotification.remove();
            this.progressNotification = null;
        }
    }

    nextMedia() {
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
        }

        if (this.isLoading || this.mediaNavigationInProgress) return;

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
            mlFeatures = this.featureCache.get(currentFile.path);
            if (!mlFeatures && this.currentMedia) {
                try {
                    mlFeatures = await this.extractFeaturesFromDisplayedMedia();
                    if (mlFeatures) {
                        this.featureCache.set(currentFile.path, mlFeatures);
                    }
                } catch (err) {
                    console.warn('Could not extract ML features:', err);
                }
            }
        }

        try {
            // For videos, ensure proper cleanup before moving
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                await this.forceVideoCleanup();
                // Additional wait for file handles to be fully released
                await new Promise(resolve => setTimeout(resolve, 500));
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
                fileName: currentFile.name
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
                mlFeatures: mlFeatures ? Array.from(mlFeatures) : null
            });

            // Show success notification (if enabled)
            if (this.showRatingConfirmations) {
                const fileName = currentFile.name.length > 20 ?
                    currentFile.name.substring(0, 20) + '...' : currentFile.name;
                this.showNotification(
                    `${actionType === 'like' ? '👍' : '👎'} Moved ${fileName} to ${targetFolderName}`,
                    actionType === 'like' ? 'success' : 'dislike'
                );
            }

            // Update ML model with this rating (using pre-extracted features)
            if (mlFeatures) {
                this.updateMlModelWithFeatures(mlFeatures, actionType);
            }

            // Remove current file from array
            this.mediaFiles.splice(this.currentIndex, 1);

            // Adjust current index if necessary
            if (this.currentIndex >= this.mediaFiles.length) {
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

        // Determine which file to move based on mode and side
        let fileToMove;
        let fileIndex;

        if (side === 'left' || side === 'right') {
            // Compare mode
            if (this.mediaFiles.length < 2) return;
            fileIndex = side === 'left' ? this.currentIndex : this.currentIndex + 1;
            fileToMove = this.mediaFiles[fileIndex];

            // Cleanup the specific media before moving
            if (side === 'left' && this.leftMedia) {
                await this.cleanupCompareMedia('left');
            } else if (side === 'right' && this.rightMedia) {
                await this.cleanupCompareMedia('right');
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        } else {
            // Single mode
            if (this.mediaFiles.length === 0) return;
            fileIndex = this.currentIndex;
            fileToMove = this.mediaFiles[fileIndex];

            // For videos, ensure proper cleanup before moving
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                await this.forceVideoCleanup();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        if (!fileToMove) return;

        const targetFolderPath = this.customSpecialFolder;
        const targetFolderName = window.electronAPI.path.basename(targetFolderPath);

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
                fileName: fileToMove.name
            });

            if (!moveResult.success) {
                throw new Error(moveResult.error);
            }

            // Store move in history for undo functionality
            this.moveHistory.push({
                fileName: fileToMove.name,
                originalPath: fileToMove.path,
                newPath: moveResult.targetPath,
                fileSize: fileToMove.size,
                fileType: fileToMove.type,
                actionType: 'special'
            });

            // Show success notification
            if (this.showRatingConfirmations) {
                const fileName = fileToMove.name.length > 20 ?
                    fileToMove.name.substring(0, 20) + '...' : fileToMove.name;
                this.showNotification(
                    `📁 Moved ${fileName} to ${targetFolderName}`,
                    'info'
                );
            }

            // Remove file from array
            this.mediaFiles.splice(fileIndex, 1);

            // Adjust current index if necessary
            if (this.currentIndex >= this.mediaFiles.length) {
                this.currentIndex = Math.max(0, this.mediaFiles.length - 1);
            }

            this.updateFolderInfo();

            // Navigate based on mode
            if (side === 'left' || side === 'right') {
                // In compare mode, show next pair
                if (this.mediaFiles.length >= 2) {
                    this.showMedia();
                } else if (this.mediaFiles.length === 1) {
                    // Only one file left, switch to single mode
                    this.viewMode = 'single';
                    this.updateViewModeUI();
                    this.showMedia();
                } else {
                    // No files left
                    this.showDropZone();
                }
            } else {
                // Single mode - show next media
                if (this.mediaFiles.length > 0) {
                    this.showMedia();
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
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
                if (this.mediaFiles.length > 1 && this.currentIndex < this.mediaFiles.length) {
                    const leftFile = this.mediaFiles[this.currentIndex];
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
                if (this.mediaFiles.length > 1 && this.currentIndex + 1 < this.mediaFiles.length) {
                    const rightFile = this.mediaFiles[this.currentIndex + 1];
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
            this.sortSimilarityBtn.addEventListener('click', () => this.handleSortBySimilarity());
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

        // Folder settings
        this.setupFolderSettings();

        // Compare mode event listeners
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

        document.addEventListener('keydown', (e) => {
            if (this.mediaFiles.length === 0) return;

            if (this.isLoading && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                return;
            }

            // Exit fullscreen and reset zoom with Escape
            if (e.key === 'Escape') {
                e.preventDefault();
                // Exit fullscreen first
                if (this.leftMediaWrapper && this.leftMediaWrapper.classList.contains('fullscreen')) {
                    this.exitFullscreen(this.leftMediaWrapper);
                }
                if (this.rightMediaWrapper && this.rightMediaWrapper.classList.contains('fullscreen')) {
                    this.exitFullscreen(this.rightMediaWrapper);
                }
                // Reset zoom
                if (this.isZoomed()) {
                    this.resetZoom('all');
                    return;
                }
                return;
            }

            // Compare mode shortcuts
            if (this.isCompareMode) {
                // Use e.code for letter keys (keyboard layout independent)
                switch(e.code) {
                    case 'KeyQ':
                        e.preventDefault();
                        if (!this.isLoading) this.handleLeftLike();
                        break;
                    case 'KeyW':
                        e.preventDefault();
                        if (!this.isLoading) this.handleLeftDislike();
                        break;
                    case 'KeyE':
                        e.preventDefault();
                        if (!this.isLoading) this.handleRightLike();
                        break;
                    case 'KeyR':
                        e.preventDefault();
                        if (!this.isLoading) this.handleRightDislike();
                        break;
                    case 'KeyZ':
                        e.preventDefault();
                        if (this.leftMediaWrapper) {
                            this.toggleFullscreen(this.leftMediaWrapper);
                        }
                        break;
                    case 'KeyX':
                        e.preventDefault();
                        if (this.rightMediaWrapper) {
                            this.toggleFullscreen(this.rightMediaWrapper);
                        }
                        break;
                    case 'KeyA':
                        e.preventDefault();
                        if (!this.isLoading) {
                            if (e.ctrlKey) {
                                this.handleCancel();
                            } else {
                                this.previousMedia();
                            }
                        }
                        break;
                    case 'KeyD':
                        e.preventDefault();
                        if (!this.isLoading) this.nextMedia();
                        break;
                }
                // Use e.key for special keys (consistent across layouts)
                if (e.key === 'F1') {
                    e.preventDefault();
                    this.toggleHelp();
                }
                if (e.ctrlKey && e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (!this.isLoading) this.handleCancel();
                }
                return;
            }

            // Single mode shortcuts
            switch(e.key) {
                case ' ':
                    e.preventDefault();
                    if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                        this.togglePlayPause();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (!this.isLoading) this.handleLike();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (!this.isLoading) this.handleDislike();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.ctrlKey) {
                        if (!this.isLoading) this.handleCancel();
                    } else {
                        this.previousMedia();
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextMedia();
                    break;
                case 'F1':
                    e.preventDefault();
                    this.toggleHelp();
                    break;
                case 'KeyI':
                    // Toggle file info panel (only in single mode)
                    if (!this.isCompareMode && this.mediaFiles.length > 0) {
                        e.preventDefault();
                        this.toggleFileInfo();
                    }
                    break;
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
        document.addEventListener('wheel', (e) => {
            // Don't navigate if help overlay is open
            const helpOverlay = document.getElementById('helpOverlay');
            if (helpOverlay && helpOverlay.classList.contains('show')) return;

            if (this.mediaFiles.length === 0 || this.isLoading || this.mediaNavigationInProgress) return;

            // Check if wheel event is over a media element - handle zoom instead of navigation
            const target = e.target;
            const isOverMedia = target.classList.contains('media-display') ||
                               target.closest('.media-wrapper');

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
        }, { passive: false });
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

        [this.controls, this.videoControls, this.navInfo, this.navPrev, this.navNext].forEach(element => {
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

            if (result.files.length === 0) {
                this.showDropZone();
                this.showError('No media files found in the selected folder');
                return;
            }
            
            this.mediaFiles = result.files;
            this.baseFolderPath = folderPath;
            this.currentFolderPath = window.electronAPI.path.basename(folderPath);
            this.currentIndex = 0;
            this.moveHistory = [];
            // Reset sorting state when loading new folder
            this.isSortedBySimilarity = false;
            this.isSortedByPrediction = false;
            this.originalMediaFiles = [];
            this.perceptualHashes.clear();
            this.featureCache.clear();
            this.predictionScores.clear();
            // Cancel any ongoing background extraction
            this.cancelBackgroundExtraction();
            if (this.sortSimilarityBtn) {
                this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Sort by Similarity';
            }
            this.hideDropZone();
            await this.showMedia();
            this.updateFolderInfo();

            console.log(`Successfully loaded ${this.mediaFiles.length} media files`);

            // Initialize ML prediction system (load cached data only, training happens on button click)
            if (this.isMlEnabled) {
                await this.loadMlModel();
                await this.loadFeatureCache();
                this.updateSortPredictionButton();
                // Training and feature extraction starts when user clicks "Sort by Prediction"
            }

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
        // Show view mode button when media is shown
        if (this.viewModeBtn) {
            this.viewModeBtn.style.display = 'inline-flex';
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
    }

    // Improved cleanup method
    cleanupCurrentMedia() {
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
    }

    async showMedia() {
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
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
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        const file = this.mediaFiles[this.currentIndex];
        console.log('Showing media:', file.name);

        const fileUrl = this.pathToFileURL(file.path);

        if (file.type.startsWith('image/')) {
            this.currentMedia = document.createElement('img');
            this.currentMedia.src = fileUrl;
            this.videoControls.style.display = 'none';
            this.setupImageHandlers(file);
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

        this.updateBasicFileInfo(file);
        this.updateNavigationInfo();
    }

    async showCompareMedia() {
        if (this.mediaFiles.length < 2) {
            this.showNotification('Need at least 2 media files for compare mode', 'error');
            this.isCompareMode = false;
            this.toggleViewMode();
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
            this.leftMediaWrapper.remove();
        }
        if (this.rightMediaWrapper) {
            this.rightMediaWrapper.remove();
        }

        await new Promise(resolve => setTimeout(resolve, 50));

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
                .map(f => ({ file: f, score: this.predictionScores.get(f.path) ?? 0.5 }))
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
            console.log(`ML Compare [${pairIndex}]: ${leftFile.name} (${(leftScore * 100).toFixed(1)}%) vs ${rightFile.name} (${(rightScore * 100).toFixed(1)}%)`);
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

        // Safety check: ensure left and right are different files
        if (!leftFile || !rightFile || leftFile === rightFile) {
            console.error('Invalid file selection in compare mode');
            this.isLoading = false;
            this.mediaNavigationInProgress = false;
            this.hideLoadingSpinner();
            return;
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
            this.leftMedia.src = leftFileUrl;
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
            this.rightMedia.src = rightFileUrl;
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
                this.toggleFullscreen(this.leftMediaWrapper);
            }
        });
        this.rightMediaWrapper.addEventListener('click', (e) => {
            if (!this.rightMediaWrapper.classList.contains('fullscreen')) {
                e.stopPropagation();
                this.toggleFullscreen(this.rightMediaWrapper);
            }
        });

        this.leftMediaWrapper.appendChild(this.leftMedia);
        this.rightMediaWrapper.appendChild(this.rightMedia);

        // Add overlay controls to each media wrapper
        this.addMediaOverlayControls(this.leftMediaWrapper, 'left');
        this.addMediaOverlayControls(this.rightMediaWrapper, 'right');

        this.mediaContainer.appendChild(this.leftMediaWrapper);
        this.mediaContainer.appendChild(this.rightMediaWrapper);

        // Update file info for both media
        this.updateCompareFileInfo(leftFile, rightFile);
        this.updateNavigationInfo();
    }

    addMediaOverlayControls(wrapper, side) {
        const controls = document.createElement('div');
        controls.className = `media-overlay-controls media-overlay-controls-${side}`;

        const likeBtn = document.createElement('button');
        likeBtn.className = 'overlay-btn overlay-like-btn';
        likeBtn.innerHTML = '<span class="btn-icon">👍</span><span class="btn-label">Like</span>';
        likeBtn.title = side === 'left' ? 'Like Left (Q)' : 'Like Right (E)';
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'left') this.handleLeftLike();
            else this.handleRightLike();
        });

        const dislikeBtn = document.createElement('button');
        dislikeBtn.className = 'overlay-btn overlay-dislike-btn';
        dislikeBtn.innerHTML = '<span class="btn-icon">👎</span><span class="btn-label">Dislike</span>';
        dislikeBtn.title = side === 'left' ? 'Dislike Left (W)' : 'Dislike Right (R)';
        dislikeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'left') this.handleLeftDislike();
            else this.handleRightDislike();
        });

        controls.appendChild(likeBtn);
        controls.appendChild(dislikeBtn);
        wrapper.appendChild(controls);
    }

    setupCompareImageHandlers(media, file, side) {
        const listeners = side === 'left' ? this.videoEventListenersLeft : this.videoEventListenersRight;

        const onLoad = () => {
            if (media && media.tagName === 'IMG' && !this.isBeingCleaned) {
                media.style.display = 'block';

                // Update file info with dimensions now that image is loaded
                if (this.mediaFiles.length >= 2 && this.currentIndex + 1 < this.mediaFiles.length) {
                    const leftFile = this.mediaFiles[this.currentIndex];
                    const rightFile = this.mediaFiles[this.currentIndex + 1];
                    this.updateCompareFileInfo(leftFile, rightFile);
                }

                // Setup zoom events for the loaded image
                this.setupZoomEvents(media, side);

                // Check if both media are loaded
                const bothLoaded = (!this.leftMedia || this.leftMedia.complete || this.leftMedia.tagName === 'VIDEO') &&
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
                const failedIndex = side === 'left' ? this.currentIndex : this.currentIndex + 1;
                this.showError(`Failed to load image: ${file.name}`, {
                    actionButton: 'Remove',
                    actionCallback: () => this.removeFailedFile(failedIndex, side)
                });
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
            }
        };

        listeners.push(
            { event: 'load', handler: onLoad },
            { event: 'error', handler: onError }
        );

        media.addEventListener('load', onLoad);
        media.addEventListener('error', onError);
    }

    setupCompareVideoHandlers(media, file, side) {
        const listeners = side === 'left' ? this.videoEventListenersLeft : this.videoEventListenersRight;

        const onLoadedMetadata = () => {
            if (media && media.tagName === 'VIDEO' && !this.isBeingCleaned) {
                media.style.display = 'block';

                // Update file info with dimensions and duration now that metadata is loaded
                if (this.mediaFiles.length >= 2 && this.currentIndex + 1 < this.mediaFiles.length) {
                    const leftFile = this.mediaFiles[this.currentIndex];
                    const rightFile = this.mediaFiles[this.currentIndex + 1];
                    this.updateCompareFileInfo(leftFile, rightFile);
                }

                // Setup zoom events for the loaded video
                this.setupZoomEvents(media, side);

                // Check if both media are loaded
                const bothLoaded = (!this.leftMedia || (this.leftMedia.tagName !== 'VIDEO' || this.leftMedia.readyState >= 1)) &&
                                   (!this.rightMedia || (this.rightMedia.tagName !== 'VIDEO' || this.rightMedia.readyState >= 1));

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
                const failedIndex = side === 'left' ? this.currentIndex : this.currentIndex + 1;
                this.showError(`Failed to load video: ${file.name}`, {
                    actionButton: 'Remove',
                    actionCallback: () => this.removeFailedFile(failedIndex, side)
                });
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
            }
        };

        listeners.push(
            { event: 'loadedmetadata', handler: onLoadedMetadata },
            { event: 'error', handler: onError }
        );

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
                    actionCallback: () => this.removeFailedFile(failedIndex)
                });
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
            }
        };

        // Store event listeners for cleanup
        this.videoEventListeners.push(
            { event: 'load', handler: onLoad },
            { event: 'error', handler: onError }
        );

        this.currentMedia.addEventListener('load', onLoad);
        this.currentMedia.addEventListener('error', onError);
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
                    actionCallback: () => this.removeFailedFile(failedIndex)
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
        const displayName = file.name.length > maxLength ? 
            file.name.substring(0, maxLength) + '...' : file.name;
        
        this.fileName.textContent = displayName;
        this.fileName.title = file.name;
        
        let detailsText = this.formatFileSize(file.size);
        detailsText += `\nType: ${file.type}`;
        
        this.fileDetails.textContent = detailsText;
    }

    updateFileInfoWithDimensions(file) {
        const maxLength = 35;
        const displayName = file.name.length > maxLength ? 
            file.name.substring(0, maxLength) + '...' : file.name;
        
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
            }
        }
        
        this.fileDetails.textContent = detailsText;
    }

    updateCompareFileInfo(leftFile, rightFile) {
        // Hide main file info panel in compare mode
        this.fileInfo.classList.remove('show');

        // Update left panel
        const maxLength = 30;
        const leftName = leftFile.name.length > maxLength ?
            leftFile.name.substring(0, maxLength) + '...' : leftFile.name;
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
        const rightName = rightFile.name.length > maxLength ?
            rightFile.name.substring(0, maxLength) + '...' : rightFile.name;
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
            } else if (this.rightMedia.tagName === 'VIDEO' && this.rightMedia.videoWidth && this.rightMedia.videoHeight) {
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
        const folderText = this.currentFolderPath.length > 25 ? 
            this.currentFolderPath.substring(0, 25) + '...' : this.currentFolderPath;
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
        await this.moveCurrentFile('like');
    }

    async handleDislike() {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        await this.moveCurrentFile('dislike');
    }

    async handleCancel() {
        if (this.moveHistory.length === 0) {
            this.showNotification('No moves to undo', 'error');
            return;
        }

        if (this.isLoading) return;

        // In compare mode, restore both files (last two moves)
        if (this.isCompareMode && this.moveHistory.length >= 2) {
            const secondMove = this.moveHistory.pop();
            const firstMove = this.moveHistory.pop();

            try {
                // Restore first file
                const firstMoveResult = await window.electronAPI.moveFile({
                    sourcePath: firstMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: firstMove.fileName
                });

                if (!firstMoveResult.success) {
                    throw new Error(firstMoveResult.error);
                }

                // Restore second file
                const secondMoveResult = await window.electronAPI.moveFile({
                    sourcePath: secondMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: secondMove.fileName
                });

                if (!secondMoveResult.success) {
                    throw new Error(secondMoveResult.error);
                }

                // Add both files back to mediaFiles
                this.mediaFiles.push({
                    name: firstMove.fileName,
                    path: firstMove.originalPath,
                    size: firstMove.fileSize,
                    type: firstMove.fileType
                });

                this.mediaFiles.push({
                    name: secondMove.fileName,
                    path: secondMove.originalPath,
                    size: secondMove.fileSize,
                    type: secondMove.fileType
                });

                // Reverse ML model updates for both files
                if (firstMove.mlFeatures && firstMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(firstMove.mlFeatures, firstMove.actionType);
                }
                if (secondMove.mlFeatures && secondMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(secondMove.mlFeatures, secondMove.actionType);
                }

                this.showNotification(`✅ Restored ${firstMove.fileName}`, 'success');
                this.showNotification(`✅ Restored ${secondMove.fileName}`, 'success');
                this.updateFolderInfo();

                // Store restored files to display them directly (bypasses ML pair selection)
                const restoredFirst = this.mediaFiles.find(f => f.path === firstMove.originalPath);
                const restoredSecond = this.mediaFiles.find(f => f.path === secondMove.originalPath);

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
        } else {
            // Single mode - restore one file
            const lastMove = this.moveHistory.pop();

            try {
                const moveResult = await window.electronAPI.moveFile({
                    sourcePath: lastMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: lastMove.fileName
                });

                if (!moveResult.success) {
                    throw new Error(moveResult.error);
                }

                // Insert file back at current position to maintain order
                this.mediaFiles.splice(this.currentIndex, 0, {
                    name: lastMove.fileName,
                    path: lastMove.originalPath,
                    size: lastMove.fileSize,
                    type: lastMove.fileType
                });

                // Reverse ML model update
                if (lastMove.mlFeatures && lastMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(lastMove.mlFeatures, lastMove.actionType);
                }

                this.showNotification(`✅ Restored ${lastMove.fileName}`, 'success');
                this.updateFolderInfo();

                // currentIndex already points to the restored file's position
                await this.showMedia();

            } catch (error) {
                console.error('Error undoing move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(lastMove);
            }
        }
    }

    // Compare mode methods
    async toggleViewMode() {
        // Hide prediction badges before switching modes
        this.hidePredictionBadges();

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
                this.leftMediaWrapper.remove();
                this.leftMediaWrapper = null;
            }
            if (this.rightMediaWrapper) {
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
            this.viewModeLabel.textContent = 'Single';
            this.controls.style.display = 'flex';
            // Show info toggle button in single mode
            if (this.infoToggleBtn) {
                this.infoToggleBtn.style.display = 'flex';
            }
            this.compareControls.style.display = 'none';
            this.mediaContainer.classList.remove('compare-mode');
            // Hide compare file info panels in single mode
            this.leftFileInfo.classList.remove('show');
            this.rightFileInfo.classList.remove('show');
            this.leftFileInfo.style.display = 'none';
            this.rightFileInfo.style.display = 'none';
            // Show main file info panel in single mode
            this.fileInfo.style.display = 'block';
        }

        // Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Reload media in new mode
        if (this.mediaFiles.length > 0) {
            this.currentIndex = 0;
            this.showMedia();
        }
    }

    async handleLeftLike() {
        if (this.mediaFiles.length < 2 || this.isLoading) return;
        // Left is liked, right is disliked
        await this.moveComparePair('left', 'like', 'dislike');
    }

    async handleLeftDislike() {
        if (this.mediaFiles.length < 2 || this.isLoading) return;
        // Left is disliked, right is liked
        await this.moveComparePair('left', 'dislike', 'like');
    }

    async handleRightLike() {
        if (this.mediaFiles.length < 2 || this.isLoading) return;
        // Right is liked, left is disliked
        await this.moveComparePair('right', 'like', 'dislike');
    }

    async handleRightDislike() {
        if (this.mediaFiles.length < 2 || this.isLoading) return;
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
        const leftFileIndex = this.mediaFiles.findIndex(f => f.path === leftFile.path);
        const rightFileIndex = this.mediaFiles.findIndex(f => f.path === rightFile.path);

        if (leftFileIndex === -1 || rightFileIndex === -1) {
            console.error('Could not find files in mediaFiles array');
            return;
        }

        // Get cached ML features (don't extract on main thread - too slow)
        let leftFeatures = null;
        let rightFeatures = null;
        if (this.isMlEnabled && this.mlWorker) {
            leftFeatures = this.featureCache.get(leftFile.path);
            rightFeatures = this.featureCache.get(rightFile.path);
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
            await new Promise(resolve => setTimeout(resolve, 50));

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
                fileName: primaryFile.name
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
                mlFeatures: primaryFeatures ? Array.from(primaryFeatures) : null
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
                fileName: secondaryFile.name
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
                mlFeatures: secondaryFeatures ? Array.from(secondaryFeatures) : null
            });

            // Show notifications (if enabled)
            if (this.showRatingConfirmations) {
                const primaryFileName = primaryFile.name.length > 20 ?
                    primaryFile.name.substring(0, 20) + '...' : primaryFile.name;
                const secondaryFileName = secondaryFile.name.length > 20 ?
                    secondaryFile.name.substring(0, 20) + '...' : secondaryFile.name;

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
            if (primaryFeatures) {
                this.updateMlModelWithFeatures(primaryFeatures, primaryAction);
            }
            if (secondaryFeatures) {
                this.updateMlModelWithFeatures(secondaryFeatures, secondaryAction);
            }

            // Remove both files from current view (remove higher index first to preserve lower index)
            const higherIndex = Math.max(leftFileIndex, rightFileIndex);
            const lowerIndex = Math.min(leftFileIndex, rightFileIndex);
            this.mediaFiles.splice(higherIndex, 1);
            this.mediaFiles.splice(lowerIndex, 1);

            // Clear stored file references
            this.compareLeftFile = null;
            this.compareRightFile = null;

            // Reset ML pair index to show new highest vs lowest
            this.mlComparePairIndex = 0;

            // Adjust current index to ensure we can show a pair
            if (this.currentIndex >= this.mediaFiles.length - 1) {
                this.currentIndex = 0;
            }

            this.updateFolderInfo();
            await this.showMedia();

        } catch (error) {
            console.error('Error moving compare files:', error);
            this.showError(`Failed to move files: ${error.message}`);
        }
    }

    async cleanupCompareMedia(side) {
        const media = side === 'left' ? this.leftMedia : this.rightMedia;
        const listeners = side === 'left' ? this.videoEventListenersLeft : this.videoEventListenersRight;

        if (!media) return;

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
            await new Promise(resolve => setTimeout(resolve, 100));
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
    }

    toggleFullscreen(wrapper) {
        if (wrapper.classList.contains('fullscreen')) {
            this.exitFullscreen(wrapper);
        } else {
            // Get the video element in this wrapper
            const video = wrapper.querySelector('video');
            const wasPlaying = video && !video.paused;

            // Store playback state on wrapper
            wrapper.dataset.wasPlaying = wasPlaying;

            // Pause other videos in compare mode
            if (this.leftMedia && this.leftMedia.tagName === 'VIDEO' && this.leftMediaWrapper !== wrapper) {
                this.leftMedia.pause();
            }
            if (this.rightMedia && this.rightMedia.tagName === 'VIDEO' && this.rightMediaWrapper !== wrapper) {
                this.rightMedia.pause();
            }

            wrapper.classList.add('fullscreen');

            // Add indicator
            const indicator = document.createElement('div');
            indicator.className = 'fullscreen-indicator';
            indicator.textContent = 'Press ESC or click to exit fullscreen';
            wrapper.appendChild(indicator);

            // Resume video playback if it was playing
            if (video && wasPlaying) {
                // Small delay to ensure fullscreen transition completes
                setTimeout(() => {
                    video.play().catch(err => console.log('Auto-play prevented:', err));
                }, 100);
            }

            // Click to exit (but not on video controls)
            const exitHandler = (e) => {
                // Don't exit if clicking on video controls
                if (video && e.target === video) {
                    return;
                }
                this.exitFullscreen(wrapper);
                wrapper.removeEventListener('click', exitHandler);
            };
            wrapper.addEventListener('click', exitHandler);
        }
    }

    exitFullscreen(wrapper) {
        wrapper.classList.remove('fullscreen');
        const indicator = wrapper.querySelector('.fullscreen-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Restore video playback state if it was playing before fullscreen
        const video = wrapper.querySelector('video');
        if (video && wrapper.dataset.wasPlaying === 'true') {
            video.play().catch(err => console.log('Auto-play prevented:', err));
        }
    }

    // Visual Similarity Sorting Functions

    async handleSortBySimilarity() {
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

        // Warn about large datasets
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

        // Toggle sorting
        if (this.isSortedBySimilarity) {
            // Restore original order
            this.mediaFiles = [...this.originalMediaFiles];
            this.isSortedBySimilarity = false;
            this.currentIndex = 0;
            await this.showMedia();
            this.showNotification('📋 Restored original order', 'success');
            this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Sort by Similarity';
            return;
        }

        try {
            this.isComputingHashes = true;
            this.sortAbortController = new AbortController();
            this.sortSimilarityBtn.disabled = true;
            this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Cancel';
            this.sortSimilarityBtn.disabled = false; // Re-enable for cancel

            // Save original order
            this.originalMediaFiles = [...this.mediaFiles];

            const algorithmNames = {
                'vptree': 'VP-Tree (fastest)',
                'mst': 'MST (best quality)',
                'simple': 'Simple (limited)'
            };
            const algorithmName = algorithmNames[this.sortAlgorithm] || this.sortAlgorithm;

            // Check for cached sort order first
            const cachedSortData = await this.loadSortCache(this.sortAlgorithm);
            if (cachedSortData && cachedSortData.sortedPaths.length > 0) {
                this.updateProgressNotification('🔄 Loading cached sort order...');

                // Load hash cache for inserting new files
                await this.loadHashCache();

                // Apply cached order
                const stats = await this.applyCachedSortOrder(cachedSortData);

                // Save updated hash cache if new files were processed
                if (stats.added > 0) {
                    await this.saveHashCache();
                    // Update sort cache with new files included
                    const currentFile = this.mediaFiles[0];
                    await this.saveSortCache(
                        this.sortAlgorithm,
                        this.mediaFiles.map(f => f.path),
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
                this.showNotification(message, 'success');

                this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Restore Order';
            } else {
                // No cache - perform full sorting
                // Load cached hashes
                const cachedCount = await this.loadHashCache();

                // Show cache location (one notification)
                const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.hash_cache.json');
                this.showNotification(`💾 Cache: ${cacheFile} (${cachedCount} hashes loaded)`, 'info');

                // Start progress notification
                this.updateProgressNotification('🔄 Starting hash computation...');

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
                                this.updateProgressNotification(`🔄 Processing: ${processed}/${total} (${newHashes} new, ${skipped} skipped)`);
                            }
                        } catch (error) {
                            console.error(`Failed to compute hash for ${file.path}:`, error);
                            skipped++;
                            // Update progress notification instead of showing separate warning
                            if (processed % 5 === 0 || processed === total) {
                                this.updateProgressNotification(`🔄 Processing: ${processed}/${total} (${newHashes} new, ${skipped} skipped)`);
                            }
                        }
                    }
                }

                // Check if we have enough hashes to sort
                const filesWithHashes = this.mediaFiles.filter(f => this.perceptualHashes.has(f.path));
                if (filesWithHashes.length < 2) {
                    throw new Error(`Only ${filesWithHashes.length} files have valid hashes. Need at least 2 to sort.`);
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

                this.updateProgressNotification(`🔄 Sorting with ${algorithmName}...`);

                // Get K value for simple algorithm
                const savedK = localStorage.getItem('sortKValue');
                const kValue = savedK ? parseInt(savedK, 10) : 500;

                // Delegate sorting to Web Worker to prevent UI freeze when minimized
                const sortedPaths = await this.runSortingWorker({
                    algorithm: this.sortAlgorithm,
                    mediaFiles: this.mediaFiles.map(f => ({ path: f.path })),
                    hashes: Object.fromEntries(this.perceptualHashes),
                    currentIndex: this.currentIndex,
                    maxComparisons: kValue
                });

                // Reorder mediaFiles based on sorted paths
                const pathToFile = new Map(this.mediaFiles.map(f => [f.path, f]));
                this.mediaFiles = sortedPaths.map(path => pathToFile.get(path)).filter(f => f);

                // Save sort cache for this algorithm
                const currentFile = this.mediaFiles[this.currentIndex];
                await this.saveSortCache(
                    this.sortAlgorithm,
                    this.mediaFiles.map(f => f.path),
                    currentFile ? currentFile.path : null
                );

                // Sorting completed successfully!
                this.isSortedBySimilarity = true;
                this.currentIndex = 0;
                this.clearProgressNotification();

                // Show success notification
                this.showNotification(`✅ Sorted ${filesWithHashes.length} files with ${algorithmName}!`, 'success');

                this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Restore Order';
            }

        } catch (error) {
            console.error('Error sorting by similarity:', error);
            this.clearProgressNotification();
            this.showNotification(`❌ Error: ${error.message}`, 'error');

            // Restore original order if sorting failed
            if (this.originalMediaFiles.length > 0) {
                this.mediaFiles = [...this.originalMediaFiles];
                this.originalMediaFiles = [];
            }
        } finally {
            this.isComputingHashes = false;
            this.sortAbortController = null;
            this.sortSimilarityBtn.disabled = false;
            // Restore button label based on state
            if (this.sortSimilarityBtn) {
                this.sortSimilarityBtn.querySelector('.btn-label').textContent =
                    this.isSortedBySimilarity ? 'Restore Order' : 'Sort by Similarity';
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

                img.src = filePath;
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
                        const gray = imageData.data[idx] * 0.299 +
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
        return result.map(val => val > median ? '1' : '0').join('');
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
                        this.updateProgressNotification(message);
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

    async sortMediaBySimilarity(signal) {
        // Optimized greedy nearest-neighbor algorithm
        // For large datasets, limit comparisons to improve performance
        // Get K value from UI input or use default
        const savedK = localStorage.getItem('sortKValue');
        const MAX_COMPARISONS = savedK ? parseInt(savedK, 10) : 500;

        const sorted = [];
        const remaining = [...this.mediaFiles];
        const total = remaining.length;
        let processed = 0;

        // Start with currently viewed file if it has a hash, otherwise first file with hash
        const currentFile = this.mediaFiles[this.currentIndex];
        let current;
        if (currentFile && this.perceptualHashes.has(currentFile.path)) {
            current = remaining.find(file => file.path === currentFile.path);
        }
        if (!current) {
            current = remaining.find(file => this.perceptualHashes.has(file.path));
        }
        if (!current) return; // No hashes available

        sorted.push(current);
        remaining.splice(remaining.indexOf(current), 1);
        processed++;

        while (remaining.length > 0) {
            // Check for abort during sorting
            if (signal && signal.aborted) {
                throw new Error('Sorting cancelled by user');
            }

            const currentHash = this.perceptualHashes.get(current.path);
            let minDistance = Infinity;
            let nearestIndex = -1;

            // Optimization: limit number of comparisons for large datasets
            const numToCheck = Math.min(remaining.length, MAX_COMPARISONS);

            // If checking subset, use random sampling to avoid locality bias
            // Partial Fisher-Yates shuffle for first K elements - O(K) complexity
            if (numToCheck < remaining.length) {
                for (let i = 0; i < numToCheck; i++) {
                    const j = i + Math.floor(Math.random() * (remaining.length - i));
                    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
                }
            }

            for (let i = 0; i < numToCheck; i++) {
                const file = remaining[i];
                const hash = this.perceptualHashes.get(file.path);

                if (hash) {
                    const distance = this.calculateHammingDistance(currentHash, hash);
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestIndex = i;
                    }
                }
            }

            if (nearestIndex >= 0) {
                current = remaining[nearestIndex];
                sorted.push(current);
                remaining.splice(nearestIndex, 1);
                processed++;

                // Yield to UI every 50 items to prevent freezing
                if (processed % 50 === 0) {
                    this.updateProgressNotification(`🔄 Sorting: ${processed}/${total}`);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            } else {
                // No more files with hashes, add remaining
                sorted.push(...remaining);
                break;
            }
        }

        this.mediaFiles = sorted;
    }

    async sortMediaBySimilarityVPTree(signal) {
        // VP-Tree optimized greedy nearest-neighbor algorithm
        // Complexity: O(n log n) - dramatically faster than O(n²)

        const total = this.mediaFiles.length;
        let processed = 0;

        this.updateProgressNotification('🔄 Building VP-Tree index...');

        // Build VP-Tree with files that have hashes
        const filesWithHashes = this.mediaFiles.filter(f => this.perceptualHashes.has(f.path));
        if (filesWithHashes.length < 2) {
            throw new Error(`Only ${filesWithHashes.length} files have valid hashes. Need at least 2 to sort.`);
        }

        // Distance function for VP-Tree
        const distanceFunc = (file1, file2) => {
            const hash1 = this.perceptualHashes.get(file1.path);
            const hash2 = this.perceptualHashes.get(file2.path);
            return this.calculateHammingDistance(hash1, hash2);
        };

        // Build VP-Tree
        const vpTree = new VPTree(filesWithHashes, distanceFunc);

        this.updateProgressNotification('🔄 Sorting with VP-Tree...');

        // Greedy nearest-neighbor using VP-Tree for O(log n) queries
        const sorted = [];
        const excluded = new Set();

        // Start with currently viewed file if it has a hash, otherwise first file
        const currentFile = this.mediaFiles[this.currentIndex];
        let current = filesWithHashes[0];
        if (currentFile && this.perceptualHashes.has(currentFile.path)) {
            const found = filesWithHashes.find(f => f.path === currentFile.path);
            if (found) current = found;
        }
        sorted.push(current);
        excluded.add(current);
        processed++;

        while (sorted.length < filesWithHashes.length) {
            // Check for abort
            if (signal && signal.aborted) {
                throw new Error('Sorting cancelled by user');
            }

            // Find nearest neighbor using VP-Tree (O(log n))
            const nearest = vpTree.findNearest(current, excluded);

            if (nearest) {
                sorted.push(nearest);
                excluded.add(nearest);
                current = nearest;
                processed++;

                // Yield to UI every 50 items
                if (processed % 50 === 0) {
                    this.updateProgressNotification(`🔄 Sorting: ${processed}/${total}`);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            } else {
                // Should not happen, but add safety
                break;
            }
        }

        // Add files without hashes at the end
        const filesWithoutHashes = this.mediaFiles.filter(f => !this.perceptualHashes.has(f.path));
        sorted.push(...filesWithoutHashes);

        this.mediaFiles = sorted;
    }

    async sortMediaBySimilarityMST(signal) {
        // Minimum Spanning Tree (MST) traversal algorithm
        // Complexity: O(n log n) with optimized sparse graph construction
        // Quality: Better than greedy NN, maintains global similarity structure

        const total = this.mediaFiles.length;

        this.updateProgressNotification('🔄 Building VP-Tree index...');

        // Get files with hashes
        const filesWithHashes = this.mediaFiles.filter(f => this.perceptualHashes.has(f.path));
        if (filesWithHashes.length < 2) {
            throw new Error(`Only ${filesWithHashes.length} files have valid hashes. Need at least 2 to sort.`);
        }

        // Build VP-Tree once for O(log n) queries
        const distanceFunc = (file1, file2) => {
            const hash1 = this.perceptualHashes.get(file1.path);
            const hash2 = this.perceptualHashes.get(file2.path);
            return this.calculateHammingDistance(hash1, hash2);
        };
        const vpTree = new VPTree(filesWithHashes, distanceFunc);

        this.updateProgressNotification('🔄 Building similarity graph with VP-Tree...');

        // Build sparse graph using VP-Tree (O(n log n) instead of O(n²))
        // Dynamic K based on dataset size for better quality
        // Formula: K = min(N-1, max(20, sqrt(N) * 10))
        const N = filesWithHashes.length;
        const K_NEIGHBORS = Math.min(N - 1, Math.max(20, Math.floor(Math.sqrt(N) * 10)));
        console.log(`MST: Using K=${K_NEIGHBORS} neighbors for N=${N} files`);

        const graph = new Map(); // Map<file, Array<{neighbor, distance}>>

        // For each file, find K nearest neighbors using VP-Tree
        for (let i = 0; i < filesWithHashes.length; i++) {
            if (signal && signal.aborted) {
                throw new Error('Sorting cancelled by user');
            }

            const file = filesWithHashes[i];
            // Use VP-Tree to find K nearest - O(log n) instead of O(n)
            const neighbors = vpTree.findKNearest(file, K_NEIGHBORS + 1, new Set([file]));

            // Convert to format expected by graph
            graph.set(file, neighbors.map(({ item, distance }) => ({
                neighbor: item,
                distance
            })));

            if ((i + 1) % 100 === 0) {
                this.updateProgressNotification(`🔄 Building graph: ${i + 1}/${filesWithHashes.length}`);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        this.updateProgressNotification('🔄 Computing MST...');

        // Prim's algorithm for MST with MinHeap
        const mst = new Map(); // Map<file, Array<neighbor>>
        const visited = new Set();
        const pq = new MinHeap(); // Use MinHeap instead of array.sort()

        // Start with currently viewed file if it has a hash, otherwise first file
        let startFile = filesWithHashes[0];
        const currentFile = this.mediaFiles[this.currentIndex];
        if (currentFile && this.perceptualHashes.has(currentFile.path)) {
            const found = filesWithHashes.find(f => f.path === currentFile.path);
            if (found) startFile = found;
        }
        visited.add(startFile);
        mst.set(startFile, []);

        // Add all edges from start file to priority queue
        const startNeighbors = graph.get(startFile) || [];
        for (const { neighbor, distance } of startNeighbors) {
            pq.push({ from: startFile, to: neighbor, distance });
        }

        // Build MST
        while (visited.size < filesWithHashes.length && !pq.isEmpty()) {
            if (signal && signal.aborted) {
                throw new Error('Sorting cancelled by user');
            }

            // Get edge with minimum distance - O(log n) instead of O(n log n)
            const edge = pq.pop();

            if (!edge || visited.has(edge.to)) continue;

            // Add edge to MST
            visited.add(edge.to);
            if (!mst.has(edge.from)) mst.set(edge.from, []);
            if (!mst.has(edge.to)) mst.set(edge.to, []);
            mst.get(edge.from).push(edge.to);
            mst.get(edge.to).push(edge.from);

            // Add edges from newly visited node
            const neighbors = graph.get(edge.to) || [];
            for (const { neighbor, distance } of neighbors) {
                if (!visited.has(neighbor)) {
                    pq.push({ from: edge.to, to: neighbor, distance });
                }
            }

            if (visited.size % 100 === 0) {
                this.updateProgressNotification(`🔄 MST progress: ${visited.size}/${filesWithHashes.length}`);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        this.updateProgressNotification('🔄 Traversing MST...');

        // Greedy traversal of MST: always choose nearest unvisited neighbor
        // This produces better visual ordering than DFS
        const sorted = [];
        const traversed = new Set();

        let current = startFile;
        traversed.add(current);
        sorted.push(current);

        while (sorted.length < filesWithHashes.length) {
            const neighbors = mst.get(current) || [];

            // Find nearest unvisited neighbor
            let nearestNeighbor = null;
            let minDistance = Infinity;

            for (const neighbor of neighbors) {
                if (!traversed.has(neighbor)) {
                    const distance = distanceFunc(current, neighbor);
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestNeighbor = neighbor;
                    }
                }
            }

            if (nearestNeighbor) {
                // Move to nearest neighbor
                traversed.add(nearestNeighbor);
                sorted.push(nearestNeighbor);
                current = nearestNeighbor;
            } else {
                // No unvisited neighbors - find nearest unvisited node in entire MST
                let nearestNode = null;
                let minDist = Infinity;

                for (const file of filesWithHashes) {
                    if (!traversed.has(file)) {
                        const dist = distanceFunc(current, file);
                        if (dist < minDist) {
                            minDist = dist;
                            nearestNode = file;
                        }
                    }
                }

                if (nearestNode) {
                    traversed.add(nearestNode);
                    sorted.push(nearestNode);
                    current = nearestNode;
                } else {
                    break; // Should not happen
                }
            }
        }

        // Add files without hashes at the end
        const filesWithoutHashes = this.mediaFiles.filter(f => !this.perceptualHashes.has(f.path));
        sorted.push(...filesWithoutHashes);

        this.mediaFiles = sorted;
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
        } catch (error) {
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
        } catch (error) {
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
            } catch (e) {
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
                sortedPaths: fileNames,
                timestamp: Date.now(),
                startFile: startFileName,
                totalFiles: fileNames.length
            };

            await window.electronAPI.writeFile(cacheFile, JSON.stringify(cache, null, 2));
            console.log(`Sort cache saved for ${algorithm}: ${fileNames.length} files`);
        } catch (error) {
            console.error('Failed to save sort cache:', error);
            this.showNotification('⚠️ Failed to save sort cache', 'warning');
        }
    }

    async applyCachedSortOrder(cachedData) {
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
            this.updateProgressNotification(`🔄 Inserting ${newFiles.length} new files...`);
            await this.insertNewFilesInSortedOrder(cachedOrder, newFiles);
        } else {
            // Just use cached order (new files at end if any)
            this.mediaFiles = [...cachedOrder, ...newFiles];
        }

        return {
            cached: cachedOrder.length,
            removed: removedFiles.length,
            added: newFiles.length
        };
    }

    async insertNewFilesInSortedOrder(sortedFiles, newFiles) {
        // For each new file, compute hash and find best insertion point
        const insertions = [];

        for (let i = 0; i < newFiles.length; i++) {
            const newFile = newFiles[i];

            // Compute hash if not already computed
            if (!this.perceptualHashes.has(newFile.path)) {
                try {
                    const hash = await this.computePerceptualHash(newFile.path);
                    this.perceptualHashes.set(newFile.path, hash);
                } catch (error) {
                    console.warn(`Failed to compute hash for ${newFile.path}:`, error);
                    // File without hash goes to end
                    insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                    continue;
                }
            }

            const newHash = this.perceptualHashes.get(newFile.path);
            if (!newHash) {
                insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                continue;
            }

            // Find the best position (minimum distance to neighbors)
            let bestIndex = sortedFiles.length;
            let bestScore = Infinity;

            for (let j = 0; j <= sortedFiles.length; j++) {
                let score = 0;
                let count = 0;

                // Distance to previous file
                if (j > 0) {
                    const prevHash = this.perceptualHashes.get(sortedFiles[j - 1].path);
                    if (prevHash) {
                        score += this.calculateHammingDistance(newHash, prevHash);
                        count++;
                    }
                }

                // Distance to next file
                if (j < sortedFiles.length) {
                    const nextHash = this.perceptualHashes.get(sortedFiles[j].path);
                    if (nextHash) {
                        score += this.calculateHammingDistance(newHash, nextHash);
                        count++;
                    }
                }

                if (count > 0) {
                    score = score / count; // Average distance to neighbors
                    if (score < bestScore) {
                        bestScore = score;
                        bestIndex = j;
                    }
                }
            }

            insertions.push({ file: newFile, index: bestIndex, distance: bestScore });

            if ((i + 1) % 10 === 0 || i === newFiles.length - 1) {
                this.updateProgressNotification(`🔄 Processing new files: ${i + 1}/${newFiles.length}`);
            }
        }

        // Sort insertions by index descending so we can insert without affecting indices
        insertions.sort((a, b) => b.index - a.index);

        // Insert files at their best positions
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
            const maxTranslateX = rect.width * (newScale - 1) / 2;
            const maxTranslateY = rect.height * (newScale - 1) / 2;
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
        const maxTranslateX = rect.width * (state.scale - 1) / 2;
        const maxTranslateY = rect.height * (state.scale - 1) / 2;

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
        const indicator = document.getElementById('zoomIndicator');
        if (!indicator) return;

        const state = this.zoomState[target];
        const activeTarget = this.isCompareMode ? target : 'single';

        // Show indicator only when zoomed
        if (state.scale > 1) {
            const percentage = Math.round(state.scale * 100);
            indicator.textContent = `${percentage}%`;
            indicator.classList.add('show');

            // Update position for compare mode
            if (this.isCompareMode) {
                if (target === 'left') {
                    indicator.style.left = '25%';
                } else if (target === 'right') {
                    indicator.style.left = '75%';
                }
            } else {
                indicator.style.left = '50%';
            }
        } else {
            // Only hide if no side is zoomed
            const anyZoomed = this.isCompareMode
                ? (this.zoomState.left.scale > 1 || this.zoomState.right.scale > 1)
                : this.zoomState.single.scale > 1;

            if (!anyZoomed) {
                indicator.classList.remove('show');
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

        // Double-click to cycle zoom
        element.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.cycleZoomStep(target, e.clientX, e.clientY);
        });

        // Wheel zoom
        element.addEventListener('wheel', (e) => {
            this.handleWheelZoom(e, target);
        }, { passive: false });

        // Pan start
        element.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click only
                if (this.handlePanStart(e, target)) {
                    e.preventDefault();
                }
            }
        });
    }

    // ==================== ML PREDICTION METHODS ====================

    initializeMlWorker() {
        if (!this.isMlEnabled) return;

        if (this.mlWorker) {
            this.mlWorker.terminate();
        }

        try {
            this.mlWorker = new Worker('ml-worker.js');

            this.mlWorker.onmessage = (e) => {
                this.handleMlWorkerMessage(e.data);
            };

            this.mlWorker.onerror = (err) => {
                console.error('ML Worker error:', err);
                this.isMlEnabled = false;
            };

            // Initialize worker (will load saved model if exists)
            this.mlWorker.postMessage({ type: 'init', data: {} });
        } catch (err) {
            console.warn('ML Worker not available:', err);
            this.isMlEnabled = false;
        }
    }

    handleMlWorkerMessage(message) {
        switch (message.type) {
            case 'initComplete':
                console.log('ML Model initialized:', message.stats);
                this.mlStats = message.stats;
                this.updateSortPredictionButton();
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
                // Debounce model saving to avoid multiple writes
                if (this._saveModelTimer) {
                    clearTimeout(this._saveModelTimer);
                }
                this._saveModelTimer = setTimeout(() => {
                    this.saveMlModel();
                    this._saveModelTimer = null;
                }, 500);
                // Debounce re-scoring to avoid multiple calls in quick succession
                if (this._scoreDebounceTimer) {
                    clearTimeout(this._scoreDebounceTimer);
                }
                this._scoreDebounceTimer = setTimeout(() => {
                    this.requestPredictionScores();
                    this.updateSortPredictionButton();
                    this._scoreDebounceTimer = null;
                }, 100);
                break;

            case 'reverseUpdateComplete':
                // Handle reversed ML update (undo functionality)
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
                // Re-score after reversal
                if (this._scoreDebounceTimer) {
                    clearTimeout(this._scoreDebounceTimer);
                }
                this._scoreDebounceTimer = setTimeout(() => {
                    this.requestPredictionScores();
                    this.updateSortPredictionButton();
                    this._scoreDebounceTimer = null;
                }, 100);
                break;

            case 'scoreComplete':
                this.clearProgressNotification(); // Clear "Scoring" progress
                if (message.scores) {
                    // Build filename->path map once for O(1) lookups
                    const filenameToPath = new Map(this.mediaFiles.map(f => [f.name, f.path]));
                    for (const [filename, score] of Object.entries(message.scores)) {
                        const path = filenameToPath.get(filename);
                        if (path) {
                            this.predictionScores.set(path, score);
                        }
                    }
                    this.updatePredictionBadges();
                }
                break;

            case 'sortComplete':
                this.clearProgressNotification(); // Clear "Scoring" progress
                if (message.sortedFilenames) {
                    // Apply sort order
                    const filenameToFile = new Map(this.mediaFiles.map(f => [f.name, f]));
                    const sorted = message.sortedFilenames
                        .map(name => filenameToFile.get(name))
                        .filter(f => f);

                    if (sorted.length > 0) {
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
                        data: { savedModel: this.mlModelState }
                    });
                }
                console.log('ML model loaded from cache');
            }
        } catch (error) {
            console.log('No ML model cache found');
        }
    }

    async saveMlModel() {
        if (!this.baseFolderPath || !this.mlModelState) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.ml_model.json');
            await window.electronAPI.writeFile(cacheFile, JSON.stringify({
                version: 1,
                modelState: this.mlModelState,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('Failed to save ML model:', error);
        }
    }

    async loadFeatureCache() {
        if (!this.baseFolderPath) return 0;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.feature_cache.json');
            const data = await window.electronAPI.readFile(cacheFile);

            if (data) {
                const parsed = JSON.parse(data);
                this.featureCache = new Map();
                for (const [filename, features] of Object.entries(parsed.features || {})) {
                    const fullPath = await window.electronAPI.path.join(this.baseFolderPath, filename);
                    this.featureCache.set(fullPath, new Float32Array(features));
                }
                return this.featureCache.size;
            }
        } catch (error) {
            console.log('No feature cache found');
        }
        return 0;
    }

    async saveFeatureCache() {
        if (!this.baseFolderPath || this.featureCache.size === 0) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.feature_cache.json');
            const features = {};

            for (const [fullPath, featureArray] of this.featureCache.entries()) {
                const filename = await window.electronAPI.path.basename(fullPath);
                features[filename] = Array.from(featureArray);
            }

            await window.electronAPI.writeFile(cacheFile, JSON.stringify({
                version: 1,
                features
            }));
        } catch (error) {
            console.error('Failed to save feature cache:', error);
        }
    }

    async computeFeatures(filePath) {
        // Check cache first
        if (this.featureCache.has(filePath)) {
            return this.featureCache.get(filePath);
        }

        return new Promise((resolve, reject) => {
            const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);
            const timeout = setTimeout(() => reject(new Error('Timeout')), 30000);

            const cleanup = () => clearTimeout(timeout);

            const processImageData = (imageData) => {
                try {
                    // Feature extraction using extractFeatures from feature-extractor.js
                    const features = extractFeatures(imageData);
                    this.featureCache.set(filePath, features);
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
                    video.src = '';
                    processImageData(imageData);
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
                    processImageData(imageData);
                });

                img.addEventListener('error', () => {
                    cleanup();
                    reject(new Error('Image load error'));
                });

                img.src = filePath;
            }
        });
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
                    likedFeatures.push(Array.from(features));

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
                    dislikedFeatures.push(Array.from(features));

                    if ((i + 1) % 10 === 0) {
                        this.updateProgressNotification(`Processing dislikes: ${i + 1}/${dislikedFiles.length}`);
                    }
                } catch (err) {
                    console.warn(`Skipping ${file.name}:`, err.message);
                }
            }

            // Send to ML worker for training
            if (likedFeatures.length > 0 || dislikedFeatures.length > 0) {
                this.mlWorker.postMessage({
                    type: 'trainHistorical',
                    data: { likedFeatures, dislikedFeatures }
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

    async requestPredictionScores() {
        if (!this.isMlEnabled || !this.mlWorker) return;

        // Only use cached features - background extraction handles the actual extraction
        // This prevents duplicate progress indicators and competing extraction processes
        const allFeatures = {};

        for (const file of this.mediaFiles) {
            const features = this.featureCache.get(file.path);
            if (features) {
                allFeatures[file.name] = Array.from(features);
            }
        }

        if (Object.keys(allFeatures).length > 0) {
            this.mlWorker.postMessage({
                type: 'scoreAll',
                data: { allFeatures }
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
        ['single', 'left', 'right'].forEach(pos => {
            const badge = document.getElementById(`prediction-badge-${pos}`);
            if (badge) badge.style.display = 'none';
        });
    }

    updateSortPredictionButton() {
        if (!this.sortPredictionBtn) return;

        const hasScores = this.predictionScores.size > 0;
        const isReady = this.mlStats?.isReady;
        const likesCount = this.mlStats?.positiveCount || 0;
        const dislikesCount = this.mlStats?.negativeCount || 0;

        // Button is enabled if model is ready and has scores
        this.sortPredictionBtn.disabled = !isReady;
        this.sortPredictionBtn.style.display = this.isMlEnabled ? 'inline-flex' : 'none';

        // Update label based on state
        const labelEl = this.sortPredictionBtn.querySelector('.btn-label');
        if (this.isSortedByPrediction) {
            labelEl.textContent = 'Restore Order';
            this.sortPredictionBtn.title = 'Click to restore original order';
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
        if (!this.isMlEnabled || !this.mlWorker) {
            this.showNotification('ML prediction is disabled', 'warning');
            return;
        }

        // Toggle sorting
        if (this.isSortedByPrediction) {
            // Restore original order, but only for files that still exist
            if (this.originalMediaFiles.length > 0) {
                // Filter to only files that are still in the current list (not moved/rated)
                const currentPaths = new Set(this.mediaFiles.map(f => f.path));
                this.mediaFiles = this.originalMediaFiles.filter(f => currentPaths.has(f.path));
            }
            this.isSortedByPrediction = false;
            this.mlComparePairIndex = 0; // Reset ML pair index
            this.currentIndex = 0;
            await this.showMedia();
            this.updateSortPredictionButton();
            this.showNotification('Restored original order', 'info');
            return;
        }

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
        const uncachedFiles = this.mediaFiles.filter(f => !this.featureCache.has(f.path));

        if (uncachedFiles.length > 0) {
            // Start background extraction and wait for completion
            this.showNotification(`Extracting features for ${uncachedFiles.length} files...`, 'info');
            await this.startBackgroundFeatureExtraction();
        }

        // Collect all features from cache
        const allFeatures = {};
        for (const file of this.mediaFiles) {
            const features = this.featureCache.get(file.path);
            if (features) {
                allFeatures[file.name] = Array.from(features);
            }
        }

        if (Object.keys(allFeatures).length === 0) {
            this.showNotification('Could not extract features from any files', 'error');
            return;
        }

        console.log(`Sending ${Object.keys(allFeatures).length} files for ML sorting`);

        this.mlWorker.postMessage({
            type: 'getSortedOrder',
            data: { allFeatures }
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

        this.mlWorker.postMessage({
            type: 'update',
            data: {
                features: Array.from(features),
                label: actionType === 'like' ? 1 : 0
            }
        });
    }

    /**
     * Update ML model with pre-extracted features (used when file will be moved)
     */
    updateMlModelWithFeatures(features, actionType) {
        if (!this.isMlEnabled || !this.mlWorker || !features) return;

        this.mlWorker.postMessage({
            type: 'update',
            data: {
                features: Array.from(features),
                label: actionType === 'like' ? 1 : 0
            }
        });
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
                label: actionType === 'like' ? 1 : 0
            }
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

    // ==================== FEATURE EXTRACTION WORKER POOL ====================

    /**
     * Initialize the feature extraction worker pool
     */
    initializeFeaturePool() {
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

            console.log(`Feature extraction pool initialized with ${this.featureWorkerCount} workers`);

            // Start auto-save interval (every 30 seconds)
            this.startFeatureCacheAutoSave();
        } catch (err) {
            console.warn('Failed to initialize feature workers:', err);
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
            } catch (e) {
                // Ignore termination errors
            }
        }

        this.featureWorkers = [];
        this.featureTaskQueue = [];

        // Reject all pending tasks
        for (const [taskId, task] of this.featurePendingTasks) {
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
                reject
            };

            // Insert into priority queue (sorted by priority)
            const insertIndex = this.featureTaskQueue.findIndex(t => t.priority > priority);
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
        const availableWorker = this.featureWorkers.find(w => !w.busy);
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
                height: task.imageData.height
            }
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

                img.src = filePath;
            }
        });
    }

    /**
     * Start background feature extraction for all uncached files
     */
    async startBackgroundFeatureExtraction() {
        if (this.featureWorkers.length === 0 || this.mediaFiles.length === 0) {
            return;
        }

        // Cancel any existing background extraction
        this.cancelBackgroundExtraction();

        this.isBackgroundExtracting = true;
        this.backgroundExtractionAbort = new AbortController();

        // Show subtle progress indicator
        this.showBackgroundExtractionProgress(0, this.mediaFiles.length);

        // Get files that need extraction (not in cache)
        const filesToProcess = this.mediaFiles
            .map((file, index) => ({ file, index }))
            .filter(({ file }) => !this.featureCache.has(file.path));

        if (filesToProcess.length === 0) {
            this.isBackgroundExtracting = false;
            this.hideBackgroundExtractionProgress();
            return;
        }

        // Sort by priority (distance from current index)
        filesToProcess.sort((a, b) =>
            this.calculateFeaturePriority(a.index) - this.calculateFeaturePriority(b.index)
        );

        let completedCount = this.mediaFiles.length - filesToProcess.length;
        const totalCount = this.mediaFiles.length;

        // Process in batches to avoid memory pressure
        const BATCH_SIZE = 10;
        for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
            if (this.backgroundExtractionAbort?.signal.aborted) {
                break;
            }

            const batch = filesToProcess.slice(i, i + BATCH_SIZE);
            const promises = [];

            for (const { file, index } of batch) {
                if (this.backgroundExtractionAbort?.signal.aborted) {
                    break;
                }

                try {
                    const imageData = await this.loadMediaAsImageData(file.path);
                    const priority = this.calculateFeaturePriority(index);
                    const promise = this.enqueueFeatureExtraction(file.path, imageData, priority)
                        .then(() => {
                            completedCount++;
                            this.showBackgroundExtractionProgress(completedCount, totalCount);
                        })
                        .catch(err => {
                            console.warn(`Feature extraction failed for ${file.name}:`, err.message);
                            completedCount++;
                            this.showBackgroundExtractionProgress(completedCount, totalCount);
                        });
                    promises.push(promise);
                } catch (err) {
                    console.warn(`Failed to load ${file.name}:`, err.message);
                    completedCount++;
                }
            }

            // Wait for batch to complete
            await Promise.all(promises);
        }

        this.isBackgroundExtracting = false;
        this.hideBackgroundExtractionProgress();

        // Save cache after extraction
        if (this.featureCacheDirty) {
            await this.saveFeatureCache();
            this.featureCacheDirty = false;
        }

        console.log('Background feature extraction complete');

        // Trigger ML scoring if enabled and model is ready
        if (this.isMlEnabled && this.mlStats?.isReady) {
            this.requestPredictionScores();
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

        this.cancelPendingFeatureExtractions();
        this.isBackgroundExtracting = false;
        this.hideBackgroundExtractionProgress();
    }

    /**
     * Show subtle background extraction progress indicator
     * @param {number} current - Current count
     * @param {number} total - Total count
     */
    showBackgroundExtractionProgress(current, total) {
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

        const percentage = Math.round((current / total) * 100);
        indicator.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                <path d="M12 2v4m0 12v4m-7-7H3m18 0h-2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4"/>
            </svg>
            <span>Extracting features: ${current}/${total} (${percentage}%)</span>
        `;

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
    console.log('DOM loaded, initializing MediaViewer...');
    const viewer = new MediaViewer();
    window.mediaViewer = viewer; // For debugging
});