class MediaViewer {
    constructor() {
        this.mediaFiles = [];
        this.currentIndex = 0;
        this.currentFolder = 0;
        this.currentMedia = null;
        this.currentFolderPath = '';
        this.baseFolderPath = '';
        this.moveHistory = []; // Track moved files for undo functionality
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupHeaderVisibility();
        this.setupFileInfoVisibility();
        this.setupControlsVisibility(); // Add this line
        
        // Check if Electron API is available
        if (!window.electronAPI) {
            console.error('Electron API not available');
            this.showError('Electron API not available. Please make sure you\'re running this in Electron.');
        }
    }

    initializeElements() {
        this.dropZone = document.getElementById('dropZone');
        this.fileInfo = document.getElementById('fileInfo');
        this.fileName = document.getElementById('fileName');
        this.fileDetails = document.getElementById('fileDetails');
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
        this.header = document.getElementById('header');
        this.notificationContainer = document.getElementById('notificationContainer');
        this.mediaContainer = document.querySelector('.media-container');
    }

    setupEventListeners() {
        // Drop zone click
        this.dropZone.addEventListener('click', () => this.openFolderDialog());
        
        // Drag and drop
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

        // Control buttons
        this.likeBtn.addEventListener('click', () => this.handleLike());
        this.dislikeBtn.addEventListener('click', () => this.handleDislike());
        this.cancelBtn.addEventListener('click', () => this.handleCancel());

        // Video controls
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.mediaFiles.length === 0) return;
            
