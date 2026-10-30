import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { parsePushRefs, classifyPaths } = require('../scripts/check-e2e-needed.js');

const ZEROS = '0000000000000000000000000000000000000000';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('parsePushRefs', () => {
    it('parses a single ref line', () => {
        const refs = parsePushRefs(`refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}\n`);
        expect(refs).toEqual([
            { localRef: 'refs/heads/main', localSha: SHA_A, remoteRef: 'refs/heads/main', remoteSha: SHA_B },
        ]);
    });

    it('parses multiple ref lines', () => {
        const stdin = `refs/heads/a ${SHA_A} refs/heads/a ${SHA_B}\n` + `refs/heads/b ${SHA_B} refs/heads/b ${ZEROS}\n`;
        expect(parsePushRefs(stdin)).toHaveLength(2);
    });

    it('drops a branch-delete ref (all-zero localSha)', () => {
        const stdin = `(delete) ${ZEROS} refs/heads/gone ${SHA_B}\n`;
        expect(parsePushRefs(stdin)).toEqual([]);
    });

    it('preserves a new-branch ref (all-zero remoteSha) with its zero remoteSha', () => {
        const refs = parsePushRefs(`refs/heads/new ${SHA_A} refs/heads/new ${ZEROS}\n`);
        expect(refs).toHaveLength(1);
        expect(refs[0].remoteSha).toBe(ZEROS);
    });

    it('returns [] for empty or whitespace-only stdin', () => {
        expect(parsePushRefs('')).toEqual([]);
        expect(parsePushRefs('   \n  \n')).toEqual([]);
    });
});

describe('classifyPaths', () => {
    it('returns false (skip) when every path is markdown', () => {
        expect(classifyPaths(['CLAUDE.md', 'docs/planning/WEEKLY.md', 'README.md'])).toBe(false);
    });

    it('returns false (skip) when every path is under docs/ (incl. non-md)', () => {
        expect(classifyPaths(['docs/superpowers/specs/x.md', 'docs/planning/notes.txt'])).toBe(false);
    });

    it('returns true (run) when an app file sits among docs paths', () => {
        expect(classifyPaths(['docs/planning/WEEKLY.md', 'media-viewer.js'])).toBe(true);
    });

    it('returns true (run) for the page and its stylesheet', () => {
        expect(classifyPaths(['index.html'])).toBe(true);
        expect(classifyPaths(['styles.css'])).toBe(true);
    });

    it('returns false (skip) for an empty list', () => {
        expect(classifyPaths([])).toBe(false);
    });

    it('treats a root-level .md as docs (skip)', () => {
        expect(classifyPaths(['CLAUDE.md'])).toBe(false);
    });
});

describe('classifyPaths — paths the app never loads skip E2E', () => {
    it.each([
        '.claude/hooks/format-edited-file.js',
        '.claude/settings.json',
        'scripts/check-e2e-needed.js',
        '.husky/pre-push',
        'prototypes/ai-sorting/harness.py',
        'tests/check-e2e-needed.test.js',
        'tests/integration/tournament-flow.test.js',
        'tests/feature-cache-harness.js',
        'tests/hash-pool-harness.js',
        'tests/ratchet-repo-harness.js',
        'vitest.config.js',
        'eslint.config.mjs',
        '.prettierrc.json',
        '.prettierignore',
    ])('%s → SKIP', (p) => {
        expect(classifyPaths([p])).toBe(false);
    });

    it('skips a push made only of SKIP paths across classes', () => {
        expect(classifyPaths(['scripts/a.js', 'tests/a.test.js', '.claude/x.json', 'docs/x.txt', 'CLAUDE.md'])).toBe(
            false
        );
    });
});

