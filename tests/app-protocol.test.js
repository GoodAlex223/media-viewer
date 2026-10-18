import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'fs/promises';
import fs from 'fs';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join, sep } from 'path';

const require = createRequire(import.meta.url);
const {
    createAppProtocol,
    decodeAppPath,
    decodeMediaPath,
    isServedAppPath,
    parseRange,
    APP_HOST,
} = require('../app-protocol.js');
const { createGrantStore, createMediaReadRule } = require('../path-grants.js');
const { isMediaFile, getMimeType } = require('../media-formats.js');

const jsRealpath = promisify(fs.realpath);
const CSP = "default-src 'none'";
const ORIGIN = `app://${APP_HOST}`;
const req = (url, { method = 'GET', range } = {}) => ({
    url,
    method,
    headers: new Headers(range ? { range } : {}),
});
const mediaUrl = (p) => `${ORIGIN}/@fs/${encodeURIComponent(p)}`;

let tmp;
let appRoot;
let media;
let elsewhere;
let deps;
let proto;
let logger;
const BIG = 1024 * 1024 + 17; // a size no chunk boundary divides

beforeAll(async () => {
    tmp = await jsRealpath(await mkdtemp(join(tmpdir(), 'mv-app-protocol-')));
    appRoot = join(tmp, 'app');
    media = join(tmp, 'media');
    elsewhere = join(tmp, 'elsewhere');
    const files = {
        'index.html': '<!doctype html><title>t</title>',
        'migrate.html': '<!doctype html>',
        'styles.css': 'body{}',
        'media-viewer.js': 'export {};',
        'package.json': '{}',
        '.mcp.json': '{}',
        'CLAUDE.md': '# x',
        'eslint.config.mjs': 'export default [];',
        'docs/x.md': '# x',
        'tests/a.test.js': '',
        '.git/HEAD': 'ref: x',
        'CLAUDE-SECURITY-x/r.md': '# x',
        'vendor/lucide/lucide.min.js': 'var lucide;',
        'vendor/jxl-oxide-wasm/jxl_oxide_wasm_bg.wasm': 'wasm',
        'vendor/other/y.js': '',
        'node_modules/@vladmandic/face-api/dist/face-api.js': '',
        'node_modules/@vladmandic/face-api/model/m.json': '{}',
        'node_modules/@vladmandic/face-api/package.json': '{}',
        'node_modules/other/z.js': '',
    };
    for (const [rel, body] of Object.entries(files)) {
        await mkdir(join(appRoot, rel, '..'), { recursive: true });
        await writeFile(join(appRoot, rel), body);
    }
    await mkdir(media);
    await mkdir(elsewhere);
    await writeFile(join(media, 'a.png'), 'png-bytes');
    await writeFile(join(media, 'IMG_1.JPG'), 'jpg-bytes');
    await writeFile(join(media, 'notes.txt'), 'text');
    await writeFile(join(media, 'empty.mp4'), '');
    await writeFile(join(media, 'big.mp4'), Buffer.alloc(BIG, 7));
    await writeFile(join(elsewhere, 'real.png'), 'png');
    await writeFile(join(elsewhere, 'id_rsa'), 'key');
    const grants = createGrantStore({ storePath: join(tmp, 'grants.json') });
    await grants.grant(media);
    logger = { warn: vi.fn(), error: vi.fn() };
    deps = { appRoot, resolveMediaRead: createMediaReadRule({ grants, isMediaFile }), getMimeType, csp: CSP, logger };
    proto = createAppProtocol(deps);
});

afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
});

const plant = async (ctx, target, link) => {
    try {
        await symlink(target, link, 'file');
    } catch (err) {
        if (err.code === 'EPERM') ctx.skip(); // Windows without Developer Mode
        throw err;
    }
};

