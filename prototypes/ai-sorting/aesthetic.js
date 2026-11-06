'use strict';
// LAION aesthetic predictor v1 for CLIP ViT-B/32 (MIT; github.com/LAION-AI/aesthetic-predictor,
// sa_0_4_vit_b_32_linear.pth): one linear layer over the L2-normalised CLIP image embedding, the same 512-dim
// vector the app already computes. The .pth is a PyTorch zip; its pickle maps "weight" to storage 0
// (512 float32) and "bias" to storage 1 (1 float32), so the raw storages are read directly and nothing is
// unpickled. Extract it first: python -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" <pth> <dir>

const fs = require('fs');
const path = require('path');

function loadAestheticHead(extractedDir) {
    const read = (name) => {
        const buf = fs.readFileSync(path.join(extractedDir, 'archive', 'data', name));
        return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
    };
    const weight = read('0');
    const bias = read('1');
    if (weight.length !== 512 || bias.length !== 1) {
        throw new Error(`unexpected head shapes ${weight.length}, ${bias.length}`);
    }
    return { weight, bias: bias[0] };
}

function aestheticScore(head, unitClipVector) {
    let s = head.bias;
    for (let i = 0; i < 512; i++) {
        s += head.weight[i] * unitClipVector[i];
    }
    return s;
}

module.exports = { loadAestheticHead, aestheticScore };
