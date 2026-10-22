// main-thread-hash.js
// Today's perceptual-hash route (G2 PR 2), moved out of the renderer unchanged in behaviour: a file is drawn on a
// canvas in the page and hashed with the one blockhash (perceptual-hash.js). The pool's fallback and parity
// reference. The route is the measured one (spec § 5.2, F4): a FRESH canvas per file, a default 2D context
// (never `willReadFrequently`), drawImage then getImageData at 256x256.
import { blockhash, HASH_BITS, HASH_CANVAS_SIZE } from './perceptual-hash.js';
import * as MediaUrl from './media-url.js';

export const MAIN_ROUTE_TIMEOUT_MS = 30_000;

/**
 * Draws an image URL on a fresh canvas and hashes it. `wantPixels` also returns the read-back's bytes (the parity
 * check compares them across routes).
 * @returns {Promise<{ hash: string, pixels?: Uint8ClampedArray }>}
 */
export function hashImageUrl(url, { wantPixels = false } = {}) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener('load', () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = HASH_CANVAS_SIZE;
                canvas.height = HASH_CANVAS_SIZE;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                const hash = blockhash(imageData, HASH_BITS);
                resolve(wantPixels ? { hash, pixels: imageData.data } : { hash });
            } catch (error) {
                reject(error);
            }
        });

        img.addEventListener('error', (error) => {
            reject(new Error(`Image load error: ${error.message || 'Unknown error'}`));
        });

        img.src = url;
    });
}

/**
 * The perceptual hash of one file: a video's first frame, a JXL's frame 0, or an image. Rejects with the same
 * messages the renderer's computePerceptualHash always did.
 * @param {string} filePath
 * @param {{ isJxl: (p: string) => boolean, decodeJxl: (p: string) => Promise<object>, releaseVideo: (v: object) => void }} host
 * @returns {Promise<string>}
 */
export function hashFile(filePath, { isJxl, decodeJxl, releaseVideo }) {
    return new Promise((resolve, reject) => {
        const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);
        const timeout = setTimeout(() => {
            reject(new Error('Timeout: processing took too long'));
        }, MAIN_ROUTE_TIMEOUT_MS);

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
                    releaseVideo(video);
                    reject(error);
                }
            });

            video.addEventListener('seeked', () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = HASH_CANVAS_SIZE;
                    canvas.height = HASH_CANVAS_SIZE;
                    const ctx = canvas.getContext('2d');

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                    const hash = blockhash(imageData, HASH_BITS);
                    cleanup();
                    releaseVideo(video);
                    resolve(hash);
                } catch (error) {
                    cleanup();
                    releaseVideo(video);
                    reject(error);
                }
            });

            // G3: never empties `src` (see _releaseVideo). The old `video.src = ''` here fired `error` again,
            // forever, after every video this method hashed.
            video.addEventListener(
                'error',
                (error) => {
                    cleanup();
                    reject(new Error(`Video load error: ${error.message || 'Unknown error'}`));
                },
                { once: true }
            );

            video.src = MediaUrl.toMediaUrl(filePath);
        } else if (isJxl(filePath)) {
            decodeJxl(filePath)
                .then((decoded) => {
                    if (!decoded.frames || decoded.frames.length === 0) {
                        cleanup();
                        reject(new Error('JXL decoded with no frames'));
                        return;
                    }
                    // Local, self-contained object URL, revoked once the hash settles.
                    // (Do NOT use jxlFrameToObjectURL here — that set is revoked on media-display
                    //  cleanup and could revoke this in-flight extraction URL mid-load.)
                    const url = URL.createObjectURL(new Blob([decoded.frames[0].pngBytes], { type: 'image/png' }));
                    return hashImageUrl(url)
                        .finally(() => URL.revokeObjectURL(url))
                        .then(
                            ({ hash }) => {
                                cleanup();
                                resolve(hash);
                            },
                            (error) => {
                                cleanup();
                                reject(error);
                            }
                        );
                })
                .catch((err) => {
                    cleanup();
                    reject(new Error('JXL decode failed: ' + (err && err.message ? err.message : err)));
                });
        } else {
            // Process image
            hashImageUrl(MediaUrl.toMediaUrl(filePath)).then(
                ({ hash }) => {
                    cleanup();
                    resolve(hash);
                },
                (error) => {
                    cleanup();
                    reject(error);
                }
            );
        }
    });
}

// The B1 probe's canary painter (spike/page/canary.js paint()): a linear gradient, 40 seeded circles and
// scanlines every 3 px, so the downscale filter matters. Deterministic for a seed.
function paintCanary(ctx, w, h, alpha, seed) {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    if (alpha) {
        ctx.clearRect(0, 0, w, h);
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, alpha ? 'rgba(200,40,40,0.9)' : '#c82828');
    g.addColorStop(0.5, alpha ? 'rgba(40,200,90,0.5)' : '#28c85a');
    g.addColorStop(1, alpha ? 'rgba(30,60,220,0.8)' : '#1e3cdc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
        const r = Math.floor(rnd() * 255);
        const gg = Math.floor(rnd() * 255);
        const b = Math.floor(rnd() * 255);
        const a = alpha ? (0.3 + rnd() * 0.7).toFixed(2) : 1;
        ctx.fillStyle = `rgba(${r},${gg},${b},${a})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h, 5 + rnd() * w * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }
    // Fine detail, so the downscale filter matters.
    for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = `rgba(0,0,0,${alpha ? 0.15 : 0.12})`;
        ctx.fillRect(0, y, w, 1);
    }
}

function makeCanaryBlob(w, h, type, alpha, seed, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    paintCanary(canvas.getContext('2d'), w, h, alpha, seed);
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The two canary images the pool checks a worker against before trusting it (320x240, encoded by Chromium itself).
 * @returns {Promise<Array<{ name: string, blob: Blob }>>}
 */
export async function makeCanaryImages() {
    const jpeg = await makeCanaryBlob(320, 240, 'image/jpeg', false, 1, 0.92);
    const png = await makeCanaryBlob(320, 240, 'image/png', true, 4);
    return [
        { name: 'canary-jpeg', blob: jpeg },
        { name: 'canary-png', blob: png },
    ];
}
