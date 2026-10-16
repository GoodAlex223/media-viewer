'use strict';
// Decodes an image file for the CLIP vision encoder, in the main process (G3 addendum, spec § 11).
// RawImage.read decodes through sharp with its defaults: failOn 'warning' and a 268-megapixel input limit. Those
// reject truncated or slightly malformed files that Chromium displays without complaint. A training-folder file
// left without a CLIP vector keeps the model out of the cache (ml-training.js `cacheable`), so every AI sort
// retrained. The strict read stays first, so every embedding it can produce is unchanged. Only a file it rejects
// gets the lenient decode: failOn 'none', and an input bound of LENIENT_MAX_INPUT_PIXELS (2 ** 29 pixels) rather
// than sharp's default; a file over the bound gets the strict error. The lenient decode reads the file into a buffer
// first, as RawImage.read does: a path input lets libvips keep GIF/WebP files open, which on Windows blocks moving
// them (EBUSY).

const fs = require('fs');
const path = require('path');

// Far above CLIP's 224-px input, and small enough that sharp shrinks a 280-megapixel JPEG while loading it.
const LENIENT_MAX_SIDE = 1024;

// The lenient decode's input bound, about 2x sharp's 268-megapixel default. It still admits the user's
// 14031x19933 (279.7 MP) JPEG, and it keeps a crafted file's whole-frame decode (a header-only PNG declaring
// a huge size) to the same order as the strict path's. Folder content is untrusted, so it is never unbounded.
const LENIENT_MAX_INPUT_PIXELS = 2 ** 29;

/**
 * @param {string} imagePath
 * @param {{ RawImage: any, sharp: Function, warn?: (message: string) => void }} deps
 *   RawImage from @huggingface/transformers; the sharp module; a sink for the session log.
 * @returns {Promise<any>} a RawImage
 */
async function readClipImage(imagePath, { RawImage, sharp, warn = () => {} }) {
    try {
        return await RawImage.read(imagePath);
    } catch (strictError) {
        const name = path.basename(imagePath);
        let decoded;
        try {
            const input = await fs.promises.readFile(imagePath);
            decoded = await sharp(input, { failOn: 'none', limitInputPixels: LENIENT_MAX_INPUT_PIXELS })
                .rotate()
                .resize(LENIENT_MAX_SIDE, LENIENT_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
                .removeAlpha()
                .toColourspace('srgb')
                .raw()
                // A defensive CPU backstop; no test exercises it.
                .timeout({ seconds: 30 })
                .toBuffer({ resolveWithObject: true });
        } catch (lenientError) {
            warn(`CLIP: cannot decode ${name}: ${strictError.message} (lenient: ${lenientError.message})`);
            throw strictError;
        }
        warn(`CLIP: ${name} needed the lenient decoder (${strictError.message})`);
        const { data, info } = decoded;
        return new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels);
    }
}

module.exports = { readClipImage, LENIENT_MAX_SIDE, LENIENT_MAX_INPUT_PIXELS };
