'use strict';
// The image encoders the prototype can run. "clip-b32-q8" is exactly what the app runs today (main.js:
// Xenova/clip-vit-base-patch32, CLIPVisionModelWithProjection, dtype q8, image_embeds L2-normalised).
// file: the ONNX file transformers.js resolves for that dtype; out: the output tensor used as the embedding.

const DTYPE_SUFFIX = {
    fp32: '',
    fp16: '_fp16',
    q8: '_quantized',
    int8: '_int8',
    uint8: '_uint8',
    q4: '_q4',
    q4f16: '_q4f16',
    bnb4: '_bnb4',
};

function spec(key, repo, cls, base, dtype, out, note) {
    return { key, repo, cls, dtype, out, note, file: `onnx/${base}${DTYPE_SUFFIX[dtype]}.onnx` };
}

const MODELS = Object.fromEntries(
    [
        spec(
            'clip-b32-q8',
            'Xenova/clip-vit-base-patch32',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'q8',
            'image_embeds',
            'the app today'
        ),
        spec(
            'clip-b32-fp32',
            'Xenova/clip-vit-base-patch32',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'fp32',
            'image_embeds'
        ),
        spec(
            'clip-b16-q8',
            'Xenova/clip-vit-base-patch16',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'q8',
            'image_embeds'
        ),
        spec(
            'siglip2-b16-224-q8',
            'onnx-community/siglip2-base-patch16-224-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'q8',
            'pooler_output'
        ),
        spec(
            'siglip2-b16-224-fp16',
            'onnx-community/siglip2-base-patch16-224-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'fp16',
            'pooler_output'
        ),
        spec(
            'siglip2-b16-224-fp32',
            'onnx-community/siglip2-base-patch16-224-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'fp32',
            'pooler_output'
        ),
        spec(
            'siglip2-b16-256-q8',
            'onnx-community/siglip2-base-patch16-256-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'q8',
            'pooler_output'
        ),
        spec(
            'siglip2-b32-256-q8',
            'onnx-community/siglip2-base-patch32-256-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'q8',
            'pooler_output'
        ),
        spec(
            'mobileclip-s2-q8',
            'Xenova/mobileclip_s2',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'q8',
            'image_embeds'
        ),
        spec('dinov2-s-q8', 'onnx-community/dinov2-small', 'AutoModel', 'model', 'q8', 'cls'),
        spec('dinov2-s-fp32', 'onnx-community/dinov2-small', 'AutoModel', 'model', 'fp32', 'cls'),
        spec('dinov2-b-q8', 'onnx-community/dinov2-base', 'AutoModel', 'model', 'q8', 'cls'),
        spec('dinov2reg-s-q8', 'onnx-community/dinov2-with-registers-small', 'AutoModel', 'model', 'q8', 'cls'),
        spec('dinov2reg-s-fp32', 'onnx-community/dinov2-with-registers-small', 'AutoModel', 'model', 'fp32', 'cls'),
        spec('dinov3-s16-q8', 'onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX', 'AutoModel', 'model', 'q8', 'cls'),
        spec(
            'clip-b16-fp32',
            'Xenova/clip-vit-base-patch16',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'fp32',
            'image_embeds'
        ),
        spec(
            'siglip2-b32-256-fp32',
            'onnx-community/siglip2-base-patch32-256-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'fp32',
            'pooler_output'
        ),
        spec(
            'dinov3-s16-fp32',
            'onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX',
            'AutoModel',
            'model',
            'fp32',
            'cls'
        ),
        // Other published quantisations of the same two files, for the fidelity check (compare-runs.js).
        spec(
            'clip-b32-int8',
            'Xenova/clip-vit-base-patch32',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'int8',
            'image_embeds'
        ),
        spec(
            'siglip2-b16-224-int8',
            'onnx-community/siglip2-base-patch16-224-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'int8',
            'pooler_output'
        ),
        spec(
            'clip-b32-uint8',
            'Xenova/clip-vit-base-patch32',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'uint8',
            'image_embeds'
        ),
        spec(
            'siglip2-b16-224-uint8',
            'onnx-community/siglip2-base-patch16-224-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'uint8',
            'pooler_output'
        ),
        spec(
            'clip-b32-q4',
            'Xenova/clip-vit-base-patch32',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'q4',
            'image_embeds'
        ),
        spec(
            'siglip2-b16-224-q4',
            'onnx-community/siglip2-base-patch16-224-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'q4',
            'pooler_output'
        ),
        spec(
            'clip-b32-bnb4',
            'Xenova/clip-vit-base-patch32',
            'CLIPVisionModelWithProjection',
            'vision_model',
            'bnb4',
            'image_embeds'
        ),
        spec(
            'siglip2-b16-224-bnb4',
            'onnx-community/siglip2-base-patch16-224-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'bnb4',
            'pooler_output'
        ),
        spec(
            'siglip2-b32-256-bnb4',
            'onnx-community/siglip2-base-patch32-256-ONNX',
            'SiglipVisionModel',
            'vision_model',
            'bnb4',
            'pooler_output'
        ),
    ].map((m) => [m.key, m])
);

module.exports = { MODELS, DTYPE_SUFFIX };
