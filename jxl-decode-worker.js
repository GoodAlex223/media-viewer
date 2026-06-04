// Module Web Worker: decodes JXL bytes to per-frame PNG blobs + durations.
// Protocol in:  { type: 'init', wasmBytes }   (sent once before first decode)
//               { type: 'decode', id, buffer }
// Protocol out: { type: 'ready' }
//               { type: 'decoded', id, frames: [{pngBytes, duration}], width, height, animated, numLoops }
//               { type: 'error', id, message }
import init, { JxlImage } from './vendor/jxl-oxide-wasm/jxl_oxide_wasm.js';

let ready = null;

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
        ready = init({ module_or_path: new Uint8Array(msg.wasmBytes) });
        await ready;
        self.postMessage({ type: 'ready' });
        return;
    }
    if (msg.type !== 'decode') return;
    const { id, buffer } = msg;
    try {
        if (!ready) throw new Error('decoder not initialized');
        await ready;
        const img = new JxlImage();
        img.feedBytes(new Uint8Array(buffer));
        if (!img.tryInit()) throw new Error('JXL header incomplete');
        const animated = img.animated;
        const count = animated ? img.numLoadedKeyframes : 1;
        const frames = [];
        const transfer = [];
        for (let i = 0; i < count; i++) {
            const r = img.render(animated ? i : undefined);
            const duration = animated ? r.duration : 0; // READ metadata BEFORE encodeToPng()
            const pngBytes = r.encodeToPng(); // terminal — must be last; do not free() after
            frames.push({ pngBytes, duration });
            transfer.push(pngBytes.buffer);
        }
        const width = img.width;
        const height = img.height;
        const numLoops = img.numLoops;
        img.free();
        self.postMessage({ type: 'decoded', id, frames, width, height, animated, numLoops }, transfer);
    } catch (err) {
        self.postMessage({ type: 'error', id, message: String(err && err.message ? err.message : err) });
    }
};
