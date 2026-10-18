// app-protocol.js
// The app's own scheme (G1 I1). The window loads app://media-viewer/index.html, and every request
// the page or its workers make on that origin is answered here: an app file from a fixed allowlist,
// or (under /@fs/) a media file the shared media-read rule authorizes (path-grants.js), served with
// byte ranges so video can seek. Everything else is a 404. App files carry the Content-Security-
// Policy as a response header, because a worker takes its policy from its own script's response.
// Pure CommonJS with no Electron import, so Vitest can load it; main.js registers the scheme.

const path = require('path');
const nodeFs = require('fs');
const { promisify } = require('util');
const { Readable } = require('stream');
const { asciiFold } = require('./path-grants');

const APP_SCHEME = 'app';
const APP_HOST = 'media-viewer';
const MEDIA_PREFIX = '/@fs/';

// Node's JS realpath, for the app root (main.js) and every app-file request alike. The native one
// resolves a subst or mapped drive to its target, so mixing the two would refuse every file.
const jsRealpath = promisify(nodeFs.realpath);

const APP_FILE_TYPES = Object.freeze({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
});

// What the page may load from the app folder: top-level HTML, CSS and JS, and the four trees it
// uses. Not the whole checkout, which also holds credentials, git data and local reports. Names
// are exact (no case fold), and no segment may start with a dot.
const TOP_LEVEL_FILE = /\.(?:html|css|js)$/;
const SERVED_TREES = Object.freeze([
    ['vendor', 'jxl-oxide-wasm'],
    ['vendor', 'lucide'],
    ['node_modules', '@vladmandic', 'face-api', 'dist'],
    ['node_modules', '@vladmandic', 'face-api', 'model'],
]);

function isServedAppPath(segments) {
    if (segments.length === 0 || segments.some((s) => s.startsWith('.'))) {
        return false;
    }
    if (segments.length === 1) {
        return TOP_LEVEL_FILE.test(segments[0]);
    }
    return SERVED_TREES.some((tree) => segments.length > tree.length && tree.every((name, i) => segments[i] === name));
}

// The decoded segments of an app-file path, or null: each one non-empty, not . or .., and holding
// no separator or NUL once decoded (an encoded %2F or %5C must not split a segment on disk).
function decodeAppPath(pathname) {
    const segments = [];
    for (const part of pathname.split('/').slice(1)) {
        let s;
        try {
            s = decodeURIComponent(part);
        } catch (_err) {
            return null;
        }
        if (s === '' || s === '.' || s === '..' || /[\\/\0]/.test(s)) {
            return null;
        }
        segments.push(s);
    }
    return segments;
}

// The one path a media URL names: the single segment after /@fs/, decoded (spec D6). A second
// segment or a malformed escape names nothing.
function decodeMediaPath(pathname) {
    if (!pathname.startsWith(MEDIA_PREFIX)) {
        return null;
    }
    const rest = pathname.slice(MEDIA_PREFIX.length);
    if (rest === '' || rest.includes('/')) {
        return null;
    }
    try {
        return decodeURIComponent(rest);
    } catch (_err) {
        return null;
    }
}

// One byte range (RFC 9110 § 14), or the whole file. A malformed or multi-range header is ignored,
// as HTTP allows; an unsatisfiable range is a 416.
function parseRange(header, size) {
    const m = typeof header === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
    if (!m || (m[1] === '' && m[2] === '')) {
        return { status: 200 };
    }
    let start;
    let end;
    if (m[1] === '') {
        const suffix = Number(m[2]);
        if (suffix === 0) {
            return { status: 416 };
        }
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(m[1]);
        if (m[2] !== '' && Number(m[2]) < start) {
            return { status: 416 };
        }
        end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || end < start) {
        return { status: 416 };
    }
    return { status: 206, start, end };
}

// The renderer has no network use: its files come from this scheme, and CLIP downloads run in the
// main process on Node's own fetch, which the session does not govern. main.js cancels every
// request this matches (G1 I1, spec D11).
function isBlockedEgress(url) {
    return /^(?:https?|wss?):/i.test(String(url));
}

