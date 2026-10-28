// Pre-push E2E gate decision helper.
//
// Reads git's pre-push stdin (one `<local_ref> <local_sha> <remote_ref> <remote_sha>`
// line per pushed ref), computes the changed-file set for the outgoing range, and prints
// `RUN` or `SKIP` to stdout. `.husky/pre-push` runs the Playwright E2E suite only on
// `RUN`. Conservative: SKIP only when EVERY changed path is on an explicit list of paths the
// app never loads (docs, Claude Code config, maintenance scripts, git hooks, prototypes, unit
// tests and the unit/lint/format configs); any other path is RUN.
//
// `parsePushRefs` and `classifyPaths` are pure and unit-tested. The CLI section (added in
// Task 2) is a thin, fail-safe git wrapper: it prints RUN on any git/parse failure so a
// broken lookup never silently skips the suite, and it never exits non-zero for a decision
// (the hook decides whether to run E2E from the printed token, so the script itself never
// blocks the push).

const ZERO_SHA = /^0+$/;

/**
 * Parse git pre-push stdin into ref tuples. Branch-delete refs (local sha all-zeros —
 * nothing to test) are dropped. Blank/empty input → [].
 * @param {string} stdin
 * @returns {Array<{localRef:string, localSha:string, remoteRef:string, remoteSha:string}>}
 */
function parsePushRefs(stdin) {
    if (!stdin) return [];
    const refs = [];
    for (const line of stdin.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [localRef, localSha, remoteRef, remoteSha] = trimmed.split(/\s+/);
        if (!localSha || ZERO_SHA.test(localSha)) continue;
        refs.push({ localRef, localSha, remoteRef, remoteSha });
    }
    return refs;
}

// Paths the app never loads, so a change to them alone cannot break an E2E run. Anything not
// matched here is RUN: a new kind of file runs the suite until someone lists it. `tests/e2e/`
// and `playwright.config.js` must never match, since only an E2E run checks them; nor must
// `package.json` or `package-lock.json`, which carry the dependencies and the entry point.
const SKIP_DIRS = ['docs/', '.claude/', 'scripts/', '.husky/', 'prototypes/', 'tests/integration/'];
const SKIP_FILES = new Set([
    'tests/feature-cache-harness.js',
    'tests/hash-pool-harness.js',
    'vitest.config.js',
    'eslint.config.mjs',
    '.prettierrc.json',
    '.prettierignore',
]);
// A unit test at the top of `tests/` only; a nested one (`tests/e2e/…`) stays RUN.
const UNIT_TEST = /^tests\/[^/]+\.test\.js$/;

/**
 * Decide whether the E2E suite must run for a set of changed paths. Returns true (RUN) if
 * ANY path is off the SKIP list; false (SKIP) only when every path is `*.md`, under a
 * `SKIP_DIRS` prefix, one of `SKIP_FILES`, a top-level unit test (`UNIT_TEST`), or the list
 * is empty. Conservative — an unrecognized path counts as runtime.
 * @param {string[]} files
 * @returns {boolean}
 */
function classifyPaths(files) {
    if (!files || files.length === 0) return false;
    return files.some((f) => {
        const p = (f || '').trim();
        if (!p) return false;
        if (p.endsWith('.md')) return false;
        if (SKIP_DIRS.some((dir) => p.startsWith(dir))) return false;
        if (SKIP_FILES.has(p)) return false;
        if (UNIT_TEST.test(p)) return false;
        return true;
    });
}

module.exports = { parsePushRefs, classifyPaths };

// --- CLI: read git's pre-push stdin, print RUN/SKIP for the hook to consume ---
if (require.main === module) {
    const { execFileSync } = require('child_process');
    const fs = require('fs');

    // Changed files for one ref; returns null on any git failure (caller forces RUN).
    const changedFilesForRef = (ref) => {
        try {
            let base;
            if (ZERO_SHA.test(ref.remoteSha || '')) {
                // New branch on remote → diff vs the merge-base with main.
                base = execFileSync('git', ['merge-base', 'origin/main', ref.localSha], {
                    encoding: 'utf8',
                }).trim();
            } else {
                base = ref.remoteSha;
            }
            if (!base) return null;
            // Explicit maxBuffer, matching check-secrets.js: the default 1 MB can truncate a
            // wide-ranging push's file list, and execFileSync throws ENOBUFS rather than
            // returning short — which this catch turns into a fail-safe RUN, not a silent SKIP.
            // `--no-renames`: a rename otherwise lists only its new path, so a runtime file moved
            // into a SKIP area (`git mv main.js docs/`) would skip.
            return execFileSync('git', ['diff', '--name-only', '--no-renames', base, ref.localSha], {
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
            })
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
        } catch (_err) {
            return null;
        }
    };

    const decide = () => {
        let stdin;
        try {
            stdin = fs.readFileSync(0, 'utf8');
        } catch (_err) {
            // Could not read stdin — that is uncertainty, not a legitimate no-op push.
            // Fail safe toward running E2E rather than the empty-stdin SKIP branch below.
            process.stderr.write('pre-push: could not read stdin — running E2E (fail-safe).\n');
            return 'RUN';
        }
        const refs = parsePushRefs(stdin);
        if (refs.length === 0) {
            process.stderr.write('pre-push: no pushable refs — skipping E2E.\n');
            return 'SKIP';
        }
        const allFiles = [];
        for (const ref of refs) {
            const files = changedFilesForRef(ref);
            if (files === null) {
                process.stderr.write('pre-push: could not determine changed files — running E2E (fail-safe).\n');
                return 'RUN';
            }
            allFiles.push(...files);
        }
        if (classifyPaths(allFiles)) {
            process.stderr.write('pre-push: runtime code changed — running E2E.\n');
            return 'RUN';
        }
        process.stderr.write('pre-push: no path the app loads changed — skipping E2E.\n');
        return 'SKIP';
    };

    process.stdout.write(decide());
}
