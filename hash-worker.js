// hash-worker.js
// Module Web Worker (G2 PR 2, spec § 5.2): image bytes -> perceptual hash, off the main thread. The route is the
// measured one (F4, re-measured 2026-10-22): a JPEG/WebP decodes through ImageDecoder, and a YUV frame goes to the
// canvas as a VideoFrame (the GPU converts, as an <img> does); anything else goes through createImageBitmap(blob).
// A fresh default-options OffscreenCanvas per file, drawImage to 256x256, getImageData: no context options, no
// reused canvas, no decode-time resize or read-back hint: each one changed the pixels the hash reads.
// Also imported outside a worker (tests, the renderer's isYuvFormat), so the only top-level effect is the guarded
// handler install at the bottom.
import { blockhash, HASH_CANVAS_SIZE, HASH_BITS } from './perceptual-hash.js';

// The type from the first bytes, never from the file name. null = not an image this route decodes.
export function sniffImageType(bytes) {
    if (!bytes || bytes.length < 2) {
        return null;
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        return 'jpeg';
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
        return 'png';
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49) {
        return 'gif';
    }
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && // R
        bytes[1] === 0x49 && // I
        bytes[2] === 0x46 && // F
        bytes[3] === 0x46 && // F
        bytes[8] === 0x57 && // W
        bytes[9] === 0x45 && // E
        bytes[10] === 0x42 && // B
        bytes[11] === 0x50 // P
    ) {
        return 'webp';
    }
    return null;
}

// The measured YUV test: these frames draw as VideoFrames; every other format takes createImageBitmap.
export function isYuvFormat(format) {
    return !!format && /^(I4|NV|I2)/.test(format);
}

const ascii = (bytes, at, text) => {
    for (let i = 0; i < text.length; i++) {
        if (bytes[at + i] !== text.charCodeAt(i)) {
            return false;
        }
    }
    return true;
};

// For the parity report only: does the file carry an embedded colour profile? Walks the container, never decodes.
export function hasIccProfile(bytes, type) {
    if (type === 'jpeg') {
        let at = 2;
        while (at + 4 <= bytes.length && bytes[at] === 0xff) {
            const marker = bytes[at + 1];
            if (marker === 0xda) {
                return false; // SOS: the image data starts, no more headers
            }
            if (marker === 0xff) {
                at += 1; // fill byte
                continue;
            }
            const length = (bytes[at + 2] << 8) | bytes[at + 3];
            if (marker === 0xe2 && ascii(bytes, at + 4, 'ICC_PROFILE\0')) {
                return true;
            }
            if (length < 2) {
                return false;
            }
            at += 2 + length;
        }
        return false;
    }
    if (type === 'png') {
        let at = 8;
        while (at + 8 <= bytes.length) {
            const length = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
            if (ascii(bytes, at + 4, 'iCCP')) {
                return true;
            }
            if (ascii(bytes, at + 4, 'IDAT')) {
                return false;
            }
            at += 12 + length;
        }
        return false;
    }
    if (type === 'webp') {
        let at = 12;
        while (at + 8 <= bytes.length) {
            if (ascii(bytes, at, 'ICCP')) {
                return true;
            }
            const length = (bytes[at + 4] | (bytes[at + 5] << 8) | (bytes[at + 6] << 16) | (bytes[at + 7] << 24)) >>> 0;
            at += 8 + length + (length & 1);
        }
        return false;
    }
    return false;
}

// bytes -> { hash, info: { type, format, icc }, pixels? }. `pixels` (the read-back) is for the parity report only.
export async function hashBytes(buffer, { wantPixels = false } = {}) {
    const bytes = new Uint8Array(buffer);
    const type = sniffImageType(bytes);
    if (type === null) {
        throw new Error('Unrecognised image bytes');
    }
    const mime = 'image/' + type;
    const canvas = new OffscreenCanvas(HASH_CANVAS_SIZE, HASH_CANVAS_SIZE);
    const ctx = canvas.getContext('2d');
    let decoder = null;
    let image = null;
    let bitmap = null;
    let format = null;
    try {
        if (type === 'jpeg' || type === 'webp') {
            decoder = new ImageDecoder({ data: buffer, type: mime });
            image = (await decoder.decode({ frameIndex: 0 })).image;
            format = image.format;
        }
        if (image && isYuvFormat(format)) {
            ctx.drawImage(image, 0, 0, HASH_CANVAS_SIZE, HASH_CANVAS_SIZE);
        } else {
            bitmap = await createImageBitmap(new Blob([buffer], { type: mime }));
            ctx.drawImage(bitmap, 0, 0, HASH_CANVAS_SIZE, HASH_CANVAS_SIZE);
        }
    } finally {
        if (image) {
            image.close();
        }
        if (bitmap) {
            bitmap.close();
        }
        if (decoder) {
            decoder.close();
        }
    }
    const data = ctx.getImageData(0, 0, HASH_CANVAS_SIZE, HASH_CANVAS_SIZE);
    const result = { hash: blockhash(data, HASH_BITS), info: { type, format, icc: hasIccProfile(bytes, type) } };
    if (wantPixels) {
        result.pixels = data.data.buffer;
    }
    return result;
}

async function handleMessage(e) {
    const { type, id, url, bytes, wantPixels } = e.data;
    if (type !== 'hash') {
        return;
    }
    try {
        let buffer;
        if (url !== undefined) {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            buffer = await res.arrayBuffer();
        } else {
            buffer =
                bytes instanceof Uint8Array
                    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
                    : bytes;
        }
        const r = await hashBytes(buffer, { wantPixels: !!wantPixels });
        const reply = { type: 'result', id, ok: true, hash: r.hash, info: r.info };
        if (r.pixels) {
            reply.pixels = r.pixels;
            self.postMessage(reply, [r.pixels]);
        } else {
            self.postMessage(reply);
        }
    } catch (err) {
        self.postMessage({ type: 'result', id, ok: false, error: String(err && err.message ? err.message : err) });
    }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = handleMessage;
}
