// Module Web Worker: decodes JXL bytes to per-frame PNG blobs + durations,
// STREAMING frames as they are encoded (frame-0-first; spec 2026-06-12).
// Protocol in:  { type: 'init', wasmBytes }   (sent once before first decode)
//               { type: 'decode', id, buffer }
// Protocol out: { type: 'ready' }
//               { type: 'init-error', message }   (if wasm init throws; renderer rejects _jxlReady)
//               { type: 'meta',  id, width, height, animated, numLoops, frameCount }
//               { type: 'frame', id, index, pngBytes, duration }   (one per frame, transferable)
//               { type: 'done',  id }
//               { type: 'error', id, message }   (may arrive mid-stream, after some frames)
import init, { JxlImage } from './vendor/jxl-oxide-wasm/jxl_oxide_wasm.js';

let ready = null;

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
        try {
            ready = init({ module_or_path: new Uint8Array(msg.wasmBytes) });
            await ready;
            self.postMessage({ type: 'ready' });
        } catch (err) {
            ready = null; // allow a later re-init attempt
            self.postMessage({ type: 'init-error', message: String(err && err.message ? err.message : err) });
        }
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
        self.postMessage({
            type: 'meta',
            id,
            width: img.width,
            height: img.height,
            animated,
            numLoops: img.numLoops,
            frameCount: count,
        });
        for (let i = 0; i < count; i++) {
            const r = img.render(animated ? i : undefined);
            const duration = animated ? r.duration : 0; // READ metadata BEFORE encodeToPng()
            const pngBytes = r.encodeToPng(); // terminal — must be last; do not free() after
            self.postMessage({ type: 'frame', id, index: i, pngBytes, duration }, [pngBytes.buffer]);
        }
        img.free();
        self.postMessage({ type: 'done', id });
    } catch (err) {
        self.postMessage({ type: 'error', id, message: String(err && err.message ? err.message : err) });
    }
};
