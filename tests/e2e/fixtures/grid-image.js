/**
 * A patterned test image for the zoom E2E (G3): a grid with coloured shapes, generated at test time. The committed
 * fixtures are one solid colour, where a zoom or a pan cannot show, and a flat-shaded pattern keeps a committed
 * screenshot of it small (photo-like noise made them ~2 MB each).
 */

import { createRequire } from 'module';

const sharp = createRequire(import.meta.url)('sharp');

/**
 * Writes a 640x480 PNG to `path`: an hsl(hue, 35%, 88%) background, a 40 px grid, a circle, a rectangle and a triangle.
 * `scale` draws the same picture larger (scale 5: 3200x2400, bigger than the app window). The default output is
 * unchanged, byte for byte, so the committed G3 evidence screenshots stay reproducible.
 * @param {string} path
 * @param {number} hue
 * @param {{ scale?: number }} [options]
 * @returns {Promise<void>}
 */
export async function writeGridImage(path, hue, { scale = 1 } = {}) {
    const lines = [];
    for (let x = 0; x <= 640; x += 40) {
        lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="480"/>`);
    }
    for (let y = 0; y <= 480; y += 40) {
        lines.push(`<line x1="0" y1="${y}" x2="640" y2="${y}"/>`);
    }
    const size =
        scale === 1 ? 'width="640" height="480"' : `width="${640 * scale}" height="${480 * scale}" viewBox="0 0 640 480"`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${size}>
        <rect width="640" height="480" fill="hsl(${hue},35%,88%)"/>
        <g stroke="#556" stroke-width="2">${lines.join('')}</g>
        <circle cx="200" cy="180" r="90" fill="hsl(${hue},70%,50%)"/>
        <rect x="380" y="240" width="160" height="120" fill="hsl(${(hue + 120) % 360},70%,45%)"/>
        <polygon points="320,60 380,160 260,160" fill="hsl(${(hue + 240) % 360},70%,50%)"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path);
}
