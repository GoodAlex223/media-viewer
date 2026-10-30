import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
// Loaded per call, so a missing module fails each row on its own instead of the whole file at collection.
const lib = () => require('../scripts/check-line-ratchet.js');

const ZEROS = '0'.repeat(40);
const S1 = 'a'.repeat(40);
const S2 = 'b'.repeat(40);
const T = 'e'.repeat(40);

const R = 'media-viewer.js';
const C = 'scripts/renderer-line-ceiling.txt';

// The lines `tag i` for i from `from` to `from + n - 1`, each ending in a newline.
const body = (n, { from = 1, tag = 'line' } = {}) =>
    Array.from({ length: n }, (_, i) => `${tag} ${from + i}\n`).join('');
const ceiling = (v) => '# ceiling\n' + v + '\n';

describe('countLines', () => {
    it.each([
        ['', 0],
        ['a', 0],
        ['a\n', 1],
        ['a\nb', 1],
        ['a\n\n', 2],
        [Buffer.from('a\r\nb\r\n'), 2],
        [Buffer.from(body(3)), 3],
    ])('%j → %i', (content, expected) => {
        expect(lib().countLines(content)).toBe(expected);
    });
});

describe('parseCeiling', () => {
    it.each([
        ['11529\n', 11529],
        ['# c\n\n11529\n# d\n', 11529],
        ['﻿11529\n', 11529],
        ['11529\r\n', 11529],
        ['  11529  \n', 11529],
        ['  # indented\n7', 7],
        ['007\n', 7],
    ])('parses %j → %i', (text, expected) => {
        expect(lib().parseCeiling(text)).toBe(expected);
    });

    it.each([
        '',
        '\n\n',
        '# only\n',
        'abc\n',
        '1\n2\n',
        '0\n',
        '00\n',
        '-5\n',
        '+5\n',
        '5.0\n',
        '1e4\n',
        '11 529\n',
        '11,529\n',
        '9007199254740993\n',
        '11529 # note\n',
    ])('returns null for %j', (text) => {
        expect(lib().parseCeiling(text)).toBeNull();
    });

    it('the committed ceiling file parses to a positive integer', () => {
        const file = fileURLToPath(new URL('../scripts/renderer-line-ceiling.txt', import.meta.url));
        expect(lib().parseCeiling(fs.readFileSync(file, 'utf8'))).toBeGreaterThan(0);
    });
});

describe('selectUpdates', () => {
    const line = (localRef, localSha, remoteRef, remoteSha) => `${localRef} ${localSha} ${remoteRef} ${remoteSha}\n`;

    it.each([
        ['a branch update', line('refs/heads/x', S1, 'refs/heads/x', S2), 'refs/heads/x'],
        ['a new branch', line('refs/heads/x', S1, 'refs/heads/x', ZEROS), 'refs/heads/x'],
        ['HEAD to main', line('HEAD', S1, 'refs/heads/main', S2), 'refs/heads/main'],
        ['a raw sha as the local ref', line(S1, S1, 'refs/heads/x', ZEROS), 'refs/heads/x'],
        ['a 64-hex sha', line('refs/heads/x', 'a'.repeat(64), 'refs/heads/x', ZEROS), 'refs/heads/x'],
    ])('selects %s', (_name, stdin, remoteRef) => {
        const updates = lib().selectUpdates(stdin);
        expect(updates).toHaveLength(1);
        expect(updates[0].remoteRef).toBe(remoteRef);
    });

    it('returns the fields of a selected line', () => {
        expect(lib().selectUpdates(line('HEAD', S1, 'refs/heads/main', S2))).toEqual([
            { localRef: 'HEAD', localSha: S1, remoteRef: 'refs/heads/main', remoteSha: S2 },
        ]);
    });

    it('selects two branches in order and drops the tag between them', () => {
        const stdin =
            line('refs/heads/a', S1, 'refs/heads/a', S2) +
            line('refs/tags/v1', S1, 'refs/tags/v1', ZEROS) +
            line('refs/heads/b', S2, 'refs/heads/b', ZEROS);
        expect(
            lib()
                .selectUpdates(stdin)
                .map((u) => u.remoteRef)
        ).toEqual(['refs/heads/a', 'refs/heads/b']);
    });

    it.each([
        ['a delete', line('(delete)', ZEROS, 'refs/heads/gone', S2)],
        ['a tag', line('refs/tags/v1', S1, 'refs/tags/v1', ZEROS)],
        ['an empty string', ''],
        ['blank lines', '\n\n'],
    ])('drops %s', (_name, stdin) => {
        expect(lib().selectUpdates(stdin)).toEqual([]);
    });

    it.each([
        ['garbage', 'garbage'],
        ['a three-field line', `refs/heads/x ${S1} refs/heads/x\n`],
        ['a five-field line', `refs/heads/x ${S1} refs/heads/x ${S2} extra\n`],
        ['a short sha', `refs/heads/x abc refs/heads/x ${S2}\n`],
    ])('throws for %s', (_name, stdin) => {
        expect(() => lib().selectUpdates(stdin)).toThrow('malformed ref line');
    });
});