describe('routing', () => {
    it('answers GET and HEAD only', async () => {
        expect((await proto.handle(req(`${ORIGIN}/index.html`, { method: 'POST' }))).status).toBe(405);
        expect((await proto.handle(req(`${ORIGIN}/index.html`, { method: 'HEAD' }))).status).toBe(200);
    });

    it('answers its own host only', async () => {
        expect((await proto.handle(req('app://other/index.html'))).status).toBe(404);
        expect((await proto.handle(req('app:index.html'))).status).toBe(404);
    });

    it('logs each refusal with the URL truncated', async () => {
        logger.warn.mockClear();
        await proto.handle(req(`${ORIGIN}/${'x'.repeat(300)}.md`));
        const line = logger.warn.mock.calls.at(-1)[1];
        expect(logger.warn.mock.calls.at(-1)[0]).toBe('app-protocol');
        expect(line.length).toBeLessThan(260);
    });
});

describe('app files', () => {
    it.each([
        'index.html',
        'migrate.html',
        'styles.css',
        'media-viewer.js',
        'vendor/lucide/lucide.min.js',
        'vendor/jxl-oxide-wasm/jxl_oxide_wasm_bg.wasm',
        'node_modules/@vladmandic/face-api/dist/face-api.js',
        'node_modules/@vladmandic/face-api/model/m.json',
    ])('serves %s', async (rel) => {
        expect((await proto.handle(req(`${ORIGIN}/${rel}`))).status).toBe(200);
    });

    it.each([
        '.mcp.json',
        '.git/HEAD',
        'package.json',
        'CLAUDE.md',
        'eslint.config.mjs',
        'docs/x.md',
        'tests/a.test.js',
        'CLAUDE-SECURITY-x/r.md',
        'vendor/other/y.js',
        'node_modules/other/z.js',
        'node_modules/@vladmandic/face-api/package.json',
        'vendor/lucide',
        '',
        'Index.HTML',
    ])('refuses %j', async (rel) => {
        expect((await proto.handle(req(`${ORIGIN}/${rel}`))).status).toBe(404);
    });

    it.each([
        'vendor/lucide/%2e%2e/%2e%2e/package.json',
        'vendor/lucide/..%5C..%5Cpackage.json',
        'vendor/lucide/%2e%2e%2f%2e%2e%2fpackage.json',
        'index.html%00.js',
        'vendor//lucide/lucide.min.js',
        'vendor/lucide/%E0%A4%A.js',
    ])('refuses the traversal or malformed path %s', async (rel) => {
        expect((await proto.handle(req(`${ORIGIN}/${rel}`))).status).toBe(404);
    });

    it('refuses a file reached through a junction inside the app folder', async () => {
        const outsideTree = join(tmp, 'outside-tree');
        await mkdir(outsideTree, { recursive: true });
        await writeFile(join(outsideTree, 'x.js'), '');
        await symlink(
            outsideTree,
            join(appRoot, 'vendor', 'lucide', 'linked'),
            process.platform === 'win32' ? 'junction' : 'dir'
        );
        expect((await proto.handle(req(`${ORIGIN}/vendor/lucide/linked/x.js`))).status).toBe(404);
    });

    it('sends the type, nosniff and the policy header, plus prefetch-off on HTML', async () => {
        const html = await proto.handle(req(`${ORIGIN}/index.html`));
        expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(html.headers.get('x-content-type-options')).toBe('nosniff');
        expect(html.headers.get('content-security-policy')).toBe(CSP);
        expect(html.headers.get('x-dns-prefetch-control')).toBe('off');
        const js = await proto.handle(req(`${ORIGIN}/media-viewer.js`));
        expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
        expect(js.headers.get('content-security-policy')).toBe(CSP);
        expect(js.headers.get('x-dns-prefetch-control')).toBeNull();
        const wasm = await proto.handle(req(`${ORIGIN}/vendor/jxl-oxide-wasm/jxl_oxide_wasm_bg.wasm`));
        expect(wasm.headers.get('content-type')).toBe('application/wasm');
    });

    it('answers HEAD with the headers and no body', async () => {
        const res = await proto.handle(req(`${ORIGIN}/styles.css`, { method: 'HEAD' }));
        expect(res.headers.get('content-length')).toBe('6');
        expect(await res.text()).toBe('');
    });

    // Review Focus 2: both realpaths are Node's JS one, so a subst or mapped drive (where the native
    // one returns the target) still serves its files. Proven here by the root being a JS realpath
    // and every file above being served; this pins that the native call is not reintroduced.
    it('compares the JS realpath of the root with the JS realpath of each file', async () => {
        expect(await jsRealpath(appRoot)).toBe(appRoot);
        const src = fs.readFileSync(new URL('../app-protocol.js', import.meta.url), 'utf8');
        expect(src).not.toMatch(/promises\.realpath|realpath\.native|realpathSync\.native/);
    });
});

