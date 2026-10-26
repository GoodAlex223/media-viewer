import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { toMediaUrl, MEDIA_URL_PREFIX } from '../media-url.js';

const require = createRequire(import.meta.url);
const { decodeMediaPath, APP_SCHEME, APP_HOST, MEDIA_PREFIX } = require('../app-protocol.js');

describe('toMediaUrl (G1 I1)', () => {
    it('names the media door the handler serves', () => {
        expect(MEDIA_URL_PREFIX).toBe(`${APP_SCHEME}://${APP_HOST}${MEDIA_PREFIX}`);
    });

    it.each([
        ['a Windows drive path', 'C:\\Users\\a\\Pictures\\x.jpg'],
        ['a UNC path', '\\\\server\\share\\x.jpg'],
        ['a POSIX path', '/home/a/x.jpg'],
        ['spaces, # % & and brackets', 'C:\\a b\\#1 %20 & [y].png'],
        ['non-ASCII', 'D:\\Фото\\中文\\é.webp'],
        ['an encoded-looking name', 'C:\\x\\%2F%5C..png'],
    ])('round-trips %s through the handler decoder', (_label, p) => {
        expect(decodeMediaPath(new URL(toMediaUrl(p)).pathname)).toBe(p);
    });
});

// A control, not a convention (memory feedback_convention_is_not_a_control): the renderer never
// names a file: URL, and every src it assigns is a known kind.
describe('renderer media URLs (G1 I1)', () => {
    const RENDERER_FILES = [
        'media-viewer.js',
        'fullscreen.js',
        'zoom.js',
        'tournament.js',
        'ml-training.js',
        'like-or-skip.js',
        'recent-folders.js',
        'media-url.js',
        'feature-cache-store.js',
        'face-detector.js',
        'feature-extractor.js',
        'sorting-worker.js',
        'ml-worker.js',
        'feature-worker.js',
        'jxl-decode-worker.js',
        'similarity-sort.js',
        'tournament-engine.js',
        'ml-model.js',
        'perceptual-hash.js',
        'main-thread-hash.js',
        'hash-pool.js',
        'hash-parity.js',
        'hash-worker.js',
        'index.html',
    ];
    const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

    // Every app file the page loads, by import, worker or importScripts, from index.html. G2 PR 2 moved the hash
    // route's src assignments into a module the list above did not name (PR #87 review #5).
    function loadedByThePage() {
        const seen = new Set(['index.html']);
        const queue = ['index.html'];
        while (queue.length > 0) {
            const text = read(queue.shift());
            const refs = [
                ...text.matchAll(/<script[^>]*\bsrc="(?:\.\/)?([a-z0-9-]+\.js)"/g),
                ...text.matchAll(/\bfrom\s+'\.\/([a-z0-9-]+\.js)'/g),
                ...text.matchAll(/new Worker\('(?:\.\/)?([a-z0-9-]+\.js)'/g),
                ...text.matchAll(/importScripts\(\s*'(?:\.\/)?([a-z0-9-]+\.js)'/g),
            ].map((m) => m[1]);
            for (const ref of refs) {
                if (!seen.has(ref)) {
                    seen.add(ref);
                    queue.push(ref);
                }
            }
        }
        return seen;
    }

    it('the list names every app file the page loads', () => {
        const loaded = loadedByThePage();
        expect(loaded.has('main-thread-hash.js')).toBe(true); // the walk reaches a module two imports deep
        expect([...loaded].filter((f) => !RENDERER_FILES.includes(f))).toEqual([]);
    });
    // Code only: full-line and block comments removed, so prose that quotes an assignment is not one.
    const code = (f) =>
        read(f)
            .replace(/^\s*\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
    const ALLOWED_SRC = new Set([
        "''",
        "'./node_modules/@vladmandic/face-api/dist/face-api.js'",
        'MediaUrl.toMediaUrl(filePath)',
        'fileUrl',
        'leftFileUrl',
        'rightFileUrl',
        'this.jxlFrameToObjectURL(decoded.frames[0])',
        'url',
    ]);

    it('no renderer file names a file:// URL or converts a path to one', () => {
        for (const f of RENDERER_FILES) {
            expect(read(f), f).not.toContain('file://');
            expect(read(f), f).not.toContain('pathToFileURL');
        }
        expect(read('index.html')).not.toMatch(/http-equiv="Content-Security-Policy"/);
        expect(read('index.html')).not.toContain('unpkg.com');
    });

    it('every src the renderer assigns is a media URL, a blob URL, an app file or empty', () => {
        for (const f of RENDERER_FILES) {
            for (const [, rhs] of code(f).matchAll(/\.src\s*=\s*([^;]+);/g)) {
                expect(ALLOWED_SRC.has(rhs.trim()), `${f}: .src = ${rhs}`).toBe(true);
            }
            expect(read(f), f).not.toMatch(/setAttribute\(\s*['"]src['"]/);
        }
    });

    it('the four display URLs are built by toMediaUrl', () => {
        const src = read('media-viewer.js');
        const built = src.match(
            /const (?:fileUrl|leftFileUrl|rightFileUrl) = MediaUrl\.toMediaUrl\((?:file|leftFile|rightFile)\.path\);/g
        );
        expect(built).toHaveLength(4);
        expect(src).not.toMatch(/\b(?:fileUrl|leftFileUrl|rightFileUrl) = (?!MediaUrl\.toMediaUrl\()/);
    });
});
