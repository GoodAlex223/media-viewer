'use strict';
// Second benchmark set: a "quality" taste. For each subject, CC0 JPEGs that Commons reviewers promoted to
// Quality Images (incategory:Quality_images; the QI rules require the uploader's own photograph) versus the
// same number of CC0 photographs (P4082 "captured with" a camera) of the same subject that were not promoted.
// Liked = Quality Image, so a model must learn image quality within a subject rather than the subject. Same
// licence rule, politeness and User-Agent as fetch-commons.js; files already in the main set are skipped.
//
// Usage: node fetch-quality.js <dataDir> [perSide]   -> <dataDir>/quality/<subject>/*.jpg + quality.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJson, writeJson, UA } = require('./common');

const API = 'https://commons.wikimedia.org/w/api.php';
const CC0 = 'Q6938433';
const SUBJECTS = [
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function politeFetch(url, gapMs) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        await sleep(gapMs);
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (res.status === 429 || res.status >= 500) {
            console.log(`  HTTP ${res.status}, backing off ${30 * attempt}s`);
            await sleep(30000 * attempt);
            continue;
        }
        return res;
    }
    throw new Error(`gave up on ${url}`);
}

async function search(qid, quality) {
    const query = [
        `haswbstatement:P180=${qid}`,
        `haswbstatement:P275=${CC0}`,
        'filemime:image/jpeg',
        '-haswbstatement:P195',
        quality ? 'incategory:Quality_images' : 'haswbstatement:P4082 -incategory:Quality_images',
    ].join(' ');
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        generator: 'search',
        gsrnamespace: '6',
        gsrsearch: query,
        gsrlimit: '50',
        gsrsort: 'random',
        prop: 'imageinfo',
        iiprop: 'url|size|mime|sha1|extmetadata',
        iiurlwidth: '500',
        iiextmetadatafilter: 'License|LicenseShortName|Artist',
    });
    const json = await (await politeFetch(`${API}?${params}`, 4000)).json();
    if (json.error) {
        throw new Error(json.error.info);
    }
    return (json.query && json.query.pages) || [];
}

async function main() {
    const dataDir = path.resolve(process.argv[2]);
    const perSide = Number(process.argv[3] || 8);
    const seenTitles = new Set(readJson(path.join(dataDir, 'manifest.json')).items.map((it) => it.title));
    const seenSha = new Set();
    const out = {
        source: 'Wikimedia Commons',
        rule: 'P275=CC0, file License cc0|pd; liked = in Category:Quality images',
        items: [],
    };
    for (const [subject, qid] of SUBJECTS) {
        let qiTaken = 0;
        for (const quality of [true, false]) {
            const pages = await search(qid, quality);
            const perArtist = new Map();
            // Balanced per subject: as many ordinary photos as Quality Images, so the subject says nothing.
            const target = quality ? perSide : qiTaken;
            let taken = 0;
            for (const page of pages) {
                if (taken >= target) {
                    break;
                }
                const info = page.imageinfo && page.imageinfo[0];
                const meta = (info && info.extmetadata) || {};
                const licence = String((meta.License && meta.License.value) || '').toLowerCase();
                if (!info || info.mime !== 'image/jpeg' || !info.thumburl || (licence !== 'cc0' && licence !== 'pd')) {
                    continue;
                }
                const ratio = info.width / info.height;
                if (
                    Math.min(info.width, info.height) < 400 ||
                    ratio < 0.4 ||
                    ratio > 2.5 ||
                    seenSha.has(info.sha1) ||
                    seenTitles.has(page.title)
                ) {
                    continue;
                }
                const artist = String((meta.Artist && meta.Artist.value) || 'unknown')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                if ((perArtist.get(artist) || 0) >= 2) {
                    continue;
                }
                const res = await politeFetch(info.thumburl, 1200);
                if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/jpeg')) {
                    continue;
                }
                const bytes = Buffer.from(await res.arrayBuffer());
                const rel = `quality/${subject}/${quality ? 'qi' : 'ord'}-${page.pageid}.jpg`;
                fs.mkdirSync(path.dirname(path.join(dataDir, rel)), { recursive: true });
                fs.writeFileSync(path.join(dataDir, rel), bytes);
                perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
                seenSha.add(info.sha1);
                taken++;
                out.items.push({
                    file: rel,
                    subject,
                    qualityImage: quality,
                    title: page.title,
                    descriptionUrl: info.descriptionurl,
                    thumbUrl: info.thumburl,
                    licence,
                    licenceShort: meta.LicenseShortName && meta.LicenseShortName.value,
                    artist,
                    sha1: info.sha1,
                    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
                });
            }
            if (quality) {
                qiTaken = taken;
            }
            console.log(`${subject} ${quality ? 'QI' : 'ordinary'}: ${taken}`);
            writeJson(path.join(dataDir, 'quality.json'), out);
        }
    }
    console.log(`done: ${out.items.length} images`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