describe('the media door', () => {
    it('serves granted media with its media type, nosniff and byte ranges', async () => {
        const res = await proto.handle(req(mediaUrl(join(media, 'a.png'))));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/png');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('accept-ranges')).toBe('bytes');
        expect(res.headers.get('content-security-policy')).toBeNull();
        expect(await res.text()).toBe('png-bytes');
    });

    it('serves an upper-case extension with the right type', async () => {
        const res = await proto.handle(req(mediaUrl(join(media, 'IMG_1.JPG'))));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/jpeg');
        await res.body.cancel(); // every media test closes its body: the stream tests count open files
    });

    it('refuses media outside every grant, and a non-media file inside one', async () => {
        expect((await proto.handle(req(mediaUrl(join(elsewhere, 'real.png'))))).status).toBe(404);
        expect((await proto.handle(req(mediaUrl(join(media, 'notes.txt'))))).status).toBe(404);
    });

    it('serves the target of a link from a granted folder to media elsewhere', async (ctx) => {
        await plant(ctx, join(elsewhere, 'real.png'), join(media, 'link-media.png'));
        const res = await proto.handle(req(mediaUrl(join(media, 'link-media.png'))));
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('png');
    });

    it('refuses a link to a non-media file, elsewhere or inside the grant (D12)', async (ctx) => {
        await plant(ctx, join(elsewhere, 'id_rsa'), join(media, 'key.png'));
        await plant(ctx, join(media, 'notes.txt'), join(media, 'notes-link.png'));
        expect((await proto.handle(req(mediaUrl(join(media, 'key.png'))))).status).toBe(404);
        expect((await proto.handle(req(mediaUrl(join(media, 'notes-link.png'))))).status).toBe(404);
    });

    it('refuses more than one segment, and a malformed escape', async () => {
        expect((await proto.handle(req(`${ORIGIN}/@fs/a/b.png`))).status).toBe(404);
        expect((await proto.handle(req(`${ORIGIN}/@fs/%E0%A4%A.png`))).status).toBe(404);
        expect((await proto.handle(req(`${ORIGIN}/@fs/`))).status).toBe(404);
    });

    it.each([
        ['bytes=0-', 206, 0, BIG - 1],
        ['bytes=0-99', 206, 0, 99],
        ['bytes=500000-', 206, 500000, BIG - 1],
        ['bytes=-100', 206, BIG - 100, BIG - 1],
        ['bytes=0-99999999', 206, 0, BIG - 1],
    ])('answers %s with %i and the matching Content-Range and length', async (range, status, start, end) => {
        const res = await proto.handle(req(mediaUrl(join(media, 'big.mp4')), { range }));
        expect(res.status).toBe(status);
        expect(res.headers.get('content-range')).toBe(`bytes ${start}-${end}/${BIG}`);
        expect(res.headers.get('content-length')).toBe(String(end - start + 1));
        expect((await res.arrayBuffer()).byteLength).toBe(end - start + 1);
    });

    it.each(['bytes=99999999-', 'bytes=10-5', 'bytes=-0'])('answers the unsatisfiable %s with 416', async (range) => {
        const res = await proto.handle(req(mediaUrl(join(media, 'big.mp4')), { range }));
        expect(res.status).toBe(416);
        expect(res.headers.get('content-range')).toBe(`bytes */${BIG}`);
    });

    it.each(['bytes=0-1,5-6', 'items=0-1', 'bytes=abc', 'bytes=-'])(
        'ignores the header %s and sends 200',
        async (range) => {
            const res = await proto.handle(req(mediaUrl(join(media, 'big.mp4')), { range }));
            expect(res.status).toBe(200);
            expect(res.headers.get('content-length')).toBe(String(BIG));
            await res.body.cancel();
        }
    );

    it('serves an empty file as 200 with no body', async () => {
        const res = await proto.handle(req(mediaUrl(join(media, 'empty.mp4'))));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-length')).toBe('0');
    });

    // The stream tests use their own instance, so its counter starts at 0 whatever the tests above
    // left open.
    it('answers HEAD on media with the headers and opens no stream', async () => {
        const fresh = createAppProtocol(deps);
        const res = await fresh.handle(req(mediaUrl(join(media, 'big.mp4')), { method: 'HEAD' }));
        expect(res.headers.get('content-length')).toBe(String(BIG));
        expect(fresh.openStreams()).toBe(0);
    });

    // Review Focus 5: a cancelled request (a video released or seeked) must close its file handle.
    it('closes the read stream when the response body is cancelled, and when it is read to the end', async () => {
        const fresh = createAppProtocol(deps);
        const res = await fresh.handle(req(mediaUrl(join(media, 'big.mp4'))));
        expect(fresh.openStreams()).toBe(1);
        await res.body.cancel();
        await expect.poll(() => fresh.openStreams()).toBe(0);
        const part = await fresh.handle(req(mediaUrl(join(media, 'big.mp4')), { range: 'bytes=0-99' }));
        expect(fresh.openStreams()).toBe(1);
        await part.arrayBuffer();
        await expect.poll(() => fresh.openStreams()).toBe(0);
    });
});

