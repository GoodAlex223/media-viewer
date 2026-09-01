// Pre-commit docs-index guard: keeps `docs/README.md` honest in both directions.
//
// 1. MISSING — a permanent plan/spec file with no link in the index. "New documentation →
//    index in docs/README.md" is a documented recurring class that failed manually 7 times
//    (PRs #19/#23/#27/#28/#39/#43 plus two Weekly-Reviews run-cards) before this guard.
// 2. BROKEN — an index link whose target does not resolve. A presence-only check is not
//    enough: a file can be *mentioned* via a path it no longer lives at, which reads as
//    indexed while the link is dead (the `2025-12-29_video-fullscreen-toggle` row).
//
// `extractLinks`, `findUnindexed` and `findBrokenTargets` are pure and unit-tested. The CLI
// section is a thin fs wrapper: it walks the permanent directories, runs both checks, and
// sets the exit code. No runtime dependencies (matches check-secrets.js / check-e2e-needed.js).
//
// `docs/planning/plans/` is deliberately NOT presence-checked — it holds *transient* active
// plans, which would have to be indexed on creation and de-indexed on archive. Its rows are
// still covered by the broken-target check, so a stale Active-Plans row fails.

const path = require('path');

// Directories (relative to `docs/`) whose every `.md` file must be linked from docs/README.md.
const INDEXED_DIRS = ['archive/plans', 'superpowers/specs'];

const REFERENCE_DEF = /^\[([^\]]+)\]:\s+(\S+)/;
const INLINE_LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Normalize a link target for comparison: forward slashes, no `./` prefix, no `#anchor`.
 * @param {string} target
 * @returns {string}
 */
function normalizeTarget(target) {
    return String(target).split('#')[0].replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/**
 * Collect every repo-relative link target in a Markdown document, in source order.
 * Handles both reference-style definitions (`[Label]: path`, which must start the line) and
 * inline links (`[text](path)`). External URLs and pure anchors are dropped — only targets
 * that name a file in the tree are returned.
 * @param {string} markdown
 * @returns {Array<{label: string, target: string}>}
 */
function extractLinks(markdown) {
    if (typeof markdown !== 'string' || markdown === '') return [];
    const links = [];
    for (const raw of markdown.split('\n')) {
        const line = raw.replace(/\r$/, '');

        const def = line.match(REFERENCE_DEF);
        if (def) {
            const target = normalizeTarget(def[2]);
            if (target && !EXTERNAL.test(def[2])) {
                links.push({ label: def[1], target });
            }
            continue;
        }

        INLINE_LINK.lastIndex = 0;
        let m;
        while ((m = INLINE_LINK.exec(line)) !== null) {
            if (EXTERNAL.test(m[2])) continue;
            const target = normalizeTarget(m[2]);
            if (target) links.push({ label: m[1], target });
        }
    }
    return links;
}

/**
 * Which of `relPaths` (relative to `docs/`) is targeted by no link. Comparison is on the
 * FULL relative path, not the basename — a file mentioned only via a path it does not live
 * at is not indexed, it is a dead link plus a missing row.
 * @param {Array<{label: string, target: string}>} links
 * @param {string[]} relPaths
 * @returns {string[]}
 */
function findUnindexed(links, relPaths) {
    const targets = new Set((links || []).map((l) => normalizeTarget(l.target)));
    return (relPaths || []).filter((p) => !targets.has(normalizeTarget(p)));
}

/**
 * Which links point at a target that does not exist. `exists` is injected so the check is
 * pure and testable; the CLI passes an fs-backed probe rooted at `docs/`.
 * @param {Array<{label: string, target: string}>} links
 * @param {(target: string) => boolean} exists
 * @returns {Array<{label: string, target: string}>}
 */
function findBrokenTargets(links, exists) {
    return (links || []).filter((l) => !exists(normalizeTarget(l.target)));
}

module.exports = { extractLinks, findUnindexed, findBrokenTargets, normalizeTarget, INDEXED_DIRS };

// --- CLI: verify docs/README.md indexes every permanent plan/spec and has no dead links ---
if (require.main === module) {
    const fs = require('fs');

    const docsDir = path.join(__dirname, '..', 'docs');
    const readmePath = path.join(docsDir, 'README.md');

    let readme;
    try {
        readme = fs.readFileSync(readmePath, 'utf8');
    } catch (err) {
        console.error(`check-docs-index: failed to read ${readmePath}: ${err.message}`);
        process.exit(1);
    }

    const relPaths = [];
    for (const dir of INDEXED_DIRS) {
        const abs = path.join(docsDir, dir);
        let entries;
        try {
            entries = fs.readdirSync(abs);
        } catch (_err) {
            // A directory that does not exist yet has nothing to index — not an error.
            continue;
        }
        for (const name of entries.sort()) {
            if (!name.endsWith('.md')) continue;
            if (name.toLowerCase() === 'readme.md') continue;
            relPaths.push(`${dir}/${name}`);
        }
    }

    const links = extractLinks(readme);
    const missing = findUnindexed(links, relPaths);
    const broken = findBrokenTargets(links, (t) => {
        // Targets are relative to docs/; a directory target (e.g. `archive/plans/`) resolves too.
        try {
            return fs.existsSync(path.join(docsDir, t));
        } catch (_err) {
            return false;
        }
    });

    if (missing.length === 0 && broken.length === 0) {
        process.exit(0);
    }

    console.error('\n⛔ docs/README.md index is out of date:\n');
    if (missing.length > 0) {
        console.error(`  MISSING (${missing.length}) — no link in docs/README.md:`);
        for (const p of missing) {
            console.error(`    docs/${p}`);
        }
        console.error('');
    }
    if (broken.length > 0) {
        console.error(`  BROKEN (${broken.length}) — link target does not exist:`);
        for (const b of broken) {
            console.error(`    [${b.label}] -> ${b.target}`);
        }
        console.error('');
    }
    console.error(
        'Add a row + link for each missing file, and repoint or remove each dead link.\n' +
            'If this is a genuine false positive, bypass with: git commit --no-verify\n'
    );
    process.exit(1);
}