describe('classifyPaths — near misses and look-alikes run E2E', () => {
    it.each([
        'tests/e2e/navigation.test.js',
        'tests/e2e/helpers/electron-app.js',
        'tests/e2e/fixtures/hash-fixtures.js',
        'tests/e2e/README.md',
        'tests/e2e/fixtures/notes.md',
        'tests/e2e/package.json',
        'tests/sub/nested.test.js',
        'tests/new-helper.js',
        'tests/integrationx/a.test.js',
        'scripts.js',
        'scriptsx/a.js',
        '.claudex/a.js',
        '.husky-old/pre-push',
        'docs-old/a.txt',
        'prototypes.js',
        'Scripts/a.js',
        'scripts\\a.js',
        '"scripts/\\303\\251.js"',
        'playwright.config.js',
        'package.json',
        'package-lock.json',
        'LICENSE',
        '.mcp.json.example',
        'vendor/lucide/lucide.min.js',
        'vitest.config.js.bak',
        'sub/vitest.config.js',
    ])('%s → RUN', (p) => {
        expect(classifyPaths([p])).toBe(true);
    });

    it('runs when one runtime path sits among SKIP paths', () => {
        expect(classifyPaths(['scripts/a.js', 'tests/a.test.js', '.claude/x.json', 'media-viewer.js'])).toBe(true);
    });
});

// Vitest runs inside the pre-commit hook, where git exports GIT_INDEX_FILE (and, in a worktree, an
// absolute GIT_DIR). Inherited, they would aim a temp repo's init/add/commit and the CLI's diff at the
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

// The CLI against one throwaway repo with a straight history: what `git diff` lists for a moved file,
// and the base a new branch diffs against, which no pure test can show.
describe('CLI on a real repo', { timeout: 30_000 }, () => {
    const SCRIPT = fileURLToPath(new URL('../scripts/check-e2e-needed.js', import.meta.url));
    const sha = {};
    let repo;

    const commit = (message) => {
        git(repo, 'add', '-A');
        git(repo, 'commit', '-qm', message);
        return git(repo, 'rev-parse', 'HEAD');
    };
    // The CLI on one ref line. A decision always exits 0: the hook reads only the printed token.
    const decide = (head, remote) => {
        const result = spawnSync(process.execPath, [SCRIPT], {
            cwd: repo,
            input: `refs/heads/x ${head} refs/heads/x ${remote}\n`,
            encoding: 'utf8',
            env: gitEnv(),
        });
        expect(result.status).toBe(0);
        return result;
    };

    beforeAll(() => {
        repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-e2e-gate-'));
        git(repo, 'init', '-q');
        fs.mkdirSync(path.join(repo, 'scripts'));
        fs.mkdirSync(path.join(repo, 'docs'));
        fs.writeFileSync(path.join(repo, 'main.js'), "console.log('main');\n");
        fs.writeFileSync(path.join(repo, 'app.js'), "console.log('app');\n");
        fs.writeFileSync(path.join(repo, 'scripts', 'a.js'), "console.log('a');\n");
        fs.writeFileSync(path.join(repo, 'docs', 'a.md'), '# A\n');
        sha.base = commit('base');
        fs.appendFileSync(path.join(repo, 'scripts', 'a.js'), "console.log('b');\n");
        sha.script = commit('edit a script');
        git(repo, 'mv', 'main.js', 'scripts/main.js');
        sha.intoScripts = commit('move main.js into scripts/');
        git(repo, 'mv', 'app.js', 'docs/app.js');
        sha.intoDocs = commit('move app.js into docs/');
        // What a new branch's push diffs against: its merge-base with origin/main.
        git(repo, 'update-ref', 'refs/remotes/origin/main', sha.base);
    });
    afterAll(() => {
        try {
            fs.rmSync(repo, { recursive: true, force: true });
        } catch {
            // Windows can briefly hold a .git pack handle; a leaked temp dir is harmless.
        }
    });

    it('prints SKIP for a push that changes only scripts/ (control: the CLI can skip)', () => {
        const result = decide(sha.script, sha.base);
        expect(result.stdout).toBe('SKIP');
        expect(result.stderr).toContain('skipping E2E');
    });

    it('prints RUN when a runtime file moves into scripts/', () => {
        expect(decide(sha.intoScripts, sha.script).stdout).toBe('RUN');
    });

    it('prints RUN when a runtime file moves into docs/', () => {
        expect(decide(sha.intoDocs, sha.intoScripts).stdout).toBe('RUN');
    });

    it('diffs a new branch (all-zero remote SHA) against its merge-base with origin/main', () => {
        expect(decide(sha.script, ZEROS).stdout).toBe('SKIP');
        expect(decide(sha.intoScripts, ZEROS).stdout).toBe('RUN');
    });

    // A worktree's pre-commit hook exports both as absolute paths (measured, git 2.38). Pointed at a
    // folder that holds no repo, either one inherited makes git fail.
    it('keeps its git calls off the GIT_DIR and GIT_INDEX_FILE a hook exports', () => {
        const nowhere = path.join(repo, 'no-such-dir', '.git');
        vi.stubEnv('GIT_DIR', nowhere);
        vi.stubEnv('GIT_INDEX_FILE', path.join(nowhere, 'index'));
        try {
            expect(git(repo, 'rev-parse', 'HEAD')).toBe(sha.intoDocs);
            expect(decide(sha.script, sha.base).stdout).toBe('SKIP');
        } finally {
            vi.unstubAllEnvs();
        }
    });
});