describe('decide', () => {
    it.each([
        [101, 100, 'refs/heads/x', 'over'],
        [101, 100, 'refs/heads/main', 'over'],
        [99, 100, 'refs/heads/main', 'lower'],
        [99, 100, 'refs/heads/x', 'remind'],
        [99, 100, 'refs/heads/mainline', 'remind'],
        [100, 100, 'refs/heads/main', 'pass'],
        [100, 100, 'refs/heads/x', 'pass'],
    ])('(%i, %i, %s) → %s', (count, limit, remoteRef, expected) => {
        expect(lib().decide(count, limit, remoteRef)).toBe(expected);
    });
});

describe('parseMergeTree', () => {
    it.each([
        ['a clean merge', `${T}\n`, 0, { tree: T, conflicts: [] }],
        [
            'a conflict in both files',
            `${T}\nmedia-viewer.js\nscripts/renderer-line-ceiling.txt\n\n`,
            1,
            { tree: T, conflicts: ['media-viewer.js', 'scripts/renderer-line-ceiling.txt'] },
        ],
        ['a conflict in another file', `${T}\ndocs/a.md\n`, 1, { tree: T, conflicts: ['docs/a.md'] }],
        ['a 64-hex tree', `${'e'.repeat(64)}\n`, 0, { tree: 'e'.repeat(64), conflicts: [] }],
    ])('accepts %s', (_name, stdout, status, expected) => {
        expect(lib().parseMergeTree(stdout, status)).toEqual(expected);
    });

    it.each([
        ["git 2.38's unresolvable ref", '', 1],
        ['an empty clean exit', '', 0],
        ['an error exit', `${T}\n`, 128],
        ['a tree that is not an oid', 'not-an-oid\n', 0],
        ['a clean exit that lists a conflict', `${T}\nmedia-viewer.js\n`, 0],
        ['a conflict exit that lists none', `${T}\n`, 1],
    ])('returns null for %s', (_name, stdout, status) => {
        expect(lib().parseMergeTree(stdout, status)).toBeNull();
    });
});

