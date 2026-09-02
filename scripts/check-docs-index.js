// Pre-commit docs-index guard: keeps `docs/README.md` honest in both directions.
//
// 1. MISSING — a permanent plan/spec file with no link in the index. "New documentation →
//    index in docs/README.md" is a documented recurring class, filed and scored on the PRs
//    listed in BACKLOG 🟤 [2026-08-27] plus two Weekly-Reviews run-cards, before this guard.
// 2. BROKEN — an index link whose target does not resolve. A presence-only check is not
//    enough: a file can be *mentioned* via a path it no longer lives at, which reads as
//    indexed while the link is dead (the `2025-12-29_video-fullscreen-toggle` row).
//
// SCOPE: the guard reads the **git index**, not the working tree, because `git commit`
// commits the index. Reading the worktree made the guard miss its own headline case — stage
// a new plan, forget to `git add` the README, and the commit lands an unindexed plan with the
// guard green. That is not exotic here: the repo's own rule is to stage docs by explicit path
// rather than `git add -A`, which makes partial staging the normal path. Both sibling scripts
// scope themselves to git state the same way (check-secrets.js reads `git diff --cached`,
// check-e2e-needed.js the push range). Pass `--worktree` to check the working tree instead —
// useful while actively editing the index, not what the hook runs.
//
// FAIL-SAFE DIRECTION: toward blocking. Any uncertainty — git unavailable, a directory that
// cannot be read — exits non-zero rather than reporting a clean tree, mirroring
// check-secrets.js (which exits 1 when it cannot read the staged diff) and the pre-push
// gate's `018f0d2` fix. A silent pass is indistinguishable from a real pass, and this guard
// exists precisely because the silent version of this check kept passing.
//
// `stripCode`, `extractLinks`, `selectIndexedFiles`, `findUnindexed` and `findBrokenTargets`
// are pure and unit-tested. No runtime dependencies (matches the other two scripts).
//
// `docs/planning/plans/` is deliberately NOT presence-checked — it holds *transient* active
// plans, which would have to be indexed on creation and de-indexed on archive. Its rows are
// still covered by the broken-target check, so a stale Active-Plans row fails.

const path = require('path');

// Directories (relative to `docs/`) whose every `.md` file must be linked from docs/README.md.
const INDEXED_DIRS = ['archive/plans', 'superpowers/specs'];

