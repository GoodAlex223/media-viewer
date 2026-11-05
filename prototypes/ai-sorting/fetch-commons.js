'use strict';
// Throwaway prototype (AI sorting research, 2026-10-22). Builds the labelled benchmark set from
// Wikimedia Commons: CC0 photographs only, chosen by the structured-data statements "depicts" (P180),
// "copyright licence" (P275 = CC0) and "captured with" (P4082, a camera: without it the set is mostly museum
// reproductions, e.g. a teapot "depicting" a flower), and no "collection" (P195: museum objects photographed with a
// camera, such as a carved frame "depicting" horses), then re-checked against each file's own licence metadata.
// Downloads 500-px thumbnails, one request at a time, with a generic User-Agent. Uploads nothing.
//
// Usage: node fetch-commons.js <outDir> [perCategory]
//   writes <outDir>/img/<category>/<pageid>.jpg and <outDir>/manifest.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (compatible; research-bot/1.0)';
const API = 'https://commons.wikimedia.org/w/api.php';
const CC0 = 'Q6938433';
const HUMAN = 'Q5';
const CATEGORIES = [
    ['cat', 'Q146'],
    ['dog', 'Q144'],
    ['horse', 'Q726'],
    ['bird', 'Q5113'],
    ['insect', 'Q1390'],
    ['flower', 'Q506'],
    ['food', 'Q2095'],
    ['car', 'Q1420'],
    ['train', 'Q870'],
    ['aircraft', 'Q11436'],
    ['ship', 'Q11446'],
    ['church', 'Q16970'],
    ['lighthouse', 'Q39715'],
    ['bridge', 'Q12280'],
    ['mountain', 'Q8502'],
    ['waterfall', 'Q34038'],
];
const MAX_PER_ARTIST = 2;
const API_GAP_MS = 4000;
const DOWNLOAD_GAP_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function politeFetch(url, gapMs) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        await sleep(gapMs);
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (res.status === 429 || res.status >= 500) {
            const wait = 30000 * attempt;
            console.log(`  HTTP ${res.status}, backing off ${wait / 1000}s`);
            await sleep(wait);
            continue;
        }
        return res;
    }
    throw new Error(`gave up on ${url}`);
}

function plainText(html) {
    return String(html || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function searchCategory(qid, offset) {
    const others = CATEGORIES.map(([, q]) => q).filter((q) => q !== qid);
    const query = [
        `haswbstatement:P180=${qid}`,
        `haswbstatement:P275=${CC0}`,
        'haswbstatement:P4082',
        '-haswbstatement:P195',
        'filemime:image/jpeg',
        ...[...others, HUMAN].map((q) => `-haswbstatement:P180=${q}`),
    ].join(' ');
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        generator: 'search',
        gsrnamespace: '6',
        gsrsearch: query,
        gsrlimit: '50',
        gsroffset: String(offset),
        gsrsort: 'random',
        prop: 'imageinfo',
        iiprop: 'url|size|mime|sha1|extmetadata',
        iiurlwidth: '500',
        iiextmetadatafilter: 'License|LicenseShortName|Artist',
    });
    const res = await politeFetch(`${API}?${params}`, API_GAP_MS);
    const json = await res.json();
    if (json.error) {
        throw new Error(`API error: ${json.error.info}`);
    }
    return (json.query && json.query.pages) || [];
}

async function main() {
    const outDir = path.resolve(process.argv[2] || '.');
    const perCategory = Number(process.argv[3] || 25);
    const manifest = {
        source: 'Wikimedia Commons',
        licenceRule: 'P275=CC0, P4082 camera present, no P195 collection, and file metadata License cc0|pd',
        items: [],
    };
    const seenSha = new Set();

    for (const [category, qid] of CATEGORIES) {
        // Up to four pages of 50 from one random order (the API fills imageinfo for at most 50 pages per
        // request, and repeats the same random order for the same query, so the pages come by offset).
        const pages = [];
        const seenPages = new Set();
        for (let draw = 0; draw < 4 && pages.length < perCategory * 6; draw++) {
            for (const page of await searchCategory(qid, draw * 50)) {
                if (!seenPages.has(page.pageid)) {
                    seenPages.add(page.pageid);
                    pages.push(page);
                }
            }
        }
        const perArtist = new Map();
        const picked = [];
        for (const page of pages) {
            const info = page.imageinfo && page.imageinfo[0];
            if (!info || info.mime !== 'image/jpeg' || !info.thumburl) {
                continue;
            }
            const meta = info.extmetadata || {};
            const licence = String((meta.License && meta.License.value) || '').toLowerCase();
            if (licence !== 'cc0' && licence !== 'pd') {
                continue;
            }
            const ratio = info.width / info.height;
            if (Math.min(info.width, info.height) < 400 || ratio < 0.4 || ratio > 2.5) {
                continue;
            }
            if (seenSha.has(info.sha1)) {
                continue;
            }
            const artist = plainText(meta.Artist && meta.Artist.value) || 'unknown';
            if ((perArtist.get(artist) || 0) >= MAX_PER_ARTIST) {
                continue;
            }
            perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
            seenSha.add(info.sha1);
            picked.push({
                page,
                info,
                licence,
                artist,
                licenceShort: meta.LicenseShortName && meta.LicenseShortName.value,
            });
            if (picked.length >= perCategory) {
                break;
            }
        }
        console.log(`${category}: ${pages.length} hits, ${picked.length} picked`);

        const dir = path.join(outDir, 'img', category);
        fs.mkdirSync(dir, { recursive: true });
        for (const { page, info, licence, artist, licenceShort } of picked) {
            const file = path.join(dir, `${page.pageid}.jpg`);
            if (!fs.existsSync(file)) {
                const res = await politeFetch(info.thumburl, DOWNLOAD_GAP_MS);
                const type = res.headers.get('content-type') || '';
                if (!res.ok || !type.startsWith('image/jpeg')) {
                    console.log(`  skip ${page.title}: HTTP ${res.status} ${type}`);
                    continue;
                }
                fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
            }
            const bytes = fs.readFileSync(file);
            manifest.items.push({
                category,
                qid,
                file: path.relative(outDir, file).split(path.sep).join('/'),
                title: page.title,
                pageid: page.pageid,
                descriptionUrl: info.descriptionurl,
                thumbUrl: info.thumburl,
                originalWidth: info.width,
                originalHeight: info.height,
                licence,
                licenceShort,
                artist,
                sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            });
        }
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    }
    console.log(`done: ${manifest.items.length} images`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