function createAppProtocol({ appRoot, resolveMediaRead, getMimeType, csp = null, logger }) {
    let openStreams = 0;

    const refuse = (url, reason) => {
        logger.warn('app-protocol', `Refused ${String(url).slice(0, 200)}: ${reason}`);
        return new Response(null, { status: 404 });
    };

    // A media body, counted until its file closes: a cancelled request (a video released or seeked)
    // destroys the stream, which closes the handle.
    function openBody(file, start, end) {
        const stream = nodeFs.createReadStream(file, { start, end });
        openStreams += 1;
        stream.once('close', () => {
            openStreams -= 1;
        });
        return Readable.toWeb(stream);
    }

    async function serveAppFile(request, url) {
        const segments = decodeAppPath(url.pathname);
        if (!segments || !isServedAppPath(segments)) {
            return refuse(request.url, 'not an app file');
        }
        const joined = path.join(appRoot, ...segments);
        let real;
        try {
            real = await jsRealpath(joined);
        } catch (_err) {
            return refuse(request.url, 'no such file');
        }
        if (real !== joined) {
            return refuse(request.url, 'a link inside the app folder');
        }
        let body;
        try {
            body = await nodeFs.promises.readFile(joined);
        } catch (_err) {
            return refuse(request.url, 'not a readable file');
        }
        const ext = path.extname(joined);
        const headers = {
            'Content-Type': APP_FILE_TYPES[ext] ?? 'application/octet-stream',
            'Content-Length': String(body.length),
            'X-Content-Type-Options': 'nosniff',
        };
        if (csp) {
            headers['Content-Security-Policy'] = csp;
        }
        if (ext === '.html') {
            headers['X-DNS-Prefetch-Control'] = 'off';
        }
        return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
    }

    async function serveMedia(request, url) {
        const requested = decodeMediaPath(url.pathname);
        if (requested === null) {
            return refuse(request.url, 'malformed media path');
        }
        // The rule returns the resolved target, and that is the file read: the check and the read
        // concern the same file (spec § 4.3; the race that remains is spec § 11).
        const target = await resolveMediaRead(requested);
        if (target === null) {
            return refuse(request.url, 'not a granted media file');
        }
        let stat;
        try {
            stat = await nodeFs.promises.stat(target);
        } catch (_err) {
            return refuse(request.url, 'no such file');
        }
        if (!stat.isFile()) {
            return refuse(request.url, 'not a file');
        }
        const size = stat.size;
        const range = parseRange(request.headers.get('range'), size);
        // Media types only (the rule admits media files only), so a media response never runs as script.
        const headers = {
            'Content-Type': getMimeType(asciiFold(path.extname(target))),
            'X-Content-Type-Options': 'nosniff',
            'Accept-Ranges': 'bytes',
        };
        if (range.status === 416) {
            headers['Content-Range'] = `bytes */${size}`;
            return new Response(null, { status: 416, headers });
        }
        const start = range.status === 206 ? range.start : 0;
        const end = range.status === 206 ? range.end : size - 1;
        headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1);
        if (range.status === 206) {
            headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        }
        const body = request.method === 'HEAD' || size === 0 ? null : openBody(target, start, end);
        return new Response(body, { status: range.status, headers });
    }

    async function handle(request) {
        try {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                logger.warn('app-protocol', `Refused ${request.method} ${String(request.url).slice(0, 200)}`);
                return new Response(null, { status: 405 });
            }
            let url;
            try {
                url = new URL(request.url);
            } catch (_err) {
                return refuse(request.url, 'malformed URL');
            }
            if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
                return refuse(request.url, 'unknown host');
            }
            return url.pathname.startsWith(MEDIA_PREFIX)
                ? await serveMedia(request, url)
                : await serveAppFile(request, url);
        } catch (err) {
            logger.error('app-protocol', `Failed ${String(request?.url).slice(0, 200)}: ${err.message}`);
            return new Response(null, { status: 500 });
        }
    }

    return { handle, openStreams: () => openStreams };
}

module.exports = {
    createAppProtocol,
    decodeAppPath,
    decodeMediaPath,
    isServedAppPath,
    parseRange,
    isBlockedEgress,
    APP_SCHEME,
    APP_HOST,
    MEDIA_PREFIX,
};
