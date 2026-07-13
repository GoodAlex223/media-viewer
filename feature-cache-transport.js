// Pack a slice of [filename, entry] pairs into transferable typed-array buffers.
// vecBuf = n*64 f32, clipBuf = n*512 f32 (full-width; hasClip[i]===0 means ignore slot i).
function packFeatureChunk(entries) {
    const n = entries.length;
    const names = new Array(n);
    const sizes = new Array(n);
    const mtimes = new Array(n);
    const hasClip = new Array(n);
    const vecs = new Float32Array(n * 64);
    const clips = new Float32Array(n * 512);
    for (let i = 0; i < n; i++) {
        const [filename, entry] = entries[i];
        names[i] = filename;
        sizes[i] = entry.size;
        mtimes[i] = entry.mtime;
        const v = entry.vector || [];
        for (let j = 0; j < 64 && j < v.length; j++) vecs[i * 64 + j] = v[j];
        if (entry.clipVector && entry.clipVector.length === 512) {
            hasClip[i] = 1;
            const c = entry.clipVector;
            for (let j = 0; j < 512; j++) clips[i * 512 + j] = c[j];
        } else {
            hasClip[i] = 0;
        }
    }
    return { names, sizes, mtimes, hasClip, vecBuf: vecs.buffer, clipBuf: clips.buffer };
}

module.exports = { packFeatureChunk };
