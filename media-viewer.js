class MediaViewer {
    constructor() {
        this.mediaFiles = [];
        this.currentIndex = 0;
        this.currentFolder = 0;
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

        this.initializeElements();
        this.setupEventListeners();
        this.setupHeaderVisibility();
        this.setupFileInfoVisibility();
        this.setupControlsVisibility();

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
        this.fileInfoToggle = document.getElementById('fileInfoToggle');
        this.folderInfo = document.getElementById('folderInfo');
        this.controls = document.getElementById('controls');
        this.likeBtn = document.getElementById('likeBtn');
        this.dislikeBtn = document.getElementById('dislikeBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.navInfo = document.getElementById('navInfo');
        this.mediaIndex = document.getElementById('mediaIndex');
        this.videoControls = document.getElementById('videoControls');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.progressSlider = document.getElementById('progressSlider');
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        this.skipBtn = document.getElementById('skipBtn');
        this.header = document.getElementById('header');
        this.notificationContainer = document.getElementById('notificationContainer');
        this.mediaContainer = document.querySelector('.media-container');
        this.loadingContainer = document.getElementById('loadingContainer');
        this.navPrev = document.getElementById('navPrev');
        this.navNext = document.getElementById('navNext');
        this.changeFolderBtn = document.getElementById('changeFolderBtn');
        this.helpBtn = document.getElementById('helpBtn');

        // Compare mode elements
        this.viewModeBtn = document.getElementById('viewModeBtn');
        this.viewModeLabel = document.getElementById('viewModeLabel');
        this.compareControls = document.getElementById('compareControls');
        this.leftLikeBtn = document.getElementById('leftLikeBtn');
        this.leftDislikeBtn = document.getElementById('leftDislikeBtn');
        this.rightLikeBtn = document.getElementById('rightLikeBtn');
        this.rightDislikeBtn = document.getElementById('rightDislikeBtn');
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
    }

    showFolderCreationDialog(folderPath) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'folder-creation-modal';
            modal.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.9);
                backdrop-filter: blur(10px);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2000;
            `;
            
            modal.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #2d2d30 0%, #1e1e1e 100%);
                    border-radius: 15px;
                    padding: 30px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                ">
                    <div style="font-size: 24px; color: #00d4aa; text-align: center; margin-bottom: 20px;">📁 Create Folder</div>
                    <p style="color: #a0a0a0; margin-bottom: 20px; text-align: center;">
                        The target folder doesn't exist. Would you like to create it?
                    </p>
                    <div style="background: rgba(255, 255, 255, 0.1); padding: 10px; border-radius: 8px; font-family: monospace; word-break: break-all; margin-bottom: 20px;">${folderPath}</div>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button id="createBtn" style="
                            background: linear-gradient(135deg, #00d4aa 0%, #00a085 100%);
                            color: white; border: none; padding: 12px 24px;
                            border-radius: 8px; cursor: pointer; font-weight: 600;
                        ">Create Folder</button>
                        <button id="cancelBtn" style="
                            background: linear-gradient(135deg, #666 0%, #444 100%);
                            color: white; border: none; padding: 12px 24px;
                            border-radius: 8px; cursor: pointer; font-weight: 600;
                        ">Cancel</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
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

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        // Create message text container
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        messageSpan.style.cursor = 'pointer';
        messageSpan.title = 'Click to copy';
        messageSpan.style.flex = '1';

        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'notification-close';
        closeBtn.title = 'Close';
        closeBtn.style.cssText = 'background: none; border: none; color: inherit; font-size: 24px; cursor: pointer; padding: 0 5px; margin-left: 10px; line-height: 1;';

        notification.appendChild(messageSpan);
        notification.appendChild(closeBtn);
        notification.style.display = 'flex';
        notification.style.alignItems = 'center';

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
            notification.style.animation = 'slideOutTop 0.3s ease-in forwards';
            setTimeout(() => notification.remove(), 300);
        };
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeNotification();
        });

        this.notificationContainer.appendChild(notification);

        // Keep error notifications visible longer (10 seconds vs 3 seconds)
        const displayTime = type === 'error' ? 10000 : 3000;
        const autoCloseTimeout = setTimeout(closeNotification, displayTime);

        // Clear timeout if manually closed
        closeBtn.addEventListener('click', () => clearTimeout(autoCloseTimeout), { once: true });
    }

    showError(message) {
        console.error('Error:', message);
        this.showNotification(`❌ ${message}`, 'error');
    }

    nextMedia() {
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
        }

        if (this.isLoading || this.mediaNavigationInProgress) return;

        if (this.isCompareMode) {
            // In compare mode, skip by 2
            this.currentIndex = (this.currentIndex + 2) % this.mediaFiles.length;
            if (this.currentIndex >= this.mediaFiles.length - 1) {
                this.currentIndex = 0;
            }
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.mediaFiles.length;
        }
        this.showMedia();
    }

    previousMedia() {
        if (this.mediaFiles.length === 0 || this.isLoading || this.mediaNavigationInProgress) return;

        if (this.isCompareMode) {
            // In compare mode, skip by 2
            this.currentIndex = this.currentIndex - 2;
            if (this.currentIndex < 0) {
                this.currentIndex = Math.max(0, this.mediaFiles.length - 2);
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

    async moveCurrentFile(targetFolderNumber) {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        
        const currentFile = this.mediaFiles[this.currentIndex];
        const targetFolderName = `Liked_${targetFolderNumber}`;
        const targetFolderPath = window.electronAPI.path.join(
            window.electronAPI.path.dirname(this.baseFolderPath), 
            targetFolderName
        );
        
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
            
            // Store move in history for undo functionality
            this.moveHistory.push({
                fileName: currentFile.name,
                originalPath: currentFile.path,
                newPath: moveResult.targetPath,
                fileSize: currentFile.size,
                fileType: currentFile.type,
                fromFolder: this.currentFolder,
                toFolder: targetFolderNumber
            });
            
            // Show success notification
            const fileName = currentFile.name.length > 20 ? 
                currentFile.name.substring(0, 20) + '...' : currentFile.name;
            this.showNotification(
                `${targetFolderNumber > this.currentFolder ? '👍' : '👎'} Moved ${fileName} to ${targetFolderName}`,
                targetFolderNumber > this.currentFolder ? 'success' : 'dislike'
            );
            
            // Remove current file from array
            this.mediaFiles.splice(this.currentIndex, 1);
            
            // Adjust current index if necessary
            if (this.currentIndex >= this.mediaFiles.length) {
                this.currentIndex = 0;
            }
            
            this.updateFolderInfo();
            this.nextMedia();
            
        } catch (error) {
            console.error('Error moving file:', error);
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

        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.progressSlider.addEventListener('input', (e) => this.seekVideo(e.target.value));
        this.skipBtn.addEventListener('click', () => this.nextMedia());

        this.navPrev.addEventListener('click', () => this.previousMedia());
        this.navNext.addEventListener('click', () => this.nextMedia());
        if (this.changeFolderBtn) {
            this.changeFolderBtn.addEventListener('click', async () => {
                const folderPath = await window.electronAPI.openFolderDialog();
                if (folderPath && folderPath !== this.baseFolderPath) {
                    await this.cleanupCurrentMedia();
                    this.mediaFiles = [];
                    this.currentIndex = 0;
                    this.currentFolder = 0;
                    this.currentMedia = null;
                    this.currentFolderPath = '';
                    this.baseFolderPath = '';
                    this.moveHistory = [];
                    this.isLoading = false;
                    this.isVideoLoading = false;
                    this.videoEventListeners = [];
                    this.mediaNavigationInProgress = false;
                    this.isBeingCleaned = false;
                    this.hideDropZone();
                    await this.loadFolder(folderPath);
                }
            });
        }

        // File info toggle click to copy filename
        if (this.fileInfoToggle) {
            this.fileInfoToggle.addEventListener('click', async () => {
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

        document.addEventListener('keydown', (e) => {
            if (this.mediaFiles.length === 0) return;

            if (this.isLoading && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                return;
            }

            // Exit fullscreen with Escape
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.leftMediaWrapper && this.leftMediaWrapper.classList.contains('fullscreen')) {
                    this.exitFullscreen(this.leftMediaWrapper);
                }
                if (this.rightMediaWrapper && this.rightMediaWrapper.classList.contains('fullscreen')) {
                    this.exitFullscreen(this.rightMediaWrapper);
                }
                return;
            }

            // Compare mode shortcuts
            if (this.isCompareMode) {
                switch(e.key.toUpperCase()) {
                    case 'Q':
                        e.preventDefault();
                        if (!this.isLoading) this.handleLeftLike();
                        break;
                    case 'W':
                        e.preventDefault();
                        if (!this.isLoading) this.handleLeftDislike();
                        break;
                    case 'E':
                        e.preventDefault();
                        if (!this.isLoading) this.handleRightLike();
                        break;
                    case 'R':
                        e.preventDefault();
                        if (!this.isLoading) this.handleRightDislike();
                        break;
                    case 'Z':
                        e.preventDefault();
                        if (this.leftMediaWrapper) {
                            this.toggleFullscreen(this.leftMediaWrapper);
                        }
                        break;
                    case 'X':
                        e.preventDefault();
                        if (this.rightMediaWrapper) {
                            this.toggleFullscreen(this.rightMediaWrapper);
                        }
                        break;
                    case 'F1':
                        e.preventDefault();
                        this.toggleHelp();
                        break;
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
            }
        });

        // Mouse wheel navigation
        document.addEventListener('wheel', (e) => {
            // Don't navigate if help overlay is open
            const helpOverlay = document.getElementById('helpOverlay');
            if (helpOverlay && helpOverlay.classList.contains('show')) return;

            if (this.mediaFiles.length === 0 || this.isLoading || this.mediaNavigationInProgress) return;

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
        let fileInfoTimeout;
        
        const showFileInfo = () => {
            this.fileInfo.classList.add('show');
            clearTimeout(fileInfoTimeout);
        };

        const hideFileInfo = () => {
            fileInfoTimeout = setTimeout(() => {
                this.fileInfo.classList.remove('show');
            }, 300);
        };

        this.fileInfo.addEventListener('mouseenter', showFileInfo);
        this.fileInfo.addEventListener('mouseleave', hideFileInfo);
        
        document.addEventListener('mousemove', (e) => {
            const windowWidth = window.innerWidth;
            if (e.clientX > windowWidth - 250 && e.clientY > 80 && e.clientY < 350) {
                showFileInfo();
            }
        });
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
                this.showError(result.error || 'Failed to load folder');
                return;
            }
            
            if (result.files.length === 0) {
                this.showError('No media files found in the selected folder');
                return;
            }
            
            this.mediaFiles = result.files;
            this.baseFolderPath = folderPath;
            this.currentFolderPath = window.electronAPI.path.basename(folderPath);
            
            const match = this.currentFolderPath.match(/Liked_(\d+)/);
            this.currentFolder = match ? parseInt(match[1]) : 0;
            
            this.currentIndex = 0;
            this.moveHistory = [];
            this.hideDropZone();
            await this.showMedia();
            this.updateFolderInfo();
            
            console.log(`Successfully loaded ${this.mediaFiles.length} media files`);
            
        } catch (error) {
            this.hideLoadingSpinner();
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

        // Cleanup previous media
        if (this.leftMedia) {
            await this.cleanupCompareMedia('left');
        }
        if (this.rightMedia) {
            await this.cleanupCompareMedia('right');
        }
        if (this.leftMediaWrapper) {
            this.leftMediaWrapper.remove();
        }
        if (this.rightMediaWrapper) {
            this.rightMediaWrapper.remove();
        }

        await new Promise(resolve => setTimeout(resolve, 150));

        const leftFile = this.mediaFiles[this.currentIndex];
        const rightFile = this.mediaFiles[this.currentIndex + 1];

        console.log('Showing compare media:', leftFile.name, 'vs', rightFile.name);

        // Create wrappers
        this.leftMediaWrapper = document.createElement('div');
        this.leftMediaWrapper.className = 'media-wrapper';
        this.rightMediaWrapper = document.createElement('div');
        this.rightMediaWrapper.className = 'media-wrapper';

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

                // Check if both media are loaded
                const bothLoaded = (!this.leftMedia || this.leftMedia.complete || this.leftMedia.tagName === 'VIDEO') &&
                                   (!this.rightMedia || this.rightMedia.complete || this.rightMedia.tagName === 'VIDEO');

                if (bothLoaded) {
                    this.hideLoadingSpinner();
                    this.isLoading = false;
                    this.mediaNavigationInProgress = false;
                }
            }
        };

        const onError = (e) => {
            if (media && media.tagName === 'IMG' && !this.isBeingCleaned) {
                console.error('Image load error:', e);
                this.hideLoadingSpinner();
                this.showError(`Failed to load image: ${file.name}`);
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

                // Check if both media are loaded
                const bothLoaded = (!this.leftMedia || (this.leftMedia.tagName !== 'VIDEO' || this.leftMedia.readyState >= 1)) &&
                                   (!this.rightMedia || (this.rightMedia.tagName !== 'VIDEO' || this.rightMedia.readyState >= 1));

                if (bothLoaded) {
                    this.hideLoadingSpinner();
                    this.isLoading = false;
                    this.mediaNavigationInProgress = false;
                }
            }
        };

        const onError = (e) => {
            if (media && media.tagName === 'VIDEO' && !this.isBeingCleaned) {
                console.error('Video load error:', e);
                this.hideLoadingSpinner();
                this.showError(`Failed to load video: ${file.name}`);
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
            }
        };

        const onError = (e) => {
            if (this.currentMedia && this.currentMedia.tagName === 'IMG' && !this.isBeingCleaned) {
                console.error('Image load error:', e);
                this.hideLoadingSpinner();
                this.showError(`Failed to load image: ${file.name}`);
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
            }
        };

        const onError = (e) => {
            // Only show error if we're not in the middle of cleanup
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                console.error('Video load error:', e);
                this.hideLoadingSpinner();
                this.showError(`Failed to load video: ${file.name}`);
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
                this.playPauseBtn.textContent = '⏸️';
            }
        };
        
        const onPause = () => {
            if (this.currentMedia && this.currentMedia.tagName === 'VIDEO' && !this.isBeingCleaned) {
                this.playPauseBtn.textContent = '▶️';
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

    showLoadingSpinner() {
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
            this.mediaIndex.textContent = `${this.currentIndex + 1}-${this.currentIndex + 2} of ${this.mediaFiles.length}`;
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
        
        const newFolderNumber = this.currentFolder + 1;
        await this.moveCurrentFile(newFolderNumber);
    }

    async handleDislike() {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        
        const newFolderNumber = Math.max(this.currentFolder - 1, 0);
        await this.moveCurrentFile(newFolderNumber);
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

                this.showNotification(`✅ Restored ${firstMove.fileName}`, 'success');
                this.showNotification(`✅ Restored ${secondMove.fileName}`, 'success');
                this.updateFolderInfo();

                // Set current index to show the restored pair
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

                this.mediaFiles.push({
                    name: lastMove.fileName,
                    path: lastMove.originalPath,
                    size: lastMove.fileSize,
                    type: lastMove.fileType
                });

                this.showNotification(`✅ Restored ${lastMove.fileName}`, 'success');
                this.updateFolderInfo();

                // Set current index to the restored file
                this.currentIndex = this.mediaFiles.length - 1;

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
            // Hide main file info panel in compare mode
            this.fileInfo.classList.remove('show');
            this.fileInfo.style.display = 'none';
        } else {
            this.viewModeLabel.textContent = 'Single';
            this.controls.style.display = 'flex';
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
        const leftFolderNumber = this.currentFolder + 1;
        const rightFolderNumber = Math.max(this.currentFolder - 1, 0);
        await this.moveComparePair('left', leftFolderNumber, rightFolderNumber);
    }

    async handleLeftDislike() {
        if (this.mediaFiles.length < 2 || this.isLoading) return;
        const leftFolderNumber = Math.max(this.currentFolder - 1, 0);
        const rightFolderNumber = this.currentFolder + 1;
        await this.moveComparePair('left', leftFolderNumber, rightFolderNumber);
    }

    async handleRightLike() {
        if (this.mediaFiles.length < 2 || this.isLoading) return;
        const rightFolderNumber = this.currentFolder + 1;
        const leftFolderNumber = Math.max(this.currentFolder - 1, 0);
        await this.moveComparePair('right', rightFolderNumber, leftFolderNumber);
    }

    async handleRightDislike() {
        if (this.mediaFiles.length < 2 || this.isLoading) return;
        const rightFolderNumber = Math.max(this.currentFolder - 1, 0);
        const leftFolderNumber = this.currentFolder + 1;
        await this.moveComparePair('right', rightFolderNumber, leftFolderNumber);
    }

    async moveComparePair(primarySide, primaryFolderNumber, secondaryFolderNumber) {
        if (this.isLoading) return;

        const leftFileIndex = this.currentIndex;
        const rightFileIndex = this.currentIndex + 1;
        const leftFile = this.mediaFiles[leftFileIndex];
        const rightFile = this.mediaFiles[rightFileIndex];

        if (!leftFile || !rightFile) return;

        try {
            // Cleanup both media before moving
            if (this.leftMedia) {
                await this.cleanupCompareMedia('left');
            }
            if (this.rightMedia) {
                await this.cleanupCompareMedia('right');
            }
            await new Promise(resolve => setTimeout(resolve, 300));

            // Move primary file
            const primaryFile = primarySide === 'left' ? leftFile : rightFile;
            const primaryFolderName = `Liked_${primaryFolderNumber}`;
            const primaryFolderPath = window.electronAPI.path.join(
                window.electronAPI.path.dirname(this.baseFolderPath),
                primaryFolderName
            );

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

            // Store primary move in history
            this.moveHistory.push({
                fileName: primaryFile.name,
                originalPath: primaryFile.path,
                newPath: primaryMoveResult.targetPath,
                fileSize: primaryFile.size,
                fileType: primaryFile.type,
                fromFolder: this.currentFolder,
                toFolder: primaryFolderNumber
            });

            // Move secondary file
            const secondaryFile = primarySide === 'left' ? rightFile : leftFile;
            const secondaryFolderName = `Liked_${secondaryFolderNumber}`;
            const secondaryFolderPath = window.electronAPI.path.join(
                window.electronAPI.path.dirname(this.baseFolderPath),
                secondaryFolderName
            );

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

            // Store secondary move in history
            this.moveHistory.push({
                fileName: secondaryFile.name,
                originalPath: secondaryFile.path,
                newPath: secondaryMoveResult.targetPath,
                fileSize: secondaryFile.size,
                fileType: secondaryFile.type,
                fromFolder: this.currentFolder,
                toFolder: secondaryFolderNumber
            });

            // Show notifications
            const primaryFileName = primaryFile.name.length > 20 ?
                primaryFile.name.substring(0, 20) + '...' : primaryFile.name;
            const secondaryFileName = secondaryFile.name.length > 20 ?
                secondaryFile.name.substring(0, 20) + '...' : secondaryFile.name;

            this.showNotification(
                `${primaryFolderNumber > this.currentFolder ? '👍' : '👎'} ${primaryFileName} → ${primaryFolderName}`,
                primaryFolderNumber > this.currentFolder ? 'success' : 'dislike'
            );
            this.showNotification(
                `${secondaryFolderNumber > this.currentFolder ? '👍' : '👎'} ${secondaryFileName} → ${secondaryFolderName}`,
                secondaryFolderNumber > this.currentFolder ? 'success' : 'dislike'
            );

            // Remove both files from current view
            this.mediaFiles.splice(rightFileIndex, 1);
            this.mediaFiles.splice(leftFileIndex, 1);

            // Adjust current index
            if (this.currentIndex >= this.mediaFiles.length) {
                this.currentIndex = 0;
            }

            this.updateFolderInfo();
            await this.showMedia();

        } catch (error) {
            console.error('Error moving compare files:', error);
            this.showError(`Failed to move files: ${error.message}`);
        }
    }

    async moveCompareFile(side, targetFolderNumber) {
        if (this.isLoading) return;

        const fileIndex = side === 'left' ? this.currentIndex : this.currentIndex + 1;
        const currentFile = this.mediaFiles[fileIndex];
        const otherFileIndex = side === 'left' ? this.currentIndex + 1 : this.currentIndex;

        const targetFolderName = `Liked_${targetFolderNumber}`;
        const targetFolderPath = window.electronAPI.path.join(
            window.electronAPI.path.dirname(this.baseFolderPath),
            targetFolderName
        );

        try {
            // Cleanup media before moving
            if (side === 'left' && this.leftMedia) {
                await this.cleanupCompareMedia('left');
            } else if (side === 'right' && this.rightMedia) {
                await this.cleanupCompareMedia('right');
            }
            await new Promise(resolve => setTimeout(resolve, 300));

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

            // Store move in history
            this.moveHistory.push({
                fileName: currentFile.name,
                originalPath: currentFile.path,
                newPath: moveResult.targetPath,
                fileSize: currentFile.size,
                fileType: currentFile.type,
                fromFolder: this.currentFolder,
                toFolder: targetFolderNumber
            });

            // Show success notification
            const fileName = currentFile.name.length > 20 ?
                currentFile.name.substring(0, 20) + '...' : currentFile.name;
            this.showNotification(
                `${targetFolderNumber > this.currentFolder ? '👍' : '👎'} Moved ${fileName} to ${targetFolderName}`,
                targetFolderNumber > this.currentFolder ? 'success' : 'dislike'
            );

            // Hide the other media (the one that wasn't rated)
            this.hiddenMediaIndices.push(otherFileIndex);

            // Remove both files from current view
            this.mediaFiles.splice(Math.max(fileIndex, otherFileIndex), 1);
            this.mediaFiles.splice(Math.min(fileIndex, otherFileIndex), 1);

            // Adjust current index
            if (this.currentIndex >= this.mediaFiles.length) {
                this.currentIndex = 0;
            }

            this.updateFolderInfo();
            await this.showMedia();

        } catch (error) {
            console.error('Error moving file:', error);
            this.showError(`Failed to move file: ${error.message}`);
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
`;
document.head.appendChild(style);

// Initialize the viewer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing MediaViewer...');
    const viewer = new MediaViewer();
    window.mediaViewer = viewer; // For debugging
});