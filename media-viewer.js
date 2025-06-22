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

        document.addEventListener('keydown', (e) => {
            if (this.mediaFiles.length === 0) return;
            
            if (this.isLoading && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                return;
            }
            
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
                
                controlsTimeout = setTimeout(() => {
                    this.controls.classList.remove('show');
                    this.navInfo.classList.remove('show');
                    this.navPrev.classList.remove('show');
                    this.navNext.classList.remove('show');
                    this.videoControls.classList.remove('show');
                }, 2000);
            }
        });

        [this.controls, this.videoControls, this.navInfo, this.navPrev, this.navNext].forEach(element => {
            element.addEventListener('mouseenter', () => {
                clearTimeout(controlsTimeout);
                clearTimeout(videoControlsTimeout);
                showControls();
            });

            element.addEventListener('mouseleave', hideControls);
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

        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        this.showLoadingSpinner();

        if (this.currentMedia) {
            if (this.currentMedia.tagName === 'VIDEO') {
                this.currentMedia.pause();
                this.currentMedia.src = '';
                this.currentMedia.load();
            }
            this.currentMedia.remove();
        }

        const file = this.mediaFiles[this.currentIndex];
        console.log('Showing media:', file.name);
        
        const fileUrl = `file://${file.path}`;

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

    setupImageHandlers(file) {
        const onLoad = () => {
            this.hideLoadingSpinner();
            this.fitMediaToScreen();
            this.currentMedia.style.display = 'block';
            this.isLoading = false;
            this.updateFileInfoWithDimensions(file);
        };

        const onError = () => {
            this.hideLoadingSpinner();
            this.showError(`Failed to load image: ${file.name}`);
            this.isLoading = false;
        };

        this.currentMedia.addEventListener('load', onLoad);
        this.currentMedia.addEventListener('error', onError);
    }

    setupVideoHandlers(file) {
        this.isVideoLoading = true;

        const onLoadedMetadata = () => {
            this.hideLoadingSpinner();
            this.fitMediaToScreen();
            this.currentMedia.style.display = 'block';
            this.isLoading = false;
            this.isVideoLoading = false;
            this.updateFileInfoWithDimensions(file);
            this.setupVideoProgressTracking();
        };

        const onError = () => {
            this.hideLoadingSpinner();
            this.showError(`Failed to load video: ${file.name}`);
            this.isLoading = false;
            this.isVideoLoading = false;
        };

        const onCanPlay = () => {
            this.isVideoLoading = false;
        };

        this.currentMedia.addEventListener('loadedmetadata', onLoadedMetadata);
        this.currentMedia.addEventListener('error', onError);
        this.currentMedia.addEventListener('canplay', onCanPlay);
        
        this.currentMedia.addEventListener('play', () => {
            this.playPauseBtn.textContent = '⏸️';
        });
        
        this.currentMedia.addEventListener('pause', () => {
            this.playPauseBtn.textContent = '▶️';
        });
    }

    setupVideoProgressTracking() {
        if (!this.currentMedia || this.currentMedia.tagName !== 'VIDEO') return;

        const updateProgress = () => {
            const video = this.currentMedia;
            if (video.duration) {
                const progress = (video.currentTime / video.duration) * 100;
                this.progressSlider.value = progress;
                this.currentTime.textContent = this.formatDuration(video.currentTime);
                this.totalTime.textContent = this.formatDuration(video.duration);
            }
        };

        this.currentMedia.addEventListener('timeupdate', updateProgress);
        this.currentMedia.addEventListener('loadedmetadata', updateProgress);
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

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    updateNavigationInfo() {
        this.mediaIndex.textContent = `${this.currentIndex + 1} of ${this.mediaFiles.length}`;
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
            
            this.currentIndex = this.mediaFiles.length - 1;
            await this.showMedia();
            
        } catch (error) {
            console.error('Error undoing move:', error);
            this.showError(`Failed to undo move: ${error.message}`);
            this.moveHistory.push(lastMove);
        }
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
        
        if (this.isLoading) return;
        
        this.currentIndex = (this.currentIndex + 1) % this.mediaFiles.length;
        this.showMedia();
    }

    previousMedia() {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        
        this.currentIndex = (this.currentIndex - 1 + this.mediaFiles.length) % this.mediaFiles.length;
        this.showMedia();
    }

    toggleHelp() {
        const helpOverlay = document.getElementById('helpOverlay');
        if (helpOverlay.classList.contains('show')) {
            helpOverlay.classList.remove('show');
        } else {
            helpOverlay.classList.add('show');
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