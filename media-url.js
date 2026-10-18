// media-url.js
// The URL the page loads a media file by (G1 I1): the app scheme's media door, with the whole
// path in one encodeURIComponent segment, so drive, UNC and POSIX paths all round-trip exactly
// (spec D6). app-protocol.js decodes it and authorizes the read; never build a file: URL instead.
export const MEDIA_URL_PREFIX = 'app://media-viewer/@fs/';

export function toMediaUrl(filePath) {
    return MEDIA_URL_PREFIX + encodeURIComponent(filePath);
}
