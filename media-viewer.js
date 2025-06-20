
// Require Electron and Node.js modules
// const { ipcRenderer } = require('electron');
// const path = require('path');

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
        // Drop zone
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
            // this.handleFolderDrop(e.dataTransfer.files);
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
        // if (!window.electronAPI) {
            // console.error('Electron API not available');
            // return;
        // }
        try {
            const folderPath = await window.electronAPI.openFolderDialog();
            if (folderPath) {
                await this.loadFolder(folderPath);
            }
        } catch (error) {
            console.error('Error opening folder:', error);
        }
    }

    async handleFolderDrop(event) {
        event.preventDefault();
        this.dropZone.classList.remove('dragover');
        
        const items = event.dataTransfer.files;
        if (items.length > 0) {
        const folderPath = items[0].path;
        await this.loadFolder(folderPath);
        }
    }

    async loadFolder(folderPath) {
        try {
            const result = await window.electronAPI.loadFolder(folderPath);
            
            if (result.error) {
                this.showError(result.error);
                return;
            }
            
            this.mediaFiles = result.files;
            this.currentFolderPath = window.electronAPI.path.basename(folderPath);
            this.baseFolderPath = folderPath;
            
            // Parse current folder number from folder name
            const match = this.currentFolderPath.match(/Liked_(\d+)/);
            this.currentFolder = match ? parseInt(match[1]) : 0;
            
            this.currentIndex = 0;
            this.showMedia();
            this.hideDropZone();
            this.updateFolderInfo();
            
        } catch (error) {
            this.showError(`Failed to load folder: ${error.message}`);
        }
    }

    async handleFolderSelect(files) {
        if (files.length === 0) return;
        
        // Get folder path from the first file
        const firstFile = files[0];
        this.baseFolderPath = firstFile.webkitRelativePath.split('/')[0];
        
        // Filter media files
        const validFiles = Array.from(files).filter(file => {
            const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/');
            const isInRootFolder = file.webkitRelativePath.split('/').length === 2; // folder/file.ext
            return isMedia && isInRootFolder;
        });

        if (validFiles.length === 0) {
            alert('No media files found in the selected folder.');
            return;
        }

        // Parse current folder number from folder name
        const folderName = this.baseFolderPath;
        const match = folderName.match(/Liked_(\d+)/);
        if (match) {
            this.currentFolder = parseInt(match[1]);
        } else {
            this.currentFolder = 0;
        }

        this.mediaFiles = validFiles;
        this.currentFolderPath = this.baseFolderPath;
        this.currentIndex = 0;
        this.showMedia();
        this.hideDropZone();
        this.updateFolderInfo();
    }

    readDirectory(entry) {
        return new Promise((resolve) => {
            const reader = entry.createReader();
            const files = [];
            
            const readEntries = () => {
                reader.readEntries((entries) => {
                    if (entries.length === 0) {
                        resolve(files);
                    } else {
                        entries.forEach(entry => {
                            if (entry.isFile) {
                                entry.file((file) => {
                                    file.webkitRelativePath = entry.fullPath.substring(1);
                                    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                                        files.push(file);
                                    }
                                });
                            }
                        });
                        readEntries();
                    }
                });
            };
            
            readEntries();
        });
    }

    hideDropZone() {
        this.dropZone.style.display = 'none';
        this.controls.style.display = 'flex';
        this.fileInfo.style.display = 'block';
        this.navInfo.style.display = 'block';
    }

    showMedia() {
        if (this.mediaFiles.length === 0) return;

        // Remove existing media
        if (this.currentMedia) {
            this.currentMedia.remove();
        }

        const file = this.mediaFiles[this.currentIndex];
        const url = URL.createObjectURL(file);

        // Create media element
        if (file.type.startsWith('image/')) {
            this.currentMedia = document.createElement('img');
            this.currentMedia.src = url;
        } else if (file.type.startsWith('video/')) {
            this.currentMedia = document.createElement('video');
            this.currentMedia.src = url;
            this.currentMedia.autoplay = true;
            this.currentMedia.loop = true;
            this.currentMedia.muted = true; // Required for autoplay
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

        this.currentMedia.addEventListener('load', onLoad);
        this.currentMedia.addEventListener('loadeddata', onLoad);

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
        const availableWidth = containerRect.width - 40; // 20px padding on each side
        const availableHeight = containerRect.height - 160; // Space for controls and info

        if (this.currentMedia.tagName === 'IMG') {
            // Wait for image to load to get natural dimensions
            const img = this.currentMedia;
            
            // Check if image is larger than available space
            if (img.naturalWidth > availableWidth || img.naturalHeight > availableHeight) {
                const widthRatio = availableWidth / img.naturalWidth;
                const heightRatio = availableHeight / img.naturalHeight;
                const scale = Math.min(widthRatio, heightRatio);
                
                img.style.width = (img.naturalWidth * scale) + 'px';
                img.style.height = (img.naturalHeight * scale) + 'px';
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
            } else {
                // Image fits at 100%, use natural size
                img.style.width = img.naturalWidth + 'px';
                img.style.height = img.naturalHeight + 'px';
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
            }
        } else if (this.currentMedia.tagName === 'VIDEO') {
            // For videos, use similar logic
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
                    // Video fits at 100%, use natural size
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

    getBaseFolderPath() {
        if (!this.baseFolderPath) return '';
        
        // Get the parent directory of the current folder
        const parts = this.baseFolderPath.split('/');
        if (parts.length > 1) {
            return parts.slice(0, -1).join('/');
        }
        return '';
    }

    async shouldPromptFolderCreation(targetPath) {
        // In a real application, you would check if the folder exists
        // For this demo, we'll always prompt for new folders
        return true;
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

    async simulateMoveFile(file, targetFolder, targetFolderPath) {
        // Show move animation
        this.showMoveAnimation(targetFolder.includes(String(this.currentFolder + 1)) ? 'like' : 'dislike', targetFolder);
        
        // Create download link to simulate file save
        const blob = new Blob([file], { type: file.type });
        const url = URL.createObjectURL(blob);
        
        // Create a temporary download link
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name; // Just the filename, folder creation is separate
        a.style.display = 'none';
        document.body.appendChild(a);
        
        // Show instruction to user
        const instruction = document.createElement('div');
        instruction.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            font-size: 14px;
            z-index: 1000;
            max-width: 350px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        
        instruction.innerHTML = `
            <strong>📁 File Move Instructions:</strong><br>
            <div style="margin: 10px 0; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 5px;">
                <strong>1.</strong> Create folder: <code style="color: #00d4aa;">${targetFolderPath}</code><br>
                <strong>2.</strong> Move file: <code style="color: #00d4aa;">${file.name}</code>
            </div>
            <small style="color: #ccc;">💾 Click to download file</small>
        `;
        
        instruction.addEventListener('click', () => {
            a.click();
            instruction.remove();
        });
        
        document.body.appendChild(instruction);
        
        // Auto-remove instruction after 8 seconds
        setTimeout(() => {
            if (instruction.parentNode) {
                instruction.remove();
            }
            URL.revokeObjectURL(url);
            a.remove();
        }, 8000);
        
        console.log(`Move ${file.name} to ${targetFolderPath}/${file.name}`);
        return Promise.resolve();
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
        }, 3000);
    }

    nextMedia() {
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
        }
        
        this.showMedia();
    }

    previousMedia() {
        if (this.mediaFiles.length === 0) return;
        
        this.currentIndex = (this.currentIndex - 1 + this.mediaFiles.length) % this.mediaFiles.length;
        this.showMedia();
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

    async moveCurrentFile(targetFolderNumber) {
        if (this.mediaFiles.length === 0) return;
        
        const currentFile = this.mediaFiles[this.currentIndex];
        const targetFolderName = `Liked_${targetFolderNumber}`;
        const targetFolderPath = window.electronAPI.path.join(window.electronAPI.path.dirname(this.baseFolderPath), targetFolderName);
        
        try {
            // Check if target folder exists
            const folderExists = await window.electronAPI.invoke('check-folder-exists', targetFolderPath);
            
            if (!folderExists) {
                const shouldCreate = await this.showFolderCreationDialog(targetFolderPath);
                if (!shouldCreate) return;
                
                await window.electronAPI.invoke('create-folder', targetFolderPath);
            }
            
            // Move the file
            const moveResult = await window.electronAPI.invoke('move-file', {
                sourcePath: currentFile.path,
                targetFolder: targetFolderPath,
                fileName: currentFile.name
            });
            
            if (moveResult.error) {
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

// document.addEventListener('DOMContentLoaded', () => {
    // if (!window.electronAPI) {
        // console.error('Electron API not available - running in browser?');
        // // Add fallback behavior if needed
        // return;
    // }
//             
// });
const viewer = new MediaViewer();

// // Handle folder selection from main process
//window.electronAPI.on('folder-selected', (event, folderPath) => {
//    viewer.loadFolder(folderPath);
//});