describe('pure helpers', () => {
    it('decodeMediaPath round-trips every path shape in one segment', () => {
        for (const p of [
            'C:\\Users\\a\\x.jpg',
            '\\\\server\\share\\x.jpg',
            '/home/a/x.jpg',
            'C:\\a b\\#1 %20 [y].png',
            'D:\\Фото\\中文\\é.webp',
            `C:${sep}x${sep}%2F%5C.png`,
        ]) {
            expect(decodeMediaPath(new URL(mediaUrl(p)).pathname)).toBe(p);
        }
    });

    it('decodeAppPath refuses empty, dot and separator-bearing segments', () => {
        expect(decodeAppPath('/a/b.js')).toEqual(['a', 'b.js']);
        expect(decodeAppPath('/a//b.js')).toBeNull();
        expect(decodeAppPath('/a/%2E%2E/b.js')).toBeNull();
        expect(decodeAppPath('/a%2Fb.js')).toBeNull();
        expect(decodeAppPath('/a%5Cb.js')).toBeNull();
        expect(decodeAppPath('/a%00.js')).toBeNull();
    });

    it('isServedAppPath matches exact names only', () => {
        expect(isServedAppPath(['index.html'])).toBe(true);
        expect(isServedAppPath(['vendor', 'lucide'])).toBe(false);
        expect(isServedAppPath(['Vendor', 'lucide', 'x.js'])).toBe(false);
        expect(isServedAppPath(['vendor', 'lucide', '.hidden.js'])).toBe(false);
    });

    it('parseRange covers the empty file', () => {
        expect(parseRange(undefined, 0)).toEqual({ status: 200 });
        expect(parseRange('bytes=0-', 0)).toEqual({ status: 416 });
        expect(parseRange('bytes=-5', 0)).toEqual({ status: 416 });
    });
});
