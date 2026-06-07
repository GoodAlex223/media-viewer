// Shared media-format helpers. CJS module required by main.js and unit tests.
// Mirrors the feature-extractor.js / ml-model.js shared-lib pattern.

function isMediaFile(extension) {
    const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.jxl'];
    return mediaExtensions.includes(extension);
}

function getMimeType(extension) {
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.jxl': 'image/jxl',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

// Conditional CJS export (mirrors feature-extractor.js / ml-model.js): guards against
// `module` being undefined if this file is ever loaded via importScripts / browser <script>.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isMediaFile, getMimeType };
}