// Vitest runs inside the pre-commit hook, where git exports GIT_INDEX_FILE (and, in a worktree, an
// absolute GIT_DIR). Inherited, they would aim a temp repo's init/add/commit and the CLI's git calls at the
// real repo. Built per call, so a test can plant them.
const gitEnv = () => {
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
const git = (repo, ...args) =>
    execFileSync('git', [...GIT_CONFIG, ...args], { cwd: repo, encoding: 'utf8', env: gitEnv() }).trim();

// The CLI against a throwaway work repo whose `origin` is a local bare repo: the fetch, the merge-tree and
// the blob reads are all real. Each refusal row pins a message only the built check prints: with the script
// absent node exits 1 with "Cannot find module", so an exit code alone would pass vacuously.
describe('CLI on a real repo with a local origin', { timeout: 120_000 }, () => {
    const SCRIPT = fileURLToPath(new URL('../scripts/check-line-ratchet.js', import.meta.url));
    let root;
    let work;
    let origin;
    let orphans = 0;

    // A commit on `parent` (detached), or a root commit for null. `files` maps a path to its content, or
    // null to delete it.
    const commit = (parent, files, message) => {
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
    };
    const publishMain = (sha) => git(work, 'push', '-q', '--force', 'origin', `${sha}:refs/heads/main`);
    const run = (lines) =>
        spawnSync(process.execPath, [SCRIPT], {
            cwd: work,
            input: lines.join('\n') + '\n',
            encoding: 'utf8',
            env: gitEnv(),
        });
    const branch = (tip, ref = 'refs/heads/feature') => `${ref} ${tip} ${ref} ${ZEROS}`;
    const expectOutcome = (r, status, parts) => {
        expect(r.status, r.stderr).toBe(status);
        expect(r.stdout).toBe('');
        expect(r.stderr).toContain('pre-push ratchet: ');
        for (const part of parts) expect(r.stderr).toContain(part);
    };
    const expectRefused = (r, ...parts) => expectOutcome(r, 1, parts);
    const expectPassed = (r, ...parts) => expectOutcome(r, 0, parts);
    // A base with a 100-line renderer and a ceiling of `limit`, published as origin's main.
    const baseMain = (limit = 100) => {
        const b = commit(null, { [R]: body(100), [C]: ceiling(limit) }, 'base');
        publishMain(b);
        return b;
    };
    // A base of 100 lines whose `main` has dropped its first 10 and set the ceiling to 90, while the tip's
    // side still has the ceiling at 105. Main's change is clean against a tip that appends at the end.
    const staleMain = () => {
        const s = commit(null, { [R]: body(100), [C]: ceiling(105) }, 'stale base');
        publishMain(commit(s, { [R]: body(90, { from: 11 }), [C]: ceiling(90) }, 'main moves'));
        return s;
    };

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ratchet-'));
        origin = path.join(root, 'origin.git').replace(/\\/g, '/');
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

    it('case 1: refuses a branch over the ceiling', () => {
        const b = baseMain();
        const tip = commit(b, { [R]: body(101) }, 'tip');
        expectRefused(
            run([branch(tip)]),
            'media-viewer.js 101 lines, ceiling 100',
            'over by 1',
            'SKIP=ratchet git push',
            'scripts/renderer-line-ceiling.txt'
        );
    });

    it('case 2: passes a stale branch that did not touch the renderer', () => {
        const s = staleMain();
        const tip = commit(s, { 'docs/a.md': 'a\n' }, 'tip');
        expectPassed(run([branch(tip)]), 'media-viewer.js 90 lines, ceiling 90', 'at the ceiling');
    });

    it('case 3: refuses a stale branch that grew the renderer by 3', () => {
        const s = staleMain();
        const tip = commit(s, { [R]: body(100) + body(3, { tag: 'extra' }) }, 'tip');
        expectRefused(run([branch(tip)]), 'media-viewer.js 93 lines, ceiling 90', 'over by 3');
    });

    it('case 4a: passes a branch that raises the ceiling and grows to it', () => {
        const b = baseMain();
        const tip = commit(b, { [R]: body(105), [C]: ceiling(105) }, 'tip');
        expectPassed(run([branch(tip)]), 'media-viewer.js 105 lines, ceiling 105');
    });

    it('case 4b: passes the same raise pushed to main', () => {
        const b = baseMain();
        const tip = commit(b, { [R]: body(105), [C]: ceiling(105) }, 'tip');
        expectPassed(
            run([`refs/heads/feature ${tip} refs/heads/main ${b}`]),
            'refs/heads/main: media-viewer.js 105 lines, ceiling 105'
        );
    });

    it('case 5: refuses when both sides changed the ceiling to different values', () => {
        const b = commit(null, { [R]: body(100), [C]: ceiling(100) }, 'base');
        publishMain(commit(b, { [R]: body(95, { from: 6 }), [C]: ceiling(95) }, 'main moves'));
        const tip = commit(b, { [R]: body(100) + body(2, { tag: 'extra' }), [C]: ceiling(110) }, 'tip');
        expectRefused(
            run([branch(tip)]),
            'scripts/renderer-line-ceiling.txt conflicts with origin/main — merge origin/main first'
        );
    });

    it('case 6a: refuses a push to main while the ceiling is above the count', () => {
        const l = commit(null, { [R]: body(90), [C]: ceiling(95) }, 'lagging base');
        publishMain(l);
        const tip = commit(l, { 'docs/a.md': 'a\n' }, 'tip');
        expectRefused(
            run([`HEAD ${tip} refs/heads/main ${l}`]),
            'media-viewer.js 90 lines, ceiling 95',
            'lower the ceiling to 90'
        );
    });

    it('case 6b: passes the same tip on a branch, with the reminder', () => {
        const l = commit(null, { [R]: body(90), [C]: ceiling(95) }, 'lagging base');
        publishMain(l);
        const tip = commit(l, { 'docs/a.md': 'a\n' }, 'tip');
        expectPassed(run([branch(tip)]), 'lower the ceiling to 90');
    });

    it('case 7: refuses when the renderer conflicts', () => {
        const b = commit(null, { [R]: body(100), [C]: ceiling(110) }, 'base');
        publishMain(commit(b, { [R]: body(100).replace('line 50\n', 'main 50\n') }, 'main moves'));
        const tip = commit(b, { [R]: body(100).replace('line 50\n', 'branch 50\n') }, 'tip');
        expectRefused(run([branch(tip)]), 'media-viewer.js conflicts with origin/main — merge origin/main first');
    });

    it('case 8: counts a renderer change made on both sides once', () => {
        const b = commit(null, { [R]: body(100), [C]: ceiling(105) }, 'base');
        const grown = body(100) + body(5, { tag: 'same' });
        publishMain(commit(b, { [R]: grown }, 'main grows'));
        const tip = commit(b, { [R]: grown }, 'tip grows the same way');
        expectPassed(run([branch(tip)]), 'media-viewer.js 105 lines, ceiling 105');
    });

    it('case 9a: refuses when origin is unreachable', () => {
        const b = baseMain();
        const tip = commit(b, { 'docs/a.md': 'a\n' }, 'tip');
        git(work, 'remote', 'set-url', 'origin', `${root.replace(/\\/g, '/')}/missing.git`);
        try {
            expectRefused(run([branch(tip)]), 'cannot measure', 'could not fetch');
        } finally {
            git(work, 'remote', 'set-url', 'origin', origin);
        }
    });

    it('case 9b: refuses an unresolvable tip', () => {
        baseMain();
        expectRefused(run([branch('c'.repeat(40))]), 'cannot measure', 'cannot resolve');
    });

    it('case 9c: refuses when the merge has no ceiling file', () => {
        const b = baseMain();
        const tip = commit(b, { [C]: null }, 'tip');
        expectRefused(run([branch(tip)]), 'cannot measure', 'scripts/renderer-line-ceiling.txt is missing');
    });

    it('case 9d: refuses when the merge has no renderer', () => {
        const b = baseMain();
        const tip = commit(b, { [R]: null }, 'tip');
        expectRefused(run([branch(tip)]), 'cannot measure', 'media-viewer.js is missing');
    });

    it('case 9e: refuses a ceiling that does not parse', () => {
        const b = baseMain();
        const tip = commit(b, { [C]: 'abc\n' }, 'tip');
        expectRefused(run([branch(tip)]), 'cannot measure', 'scripts/renderer-line-ceiling.txt does not parse');
    });

    it('row 10: passes without fetching when nothing is selected', () => {
        git(work, 'remote', 'set-url', 'origin', `${root.replace(/\\/g, '/')}/missing.git`);
        try {
            const r = run([`(delete) ${ZEROS} refs/heads/gone ${S2}`, `refs/tags/v1 ${S1} refs/tags/v1 ${ZEROS}`, '']);
            expect(r.status, r.stderr).toBe(0);
            expect(r.stderr).not.toContain('cannot measure');
        } finally {
            git(work, 'remote', 'set-url', 'origin', origin);
        }
    });

    it('row 11: measures every ref and refuses the push when one is over', () => {
        const b = baseMain();
        const ok = commit(b, { 'docs/a.md': 'a\n' }, 'ok');
        const big = commit(b, { [R]: body(101) }, 'big');
        expectRefused(
            run([branch(ok, 'refs/heads/ok'), branch(big, 'refs/heads/big')]),
            'refs/heads/ok: media-viewer.js 100 lines, ceiling 100',
            'refs/heads/big: media-viewer.js 101 lines, ceiling 100'
        );
    });

    it('row 12: counts a renderer over 1 MiB', () => {
        expect(Buffer.byteLength(body(100000))).toBeGreaterThan(1024 * 1024);
        const b = commit(null, { [R]: body(100000), [C]: ceiling(100000) }, 'big base');
        publishMain(b);
        const tip = commit(b, { 'docs/a.md': 'a\n' }, 'tip');
        expectPassed(run([branch(tip)]), 'media-viewer.js 100000 lines, ceiling 100000');
    });
});
