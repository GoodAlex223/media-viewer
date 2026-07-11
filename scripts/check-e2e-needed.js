// Pre-push E2E gate decision helper.
//
// Reads git's pre-push stdin (one `<local_ref> <local_sha> <remote_ref> <remote_sha>`
// line per pushed ref), computes the changed-file set for the outgoing range, and prints
// `RUN` or `SKIP` to stdout. `.husky/pre-push` runs the Playwright E2E suite only on
// `RUN`. Conservative: RUN unless EVERY changed path is docs/markdown.
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

/**
 * Decide whether the E2E suite must run for a set of changed paths. Returns true (RUN) if
 * ANY path is runtime code; false (SKIP) only when every path is documentation (`*.md` or
 * under `docs/`) or the list is empty. Conservative — an unrecognized path counts as runtime.
 * @param {string[]} files
 * @returns {boolean}
 */
function classifyPaths(files) {
    if (!files || files.length === 0) return false;
    return files.some((f) => {
        const p = (f || '').trim();
        if (!p) return false;
        if (p.endsWith('.md')) return false;
        if (p.startsWith('docs/')) return false;
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
            return execFileSync('git', ['diff', '--name-only', base, ref.localSha], { encoding: 'utf8' })
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
        process.stderr.write('pre-push: docs-only push — skipping E2E.\n');
        return 'SKIP';
    };

    process.stdout.write(decide());
}
