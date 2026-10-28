import { describe, it, expect, afterEach } from 'vitest';
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

    it('returns true (run) when any path is a JS source file', () => {
        expect(classifyPaths(['docs/planning/WEEKLY.md', 'media-viewer.js'])).toBe(true);
    });

    it('returns true (run) for config/html/css runtime paths', () => {
        expect(classifyPaths(['index.html'])).toBe(true);
        expect(classifyPaths(['styles.css'])).toBe(true);
        expect(classifyPaths(['package.json'])).toBe(true);
        expect(classifyPaths(['tests/e2e/navigation.test.js'])).toBe(true);
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

// The CLI against a throwaway repo: what `git diff` lists for a moved file, which no pure test can show.
describe('CLI on a real repo', { timeout: 30_000 }, () => {
    const SCRIPT = fileURLToPath(new URL('../scripts/check-e2e-needed.js', import.meta.url));
    const repos = [];

    const git = (repo, ...args) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
            cwd: repo,
            encoding: 'utf8',
        }).trim();
    const commit = (repo, message) => {
        git(repo, 'add', '-A');
        git(repo, 'commit', '-qm', message);
        return git(repo, 'rev-parse', 'HEAD');
    };
    const makeRepo = () => {
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-e2e-gate-'));
        repos.push(repo);
        git(repo, 'init', '-q');
        fs.mkdirSync(path.join(repo, 'scripts'));
        fs.mkdirSync(path.join(repo, 'docs'));
        fs.writeFileSync(path.join(repo, 'main.js'), "console.log('app');\nmodule.exports = {};\n");
        fs.writeFileSync(path.join(repo, 'scripts', 'a.js'), "console.log('a');\n");
        fs.writeFileSync(path.join(repo, 'docs', 'a.md'), '# A\n');
        return { repo, base: commit(repo, 'base') };
    };
    // A non-zero remote SHA makes the CLI diff against it, so the repo needs no `origin`.
    const decide = (repo, base, head) =>
        spawnSync(process.execPath, [SCRIPT], {
            cwd: repo,
            input: `refs/heads/x ${head} refs/heads/x ${base}\n`,
            encoding: 'utf8',
        });

    afterEach(() => {
        for (const dir of repos.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('prints SKIP for a push that changes only scripts/ (control: the CLI can skip)', () => {
        const { repo, base } = makeRepo();
        fs.appendFileSync(path.join(repo, 'scripts', 'a.js'), "console.log('b');\n");
        const result = decide(repo, base, commit(repo, 'edit a script'));
        expect(result.stdout).toBe('SKIP');
        expect(result.stderr).toContain('skipping E2E');
    });

    it('prints RUN when a runtime file moves into scripts/', () => {
        const { repo, base } = makeRepo();
        git(repo, 'mv', 'main.js', 'scripts/main.js');
        expect(decide(repo, base, commit(repo, 'move main into scripts')).stdout).toBe('RUN');
    });

    it('prints RUN when a runtime file moves into docs/', () => {
        const { repo, base } = makeRepo();
        git(repo, 'mv', 'main.js', 'docs/main.js');
        expect(decide(repo, base, commit(repo, 'move main into docs')).stdout).toBe('RUN');
    });
});