            switch(e.key) {
                case 'ArrowRight':
                case ' ':
                    e.preventDefault();
                    if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                        this.togglePlayPause();
                    } else {
                        this.handleLike();
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.handleDislike();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.previousMedia();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.nextMedia();
                    break;
                case 'z':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.handleCancel();
                    }
                    break;
            }
        });
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
        
        // Show header on mouse move near top
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
        
        // Show file info on mouse move near top-right
        document.addEventListener('mousemove', (e) => {
            const windowWidth = window.innerWidth;
            if (e.clientX > windowWidth - 200 && e.clientY < 200) {
                showFileInfo();
            }
        });
    }

    setupControlsVisibility() {
        let controlsTimeout;
        let videoControlsTimeout;
        
        const showControls = () => {
            this.controls.classList.add('show');
            this.navInfo.classList.add('show');
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
            }, 300);
            
            videoControlsTimeout = setTimeout(() => {
                this.videoControls.classList.remove('show');
            }, 300);
        };

        // Show controls on mouse movement
        document.addEventListener('mousemove', () => {
            if (this.mediaFiles.length > 0) {
                showControls();
                clearTimeout(controlsTimeout);
                clearTimeout(videoControlsTimeout);
                
                controlsTimeout = setTimeout(() => {
                    this.controls.classList.remove('show');
                    this.navInfo.classList.remove('show');
                    this.videoControls.classList.remove('show');
                }, 2000);
            }
        });

        // Keep controls visible when hovering over them
        this.controls.addEventListener('mouseenter', () => {
            clearTimeout(controlsTimeout);
            showControls();
        });

        this.controls.addEventListener('mouseleave', hideControls);

        this.videoControls.addEventListener('mouseenter', () => {
            clearTimeout(videoControlsTimeout);
            showControls();
        });

        this.videoControls.addEventListener('mouseleave', hideControls);

        this.navInfo.addEventListener('mouseenter', () => {
            clearTimeout(controlsTimeout);
            showControls();
        });

        this.navInfo.addEventListener('mouseleave', hideControls);
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
            
            // Parse current folder number from folder name
            const match = this.currentFolderPath.match(/Liked_(\d+)/);
            this.currentFolder = match ? parseInt(match[1]) : 0;
            
            this.currentIndex = 0;
            this.moveHistory = []; // Reset move history for new folder
            this.hideDropZone();
            this.showMedia();
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
    }

    showDropZone() {
        this.dropZone.style.display = 'flex';
        this.controls.style.display = 'none';
        this.fileInfo.style.display = 'none';
        this.navInfo.style.display = 'none';
        this.videoControls.style.display = 'none';
        
        if (this.currentMedia) {
            this.currentMedia.remove();
            this.currentMedia = null;
        }
    }

    async showMedia() {
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
        }

        // Remove existing media
        if (this.currentMedia) {
            this.currentMedia.remove();
        }

        const file = this.mediaFiles[this.currentIndex];
        console.log('Showing media:', file.name);
        
        // Create file URL for Electron
        const fileUrl = `file://${file.path}`;

        // Create media element
        if (file.type.startsWith('image/')) {
            this.currentMedia = document.createElement('img');
            this.currentMedia.src = fileUrl;
            this.videoControls.style.display = 'none';
        } else if (file.type.startsWith('video/')) {
            this.currentMedia = document.createElement('video');
            this.currentMedia.src = fileUrl;
            this.currentMedia.autoplay = true;
            this.currentMedia.loop = true;
            this.currentMedia.muted = false; // Enable sound
            this.currentMedia.controls = false;
            this.currentMedia.volume = parseFloat(this.volumeSlider.value);
            this.videoControls.style.display = 'flex';
            
            // Update play/pause button based on video state
            this.currentMedia.addEventListener('play', () => {
                this.playPauseBtn.textContent = '⏸️';
            });
            
            this.currentMedia.addEventListener('pause', () => {
                this.playPauseBtn.textContent = '▶️';
            });
        }

        this.currentMedia.className = 'media-display';
        this.currentMedia.style.display = 'none';

        // Show loading state
        this.showLoadingSpinner();

        const onLoad = () => {
            this.hideLoadingSpinner();
            this.fitMediaToScreen();
            this.currentMedia.style.display = 'block';
        };

        const onError = (error) => {
            this.hideLoadingSpinner();
            console.error('Media load error:', error);
            this.showError(`Failed to load media: ${file.name}`);
        };

        this.currentMedia.addEventListener('load', onLoad);
        this.currentMedia.addEventListener('loadeddata', onLoad);
        this.currentMedia.addEventListener('error', onError);

        this.mediaContainer.appendChild(this.currentMedia);

        // Update UI
        this.updateFileInfo(file);
        this.updateNavigationInfo();
    }

    fitMediaToScreen() {
        if (!this.currentMedia) return;

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (this.currentMedia.tagName === 'IMG') {
            const img = this.currentMedia;
            
            // Wait for image to load to get natural dimensions
            const handleImageLoad = () => {
                const naturalWidth = img.naturalWidth;
                const naturalHeight = img.naturalHeight;
                
                // If image is larger than screen in either dimension, fit to screen
                if (naturalWidth > windowWidth || naturalHeight > windowHeight) {
                    img.style.width = '100vw';
                    img.style.height = '100vh';
                    img.style.objectFit = 'contain';
                    img.style.maxWidth = 'none';
                    img.style.maxHeight = 'none';
                } else {
                    // If image is smaller than screen, display at natural size
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
                
                // If video is larger than screen in either dimension, fit to screen
                if (videoWidth > windowWidth || videoHeight > windowHeight) {
                    video.style.width = '100vw';
                    video.style.height = '100vh';
                    video.style.objectFit = 'contain';
                    video.style.maxWidth = 'none';
                    video.style.maxHeight = 'none';
                } else {
                    // If video is smaller than screen, display at natural size
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
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO') return;
        
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

    showLoadingSpinner() {
        const existing = document.querySelector('.loading');
        if (existing) existing.remove();

        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.innerHTML = '<div class="spinner"></div>Loading...';
        this.mediaContainer.appendChild(loading);
    }

    hideLoadingSpinner() {
        const loading = document.querySelector('.loading');
        if (loading) loading.remove();
    }

    async updateFileInfo(file) {
        this.fileName.textContent = file.name;
        
        // Get file dimensions and create detailed info
        let detailsText = this.formatFileSize(file.size);
        
        if (this.currentMedia) {
            if (this.currentMedia.tagName === 'IMG') {
                const img = this.currentMedia;
                if (img.naturalWidth && img.naturalHeight) {
                    const aspectRatio = (img.naturalWidth / img.naturalHeight).toFixed(2);
                    detailsText += `\n${img.naturalWidth} × ${img.naturalHeight}\nAspect ratio: ${aspectRatio}:1`;
                }
            } else if (this.currentMedia.tagName === 'VIDEO') {
                const video = this.currentMedia;
                const checkVideoMetadata = () => {
                    if (video.videoWidth && video.videoHeight) {
                        const aspectRatio = (video.videoWidth / video.videoHeight).toFixed(2);
                        detailsText += `\n${video.videoWidth} × ${video.videoHeight}\nAspect ratio: ${aspectRatio}:1`;
                        this.fileDetails.textContent = detailsText;
                    }
                };
                
                if (video.videoWidth && video.videoHeight) {
                    checkVideoMetadata();
                } else {
                    video.addEventListener('loadedmetadata', checkVideoMetadata);
                }
            }
        }
        
        this.fileDetails.textContent = detailsText;
    }

    updateNavigationInfo() {
        this.mediaIndex.textContent = `${this.currentIndex + 1} of ${this.mediaFiles.length}`;
    }

    updateFolderInfo() {
        this.folderInfo.textContent = `Current: ${this.currentFolderPath} (${this.mediaFiles.length} files)`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async handleLike() {
        if (this.mediaFiles.length === 0) return;
        
        const newFolderNumber = this.currentFolder + 1;
        await this.moveCurrentFile(newFolderNumber);
    }

    async handleDislike() {
        if (this.mediaFiles.length === 0) return;
        
        const newFolderNumber = Math.max(this.currentFolder - 1, 0);
        await this.moveCurrentFile(newFolderNumber);
    }

    async handleCancel() {
        if (this.moveHistory.length === 0) {
            this.showNotification('No moves to undo', 'error');
            return;
        }
        
        const lastMove = this.moveHistory.pop();
        
        try {
            // Move the file back
            const moveResult = await window.electronAPI.moveFile({
                sourcePath: lastMove.newPath,
                targetFolder: this.baseFolderPath,
                fileName: lastMove.fileName
            });
            
            if (!moveResult.success) {
                throw new Error(moveResult.error);
            }
            
            // Add the file back to the current folder's media files
            this.mediaFiles.push({
                name: lastMove.fileName,
                path: lastMove.originalPath,
                size: lastMove.fileSize,
                type: lastMove.fileType
            });
            
            this.showNotification(`✅ Restored ${lastMove.fileName}`, 'success');
            this.updateFolderInfo();
            
            this.currentIndex = this.mediaFiles.length - 1;
            this.showMedia();
            
        } catch (error) {
            console.error('Error undoing move:', error);
            this.showError(`Failed to undo move: ${error.message}`);
            // Put the move back in history if it failed
            this.moveHistory.push(lastMove);
        }
    }

    showFolderCreationDialog(folderPath) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'folder-creation-modal';
            
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-title">📁 Create Folder</div>
                    <p style="color: #a0a0a0; margin-bottom: 20px;">
                        The target folder doesn't exist. Would you like to create it?
                    </p>
                    <div class="modal-path">${folderPath}</div>
                    <div class="modal-buttons">
                        <button class="modal-btn modal-btn-create" id="createBtn">
                            Create Folder
                        </button>
                        <button class="modal-btn modal-btn-cancel" id="cancelBtn">
                            Cancel
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const createBtn = modal.querySelector('#createBtn');
            const cancelBtn = modal.querySelector('#cancelBtn');
            
            const cleanup = () => {
                modal.remove();
            };
            
            createBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
            
            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            
            // Close on escape key
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

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        this.notificationContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutTop 0.3s ease-in forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
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
        
        this.currentIndex = (this.currentIndex + 1) % this.mediaFiles.length;
        this.showMedia();
    }

    previousMedia() {
        if (this.mediaFiles.length === 0) return;
        
        this.currentIndex = (this.currentIndex - 1 + this.mediaFiles.length) % this.mediaFiles.length;
        this.showMedia();
    }

    async moveCurrentFile(targetFolderNumber) {
        if (this.mediaFiles.length === 0) return;
        
        const currentFile = this.mediaFiles[this.currentIndex];
        const targetFolderName = `Liked_${targetFolderNumber}`;
        const targetFolderPath = window.electronAPI.path.join(
            window.electronAPI.path.dirname(this.baseFolderPath), 
            targetFolderName
        );
        
        try {
            // Check if target folder exists
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
            this.showNotification(
                `${targetFolderNumber > this.currentFolder ? '👍' : '👎'} Moved to ${targetFolderName}`,
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