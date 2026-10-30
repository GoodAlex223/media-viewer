import { beforeAll, afterAll, expect } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Shared by the ratchet's test files: the planted-case values, and a throwaway work repo whose `origin` is
// a local bare repo, so the CLI's fetch, `merge-tree` and blob reads are all real. The CLI rows are split
// across files so that vitest runs them in parallel; each file builds its own repo.

export const ZEROS = '0'.repeat(40);
export const S1 = 'a'.repeat(40);
export const S2 = 'b'.repeat(40);
export const T = 'e'.repeat(40);

export const R = 'media-viewer.js';
export const C = 'scripts/renderer-line-ceiling.txt';

// The lines `tag i` for i from `from` to `from + n - 1`, each ending in a newline.
export const body = (n, { from = 1, tag = 'line' } = {}) =>
    Array.from({ length: n }, (_, i) => `${tag} ${from + i}\n`).join('');
export const ceiling = (v) => '# ceiling\n' + v + '\n';

// Vitest runs inside the pre-commit hook, where git exports GIT_INDEX_FILE (and, in a worktree, an
// absolute GIT_DIR). Inherited, they would aim a temp repo's init/add/commit and the CLI's git calls at the
// real repo. Built per call, so a test can plant them.
export const gitEnv = () => {
    const env = { ...process.env };
    delete env.GIT_DIR;
    delete env.GIT_INDEX_FILE;
    delete env.GIT_WORK_TREE;
    return env;
};
// git in a temp repo: an identity, LF line endings, and no commit signing, which a user's global config
// may turn on (a missing signer fails the commit; a prompting one hangs this synchronous call).
const GIT_CONFIG = [
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    '-c',
    'core.autocrlf=false',
    '-c',
    'commit.gpgsign=false',
];
export const git = (repo, ...args) =>
    execFileSync('git', [...GIT_CONFIG, ...args], { cwd: repo, encoding: 'utf8', env: gitEnv() }).trim();

const SCRIPT = fileURLToPath(new URL('../scripts/check-line-ratchet.js', import.meta.url));

/**
 * Call inside a `describe`: registers the repo's setup and teardown and returns the helpers. Each test
 * publishes its own `main` first, so the tests of one file share a repo but not each other's order.
 */
export function useRatchetRepo() {
    let root;
    let work;
    let origin;
    let missing;
    let orphans = 0;

    const repo = {
        get root() {
            return root;
        },
        get work() {
            return work;
        },
        // A commit on `parent` (detached), or a root commit for null. `files` maps a path to its content, or
        // null to delete it.
        commit(parent, files, message) {
            if (parent === null) {
                git(work, 'checkout', '-q', '--orphan', `o${++orphans}`);
                git(work, 'rm', '-rfq', '--ignore-unmatch', '.');
            } else {
                git(work, 'checkout', '-q', '--detach', parent);
            }
            for (const [file, content] of Object.entries(files)) {
                const abs = path.join(work, file);
                if (content === null) {
                    fs.rmSync(abs, { force: true });
                } else {
                    fs.mkdirSync(path.dirname(abs), { recursive: true });
                    fs.writeFileSync(abs, content);
                }
            }
            git(work, 'add', '-A');
            git(work, 'commit', '-q', '--allow-empty', '-m', message);
            return git(work, 'rev-parse', 'HEAD');
        },
        // A commit on `parent` in which `file` is a symlink to `target` (mode 120000), whatever the platform
        // does with symlinks on disk.
        commitSymlink(parent, file, target, message) {
            git(work, 'checkout', '-q', '--detach', parent);
            const oid = execFileSync('git', ['hash-object', '-w', '--stdin'], {
                cwd: work,
                input: target,
                encoding: 'utf8',
                env: gitEnv(),
            }).trim();
            git(work, 'update-index', '--add', '--cacheinfo', `120000,${oid},${file}`);
            git(work, 'commit', '-q', '--allow-empty', '-m', message);
            return git(work, 'rev-parse', 'HEAD');
        },
        publishMain: (sha) => git(work, 'push', '-q', '--force', 'origin', `${sha}:refs/heads/main`),
        run: (lines) =>
            spawnSync(process.execPath, [SCRIPT], {
                cwd: work,
                input: lines.join('\n') + '\n',
                encoding: 'utf8',
                env: gitEnv(),
            }),
        branch: (tip, ref = 'refs/heads/feature') => `${ref} ${tip} ${ref} ${ZEROS}`,
        // The work repo's origin pointed at a folder with no repo, restored when `fn` returns.
        withUnreachableOrigin(fn) {
            git(work, 'remote', 'set-url', 'origin', missing);
            try {
                return fn();
            } finally {
                git(work, 'remote', 'set-url', 'origin', origin);
            }
        },
        // Each refusal row pins a message only the built check prints: with the script absent node exits 1
        // with "Cannot find module", so an exit code alone would pass vacuously.
        expectOutcome(r, status, parts) {
            expect(r.status, r.stderr).toBe(status);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain('pre-push ratchet: ');
            for (const part of parts) expect(r.stderr).toContain(part);
        },
        expectRefused: (r, ...parts) => repo.expectOutcome(r, 1, parts),
        expectPassed: (r, ...parts) => repo.expectOutcome(r, 0, parts),
        // A base with a 100-line renderer and a ceiling of `limit`, published as origin's main.
        baseMain(limit = 100) {
            const b = repo.commit(null, { [R]: body(100), [C]: ceiling(limit) }, 'base');
            repo.publishMain(b);
            return b;
        },
        // A base of 100 lines whose `main` has dropped its first 10 and set the ceiling to 90, while the tip's
        // side still has the ceiling at 105. Main's change is clean against a tip that appends at the end.
        staleMain() {
            const s = repo.commit(null, { [R]: body(100), [C]: ceiling(105) }, 'stale base');
            repo.publishMain(repo.commit(s, { [R]: body(90, { from: 11 }), [C]: ceiling(90) }, 'main moves'));
            return s;
        },
    };

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ratchet-'));
        const slashed = root.replace(/\\/g, '/');
        origin = `${slashed}/origin.git`;
        missing = `${slashed}/missing.git`;
        work = path.join(root, 'work');
        git(root, 'init', '-q', '--bare', 'origin.git');
        git(root, 'init', '-q', 'work');
        git(work, 'remote', 'add', 'origin', origin);
    });
    afterAll(() => {
        try {
            fs.rmSync(root, { recursive: true, force: true });
        } catch {
            // Windows can briefly hold a .git pack handle; a leaked temp dir is harmless.
        }
    });

    return repo;
}