const REFERENCE_DEF = /^\[([^\]]+)\]:\s*(<[^>]*>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/;
// Label may contain one level of nested brackets; target may be <bracketed> and carry a title.
const INLINE_LINK = /\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * Blank out fenced code blocks and inline code spans so their contents are never parsed as
 * links. Both directions matter: a fenced example produces a false BROKEN, and — worse for
 * this guard's purpose — a plan "indexed" only by an illustrative snippet would otherwise
 * pass. An unterminated fence swallows the rest of the document, which is the safe way round.
 * @param {string} markdown
 * @returns {string}
 */
function stripCode(markdown) {
    if (typeof markdown !== 'string' || markdown === '') return '';
    const out = [];
    let fence = null;
    for (const raw of markdown.split('\n')) {
        const line = raw.replace(/\r$/, '');
        const m = line.match(FENCE);
        if (fence) {
            if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
            out.push('');
            continue;
        }
        if (m) {
            fence = m[1];
            out.push('');
            continue;
        }
        // Inline code spans: longest runs first so ``a`b`` is consumed as one span.
        out.push(line.replace(/(`+)(?:(?!\1)[\s\S])*\1/g, ''));
    }
    return out.join('\n');
}

/**
 * Normalize a link target for comparison: forward slashes, no `./` prefix, no `#anchor`,
 * no surrounding angle brackets.
 * @param {string} target
 * @returns {string}
 */
function normalizeTarget(target) {
    return String(target).replace(/^<|>$/g, '').split('#')[0].replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/**
 * Collect every repo-relative link target in a Markdown document, in source order. Handles
 * reference-style definitions (`[Label]: path`, which must start the line) and inline links
 * (`[text](path)`), each optionally carrying a title. External URLs and pure anchors are
 * dropped — only targets that name a file in the tree are returned.
 * @param {string} markdown
 * @returns {Array<{label: string, target: string}>}
 */
function extractLinks(markdown) {
    if (typeof markdown !== 'string' || markdown === '') return [];
    const links = [];
    for (const line of stripCode(markdown).split('\n')) {
        const def = line.match(REFERENCE_DEF);
        if (def) {
            const target = normalizeTarget(def[2]);
            if (target && !EXTERNAL.test(target)) {
                links.push({ label: def[1], target });
            }
            continue;
        }

        INLINE_LINK.lastIndex = 0;
        let m;
        while ((m = INLINE_LINK.exec(line)) !== null) {
            const target = normalizeTarget(m[2]);
            if (target && !EXTERNAL.test(target)) links.push({ label: m[1], target });
        }
    }
    return links;
}

/**
 * Pick the files that must be indexed out of a list of tracked repo paths: `.md` files sitting
 * directly in one of `indexedDirs` under `docs/`, excluding each directory's own README.
 * Returned docs-relative, so they compare directly against link targets.
 * @param {string[]} trackedPaths repo-relative paths (e.g. from `git ls-files`)
 * @param {string[]} indexedDirs docs-relative directories
 * @returns {string[]}
 */
function selectIndexedFiles(trackedPaths, indexedDirs) {
    const out = [];
    for (const raw of trackedPaths || []) {
        const p = String(raw).replace(/\\/g, '/').trim();
        if (!p.startsWith('docs/')) continue;
        const rel = p.slice('docs/'.length);
        const slash = rel.lastIndexOf('/');
        if (slash === -1) continue;
        const dir = rel.slice(0, slash);
        const name = rel.slice(slash + 1);
        if (!indexedDirs.includes(dir)) continue;
        if (!name.endsWith('.md')) continue;
        if (name.toLowerCase() === 'readme.md') continue;
        out.push(rel);
    }
    return out;
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
 * pure and testable; the CLI passes an index-backed or fs-backed probe.
 * @param {Array<{label: string, target: string}>} links
 * @param {(target: string) => boolean} exists
 * @returns {Array<{label: string, target: string}>}
 */
function findBrokenTargets(links, exists) {
    return (links || []).filter((l) => !exists(normalizeTarget(l.target)));
}

module.exports = {
    stripCode,
    extractLinks,
    selectIndexedFiles,
    findUnindexed,
    findBrokenTargets,
    normalizeTarget,
    INDEXED_DIRS,
};

// --- CLI: verify docs/README.md indexes every permanent plan/spec and has no dead links ---
if (require.main === module) {
    const fs = require('fs');
    const { execFileSync } = require('child_process');

    const repoRoot = path.join(__dirname, '..');
    const docsDir = path.join(repoRoot, 'docs');
    const useWorktree = process.argv.includes('--worktree');

    // Any uncertainty blocks the commit; a silent pass is what this guard exists to prevent.
    const bail = (msg) => {
        console.error(`check-docs-index: ${msg}`);
        console.error('Blocking the commit rather than reporting a clean index it could not verify.');
        process.exit(1);
    };

    const git = (args, what) => {
        try {
            return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        } catch (err) {
            return bail(`could not ${what}: ${err.message}`);
        }
    };

    let readme;
    let relPaths;
    let exists;

    if (useWorktree) {
        try {
            readme = fs.readFileSync(path.join(docsDir, 'README.md'), 'utf8');
        } catch (err) {
            bail(`failed to read docs/README.md: ${err.message}`);
        }
        relPaths = [];
        for (const dir of INDEXED_DIRS) {
            let entries;
            try {
                entries = fs.readdirSync(path.join(docsDir, dir));
            } catch (err) {
                // Only "the directory is not there yet" is benign. Every other errno —
                // EACCES, ENOTDIR, EMFILE — would otherwise mean "this directory contributes
                // no files", silently zeroing the MISSING half while BROKEN keeps passing.
                if (err.code === 'ENOENT') continue;
                return bail(`could not read docs/${dir}: ${err.message}`);
            }
            relPaths.push(
                ...selectIndexedFiles(
                    entries.map((n) => `docs/${dir}/${n}`),
                    INDEXED_DIRS
                )
            );
        }
        exists = (t) => {
            try {
                return fs.existsSync(path.join(docsDir, t));
            } catch (_err) {
                return false;
            }
        };
    } else {
        readme = git(['show', ':docs/README.md'], 'read the staged docs/README.md');
        const tracked = git(['ls-files', '--cached'], 'list tracked files')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        relPaths = selectIndexedFiles(tracked, INDEXED_DIRS);
        const trackedSet = new Set(tracked.map((p) => p.replace(/\\/g, '/')));
        exists = (t) => {
            // Targets are docs-relative and may escape docs/ (`../README.md` is legitimate).
            const full = path.posix.normalize(path.posix.join('docs', t)).replace(/^\.\//, '');
            if (trackedSet.has(full)) return true;
            const prefix = full.endsWith('/') ? full : `${full}/`;
            for (const p of trackedSet) {
                if (p.startsWith(prefix)) return true; // directory target
            }
            return false;
        };
    }

    const links = extractLinks(readme);
    const missing = findUnindexed(links, relPaths);
    const broken = findBrokenTargets(links, exists);

    if (missing.length === 0 && broken.length === 0) {
        process.exit(0);
    }

    const scope = useWorktree ? 'working tree' : 'staged changes';
    console.error(`\n⛔ docs/README.md index is out of date (${scope}):\n`);
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
            'Then stage docs/README.md — this reads the index, so an unstaged fix will not clear it.\n' +
            'Re-check without committing: node scripts/check-docs-index.js\n'
    );
    process.exit(1);
}
