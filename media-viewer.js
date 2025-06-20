class MediaViewer {
    constructor() {
        this.mediaFiles = [];
        this.currentIndex = 0;
        this.currentFolder = 0;
        this.currentMedia = null;
        this.currentFolderPath = '';
        this.baseFolderPath = '';
        
        this.initializeElements();
        this.setupEventListeners();
        
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
        this.fileSize = document.getElementById('fileSize');
        this.folderInfo = document.getElementById('folderInfo');
        this.controls = document.getElementById('controls');
        this.likeBtn = document.getElementById('likeBtn');
        this.dislikeBtn = document.getElementById('dislikeBtn');
        this.navInfo = document.getElementById('navInfo');
        this.mediaIndex = document.getElementById('mediaIndex');
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.mediaFiles.length === 0) return;
            
            switch(e.key) {
                case 'ArrowRight':
                case ' ':
                    e.preventDefault();
                    this.handleLike();
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
            }
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
        
        // In Electron, dropped folders should have a path property
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
        } else if (file.type.startsWith('video/')) {
            this.currentMedia = document.createElement('video');
            this.currentMedia.src = fileUrl;
            this.currentMedia.autoplay = true;
            this.currentMedia.loop = true;
            this.currentMedia.muted = true;
            this.currentMedia.controls = false;
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

        document.querySelector('.media-container').appendChild(this.currentMedia);

        // Update UI
        this.updateFileInfo(file);
        this.updateNavigationInfo();
    }

    fitMediaToScreen() {
        if (!this.currentMedia) return;

        const container = document.querySelector('.media-container');
        const containerRect = container.getBoundingClientRect();
        
        // Account for padding and controls
        const availableWidth = containerRect.width - 40;
        const availableHeight = containerRect.height - 160;

        if (this.currentMedia.tagName === 'IMG') {
            const img = this.currentMedia;
            
            if (img.naturalWidth > availableWidth || img.naturalHeight > availableHeight) {
                const widthRatio = availableWidth / img.naturalWidth;
                const heightRatio = availableHeight / img.naturalHeight;
                const scale = Math.min(widthRatio, heightRatio);
                
                img.style.width = (img.naturalWidth * scale) + 'px';
                img.style.height = (img.naturalHeight * scale) + 'px';
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
            } else {
                img.style.width = img.naturalWidth + 'px';
                img.style.height = img.naturalHeight + 'px';
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
            }
        } else if (this.currentMedia.tagName === 'VIDEO') {
            const video = this.currentMedia;
            
            video.addEventListener('loadedmetadata', () => {
                if (video.videoWidth > availableWidth || video.videoHeight > availableHeight) {
                    const widthRatio = availableWidth / video.videoWidth;
                    const heightRatio = availableHeight / video.videoHeight;
                    const scale = Math.min(widthRatio, heightRatio);
                    
                    video.style.width = (video.videoWidth * scale) + 'px';
                    video.style.height = (video.videoHeight * scale) + 'px';
                    video.style.maxWidth = 'none';
                    video.style.maxHeight = 'none';
                } else {
                    video.style.width = video.videoWidth + 'px';
                    video.style.height = video.videoHeight + 'px';
                    video.style.maxWidth = 'none';
                    video.style.maxHeight = 'none';
                }
            });
        }
    }

    showLoadingSpinner() {
        const existing = document.querySelector('.loading');
        if (existing) existing.remove();

        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.innerHTML = '<div class="spinner"></div>Loading...';
        document.querySelector('.media-container').appendChild(loading);
    }

    hideLoadingSpinner() {
        const loading = document.querySelector('.loading');
        if (loading) loading.remove();
    }

    updateFileInfo(file) {
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
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

    showMoveAnimation(action, targetFolder) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, ${action === 'like' ? '#00d4aa' : '#ff6b6b'} 0%, ${action === 'like' ? '#00a085' : '#ee5a24'} 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 15px;
            font-size: 18px;
            font-weight: bold;
            z-index: 1000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
            animation: slideIn 0.3s ease-out;
        `;
        
        notification.textContent = `${action === 'like' ? '👍' : '👎'} Moving to ${targetFolder}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 1500);
    }

    showError(message) {
        console.error('Error:', message);
        
        const error = document.createElement('div');
        error.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 15px;
            font-size: 16px;
            z-index: 1000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
            text-align: center;
        `;
        
        error.textContent = message;
        document.body.appendChild(error);
        
        setTimeout(() => {
            error.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => error.remove(), 300);
        }, 4000);
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
            
            // Show success animation
            this.showMoveAnimation(
                targetFolderNumber > this.currentFolder ? 'like' : 'dislike', 
                targetFolderName
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