// `.husky/pre-push` itself, with stub `node` (the ratchet and the gate) and `npx` (the E2E run) first on
// PATH. Git sends the ref lines once, and the real gate prints SKIP for an empty stdin, so each stub
// prints a stderr marker, and the gate its canned answer, only when it received the ref lines: the SKIP
// control and the stdin proof fail if a hook step swallows stdin before the gate (E2E would then be off
// for every push) or if a stub never runs. A stub gate that lost the lines prints STDIN-LOST, which is
// not SKIP. The stubs must be executable: POSIX sh passes over a file without the execute bit and takes
// the next match on PATH, which here is the real ratchet, the real gate and the real E2E run. Any other
// `node` call goes to the real node.
const shAvailable = spawnSync('sh', ['-c', 'exit 0']).status === 0;
describe.skipIf(!shAvailable)(
    'the pre-push hook: the ratchet first, then E2E unless the gate prints exactly SKIP',
    { timeout: 30_000 },
    () => {
        const ROOT = fileURLToPath(new URL('..', import.meta.url));
        // Two lines, so a hook that keeps only git's first ref line (`head -n1`, `read -r`) fails the stdin proof.
        const REFS = `refs/heads/x ${SHA_A} refs/heads/x ${SHA_B}\nrefs/heads/y ${SHA_B} refs/heads/y ${ZEROS}`;
        let bin;

        // REAL_NODE is the stub's way to the real node: an absolute path, so the stub never looks itself up on
        // PATH (where it could find itself again, whatever order `sh` builds PATH in).
        const stubEnv = () => ({
            ...process.env,
            PATH: bin + path.delimiter + process.env.PATH,
            REAL_NODE: process.execPath,
        });

        beforeAll(() => {
            bin = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-pre-push-'));
            const stubs = {
                node: [
                    '#!/bin/sh',
                    'case "$1" in',
                    'scripts/check-line-ratchet.js)',
                    '    input=$(cat)',
                    '    [ "$input" = "$EXPECT_STDIN" ] && echo "STUB-RATCHET got the ref lines" >&2',
                    '    exit "${RATCHET_EXIT:-0}" ;;',
                    'scripts/check-e2e-needed.js)',
                    '    input=$(cat)',
                    '    if [ "$input" = "$EXPECT_STDIN" ]; then',
                    '        echo "STUB-GATE got the ref lines" >&2; printf "%s" "$STUB_OUT"',
                    '    else printf STDIN-LOST; fi',
                    '    exit "${STUB_EXIT:-0}" ;;',
                    // Any other script, whichever argument names it (`node -- scripts/…` puts an option first), is a
                    // hook line this stub does not model: fail loudly, never run the real one (the real ratchet
                    // would fetch from GitHub inside the unit suite).
                    '*) for arg in "$@"; do',
                    '       case "$arg" in *scripts/*) echo "stub node: unexpected script $arg" >&2; exit 99 ;; esac',
                    '   done',
                    '   exec "$REAL_NODE" "$@" ;;',
                    'esac',
                    '',
                ].join('\n'),
                npx: '#!/bin/sh\necho "E2E-RAN $*"\n',
            };
            for (const [name, body] of Object.entries(stubs)) {
                fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
                fs.chmodSync(path.join(bin, name), 0o755); // `mode` above is masked by the umask
            }
            // Refuse to go on unless sh finds both stubs first: a test that reached the real gate would
            // run the real E2E suite inside a synchronous spawn that the test timeout cannot stop.
            for (const name of Object.keys(stubs)) {
                const found = spawnSync('sh', ['-c', `command -v ${name}`], { env: stubEnv(), encoding: 'utf8' });
                if (!found.stdout.trim().endsWith(`${path.basename(bin)}/${name}`)) {
                    throw new Error(`sh resolves ${name} to ${JSON.stringify(found.stdout.trim())}, not the stub`);
                }
            }
        });
        afterAll(() => {
            try {
                fs.rmSync(bin, { recursive: true, force: true });
            } catch {
                // a leaked temp dir is harmless
            }
        });

        // `sh -e`, as Husky runs a hook. `skip` is the SKIP value, set only when given.
        const runHook = ({ out = 'SKIP', exit = 0, ratchetExit = 0, skip } = {}) => {
            const env = {
                ...stubEnv(),
                STUB_OUT: out,
                STUB_EXIT: String(exit),
                RATCHET_EXIT: String(ratchetExit),
                EXPECT_STDIN: REFS,
            };
            delete env.SKIP;
            if (skip !== undefined) env.SKIP = skip;
            return spawnSync('sh', ['-e', '.husky/pre-push', 'origin', 'url'], {
                cwd: ROOT,
                env,
                input: `${REFS}\n`,
                encoding: 'utf8',
            });
        };

        it('skips E2E when the gate prints SKIP (control: the stubs reach the hook)', () => {
            const result = runHook({ out: 'SKIP' });
            expect(result.status).toBe(0);
            expect(result.stderr).toContain('STUB-GATE got the ref lines');
            expect(result.stdout).not.toContain('E2E-RAN');
        });

        it('gives the ratchet and then the gate the same ref lines (the stdin proof)', () => {
            const result = runHook({ out: 'SKIP' });
            expect(result.status).toBe(0);
            const ratchet = result.stderr.indexOf('STUB-RATCHET got the ref lines');
            const gate = result.stderr.indexOf('STUB-GATE got the ref lines');
            expect(ratchet).toBeGreaterThanOrEqual(0);
            expect(gate).toBeGreaterThan(ratchet);
        });

        it.each([
            ['RUN', 0],
            ['RUN', 1],
            ['SKIP', 1],
            ['', 0],
            ['RUN\nwarning: something', 0],
        ])('runs E2E when the gate prints %j and exits %i', (out, code) => {
            expect(runHook({ out, exit: code }).stdout).toContain('E2E-RAN playwright test');
        });

        it('stops the push when the ratchet refuses: neither the gate nor E2E runs', () => {
            const result = runHook({ ratchetExit: 1, out: 'RUN' });
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('ratchet failed');
            expect(result.stderr).toContain('SKIP=ratchet git push');
            expect(result.stderr).not.toContain('STUB-GATE');
            expect(result.stdout).not.toContain('E2E-RAN');
        });

        it('reports a missing ratchet command (exit 127) and stops the push', () => {
            const result = runHook({ ratchetExit: 127 });
            expect(result.status).toBe(127);
            expect(result.stderr).toContain('ratchet could not run — command not found (exit 127)');
            expect(result.stderr).not.toContain('STUB-GATE');
        });

        it('SKIP=ratchet waives only the ratchet, and the gate still gets the ref lines', () => {
            const result = runHook({ skip: 'ratchet' });
            expect(result.status).toBe(0);
            expect(result.stderr).not.toContain('STUB-RATCHET');
            expect(result.stderr).not.toContain('unknown SKIP token');
            expect(result.stderr).toContain('SKIP=ratchet — the ratchet check did NOT run');
            expect(result.stderr).toContain('STUB-GATE got the ref lines');
        });

        it('SKIP=e2e still runs the ratchet', () => {
            const result = runHook({ skip: 'e2e', out: 'RUN' });
            expect(result.stderr).toContain('STUB-RATCHET got the ref lines');
            expect(result.stderr).toContain('SKIP=e2e — the e2e check did NOT run');
            expect(result.stdout).not.toContain('E2E-RAN');
        });

        it('the stub hands any other node call to the real node', () => {
            const result = spawnSync('sh', ['-c', 'node -e "process.stdout.write(String(6*7))"'], {
                env: stubEnv(),
                encoding: 'utf8',
                timeout: 10_000,
            });
            expect(result.stdout).toBe('42');
        });

        // Any argument that names a script counts, not just the first: an option before it (`node --
        // scripts/…`, `node --no-warnings scripts/…`) must not slip through to the real node, which would run
        // the real ratchet and fetch from GitHub inside the unit suite.
        it.each([
            ['./scripts/check-line-ratchet.js', './scripts/check-line-ratchet.js'],
            ['-- scripts/check-line-ratchet.js', 'scripts/check-line-ratchet.js'],
            ['--no-warnings scripts/check-e2e-needed.js', 'scripts/check-e2e-needed.js'],
        ])('the stub fails loudly on `node %s`, instead of running the real script', (args, script) => {
            const result = spawnSync('sh', ['-c', `node ${args}`], {
                env: stubEnv(),
                encoding: 'utf8',
                timeout: 10_000,
            });
            expect(result.status).toBe(99);
            expect(result.stderr).toContain(`stub node: unexpected script ${script}`);
        });
    }
);

// The SKIP list is safe only while nothing that runs E2E loads a file on it: a change to that file
// alone would skip the suite that exercises it. This checks quoted literals that look like paths (no
// space or `:`; a leading `./` or `../`, or a `/` inside), including html `src`/`href` values. A
// relative one is resolved from the file's folder and from the repo root, the cwd of Playwright and
// `npm start`; any other is resolved from the root, as `path.join(__dirname, 'scripts/x.js')` in a
// root file is. Each resolved path is tried lower-cased (Windows matches either case, and every SKIP
// rule is lower-case), with `.js` added (an extensionless require) and as a folder (`'./scripts'`).
// Backslashes count as slashes. Not seen: a path built from separate parts
// (`path.join(__dirname, 'scripts', name)`).
const findSkipListImports = (files) => {
    const found = new Set();
    for (const file of files) {
        for (const m of file.source.matchAll(/(['"`])([^'"`\s:]+)\1/g)) {
            const spec = m[2].replace(/\\+/g, '/');
            const relative = /^\.\.?\//.test(spec);
            if (!relative && !spec.includes('/')) continue;
            const bases = relative ? [path.posix.dirname(file.path), '.'] : ['.'];
            const hit = bases
                .map((base) => path.posix.normalize(path.posix.join(base, spec)))
                .find((p) => {
                    const lc = p.toLowerCase();
                    return [lc, `${lc}.js`, `${lc}/x.js`].some((v) => !classifyPaths([v]));
                });
            if (hit) found.add(`${file.path} → ${hit}`);
        }
    }
    return [...found];
};

// Every tracked RUN-classified .js/.cjs/.mjs/.html file outside vendor/, with its index copy: inside the
// hook that is what the commit holds (`env` defaults to this process's, so git follows the hook's
// GIT_INDEX_FILE), and a file deleted on disk but not staged still has one. An entry with no stage-0
// blob (an unmerged path) is left out rather than failing the commit.
const readTrackedRunSources = (root, env = process.env) => {
    const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', env })
        .split('\0')
        .filter((p) => p && classifyPaths([p]) && /\.(c|m)?js$|\.html$/.test(p) && !p.startsWith('vendor/'));
    const out = execFileSync('git', ['cat-file', '--batch'], {
        cwd: root,
        env,
        input: paths.map((p) => `:${p}\n`).join(''),
        maxBuffer: 256 * 1024 * 1024,
    });
    const sources = [];
    let at = 0;
    for (const p of paths) {
        const eol = out.indexOf(10, at);
        const header = out.toString('utf8', at, eol); // `<sha> blob <size>`, or `:<path> missing`
        at = eol + 1;
        const blob = /^[0-9a-f]+ blob (\d+)$/.exec(header);
        if (!blob) continue;
        const size = Number(blob[1]);
        sources.push({ path: p, source: out.toString('utf8', at, at + size) });
        at += size + 1;
    }
    return sources;
};

describe('guard: nothing a RUN path loads is on the SKIP list', { timeout: 30_000 }, () => {
    // One planted literal per form the helper resolves; each row is the only one its check catches.
    it('flags a planted import of a SKIP path in each form it resolves (control)', () => {
        expect(
            findSkipListImports([
                { path: 'tests/e2e/a.test.js', source: "const x = require('../../scripts/x.js');" },
                { path: 'index.html', source: '<script src="scripts/x.js"></script>' },
                { path: 'main.js', source: "path.join(__dirname, './scripts')" },
                { path: 'tests/e2e/b.test.js', source: "require('../hash-pool-harness.js')" },
                { path: 'tests/e2e/c.test.js', source: 'require(`../../docs/y.js`)' },
                { path: 'tests/e2e/d.test.js', source: "require('../feature-cache-harness')" },
                { path: 'tests/e2e/e.test.js', source: String.raw`require('..\\..\\.claude\\z.js')` },
                { path: 'tests/e2e/f.test.js', source: "require('../../Prototypes/w.js')" },
                { path: 'tests/e2e/g.test.js', source: "fs.readFileSync('./tests/integration/x.json')" },
                { path: 'app-protocol.js', source: "path.join(__dirname, '.husky/v')" },
            ])
        ).toEqual([
            'tests/e2e/a.test.js → scripts/x.js',
            'index.html → scripts/x.js',
            'main.js → scripts',
            'tests/e2e/b.test.js → tests/hash-pool-harness.js',
            'tests/e2e/c.test.js → docs/y.js',
            'tests/e2e/d.test.js → tests/feature-cache-harness',
            'tests/e2e/e.test.js → .claude/z.js',
            'tests/e2e/f.test.js → Prototypes/w.js',
            'tests/e2e/g.test.js → tests/integration/x.json',
            'app-protocol.js → .husky/v',
        ]);
    });

    it('reads tracked files from the index, so one deleted on disk but not staged cannot fail it', () => {
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-guard-'));
        try {
            git(repo, 'init', '-q');
            fs.writeFileSync(path.join(repo, 'gone.js'), 'module.exports = 1;\n');
            fs.writeFileSync(path.join(repo, 'main.js'), "require('./app.js');\n");
            git(repo, 'add', '-A');
            fs.rmSync(path.join(repo, 'gone.js'));
            fs.writeFileSync(path.join(repo, 'main.js'), 'an unstaged edit\n');
            expect(readTrackedRunSources(repo, gitEnv())).toEqual([
                { path: 'gone.js', source: 'module.exports = 1;\n' },
                { path: 'main.js', source: "require('./app.js');\n" },
            ]);
        } finally {
            try {
                fs.rmSync(repo, { recursive: true, force: true });
            } catch {
                // Windows can briefly hold a .git pack handle; a leaked temp dir is harmless.
            }
        }
    });

    it('no tracked RUN file names a SKIP path in a literal the helper resolves', () => {
        const files = readTrackedRunSources(fileURLToPath(new URL('..', import.meta.url)));
        expect(files.length).toBeGreaterThan(20);
        expect(findSkipListImports(files)).toEqual([]);
    });

    // `UNIT_TEST` and `tests/integration/` may skip only because Playwright collects nothing outside
    // tests/e2e/: a second `testDir` (a project's own) or a wider one would make them E2E tests.
    it('Playwright collects tests from tests/e2e/ only', () => {
        const config = fs.readFileSync(new URL('../playwright.config.js', import.meta.url), 'utf8');
        expect(config.match(/testDir/g)).toHaveLength(1);
        expect(config).toMatch(/^\s*testDir: '\.\/tests\/e2e',$/m);
    });
});
