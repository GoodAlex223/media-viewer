import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SCRIPT = require.resolve('../scripts/check-claude-md-size.js');
const { measure, evaluate, formatWarning, GROWTH_WARN_BYTES, BYTE_TRIGGER } = require(SCRIPT);
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIMITS = { growthWarnBytes: 500, byteTrigger: 10000 };
const size = (bytes, lines = 0) => ({ bytes, lines });

describe('measure', () => {
    it('counts lines the way wc -l does (newline characters)', () => {
        expect(measure('a\nb\n')).toEqual({ lines: 2, bytes: 4 });
    });

    it('does not count a last line that has no newline', () => {
        expect(measure('a\nb')).toEqual({ lines: 1, bytes: 3 });
    });

    it('counts UTF-8 bytes, not characters', () => {
        // '→' is 3 bytes and '🔵' is 4.
        expect(measure('→🔵\n')).toEqual({ lines: 1, bytes: 8 });
    });

    it('treats empty or missing text as zero', () => {
        expect(measure('')).toEqual({ lines: 0, bytes: 0 });
        expect(measure(undefined)).toEqual({ lines: 0, bytes: 0 });
    });
});

describe('evaluate', () => {
    it('does not warn at exactly the growth limit', () => {
        expect(evaluate(size(1000), size(1500), LIMITS)).toEqual([]);
    });

    it('warns one byte past the growth limit', () => {
        expect(evaluate(size(1000), size(1501), LIMITS)).toEqual(['growth']);
    });

    it('does not warn when growth ends exactly at the byte trigger', () => {
        expect(evaluate(size(9999), size(10000), LIMITS)).toEqual([]);
    });

    it('warns on any growth past the byte trigger', () => {
        expect(evaluate(size(10000), size(10001), LIMITS)).toEqual(['trigger']);
    });

    it('reports both when a large commit also crosses the trigger', () => {
        expect(evaluate(size(9800), size(10400), LIMITS)).toEqual(['growth', 'trigger']);
    });

    it('never warns on a shrink, even past the trigger', () => {
        expect(evaluate(size(12000), size(11000), LIMITS)).toEqual([]);
    });

    it('never warns when the size is unchanged, even past the trigger', () => {
        expect(evaluate(size(20000), size(20000), LIMITS)).toEqual([]);
    });

    it('measures net growth only: a commit that adds 800 bytes and removes 900 is silent', () => {
        expect(evaluate(size(5000), size(4900), LIMITS)).toEqual([]);
    });

    it('ignores a line-count rise when no byte limit is crossed', () => {
        expect(evaluate(size(1000, 10), size(1100, 60), LIMITS)).toEqual([]);
    });

    it('measures a missing HEAD copy as empty', () => {
        expect(evaluate(measure(''), size(600), LIMITS)).toEqual(['growth']);
    });
});

describe('formatWarning', () => {
    it('returns an empty string when there is nothing to warn about', () => {
        expect(formatWarning(size(1000), size(1100), [], LIMITS)).toBe('');
    });

    it('names the growth and the totals, and points to the authoring rule without restating it', () => {
        const msg = formatWarning(size(1000, 10), size(1501, 12), ['growth'], LIMITS);
        expect(msg).toContain('+501 bytes (+2 lines)');
        expect(msg).toContain('now 12 lines / 1501 bytes');
        expect(msg).toContain('more than 500 bytes in one commit');
        expect(msg).toContain('the authoring rule in CLAUDE.md § Maintenance');
        expect(msg).not.toContain('one sentence plus'); // one home: a copy here would drift from § Maintenance
        expect(msg).toContain('A warning only');
        expect(msg).not.toContain('audit trigger');
    });

    it('says the file is due for an audit past the trigger', () => {
        const msg = formatWarning(size(10000), size(10001), ['trigger'], LIMITS);
        expect(msg).toContain('past its 10000-byte audit trigger');
        expect(msg).toContain('CLAUDE.md § Maintenance');
        expect(msg).not.toContain('in one commit');
    });

    it('signs a falling line count', () => {
        expect(formatWarning(size(1000, 20), size(1600, 17), ['growth'], LIMITS)).toContain('(-3 lines)');
    });
});

describe('the figures', () => {
    it('warns on growth past 500 bytes (spec § 6.2)', () => {
        expect(GROWTH_WARN_BYTES).toBe(500);
    });

    it('has a byte trigger that is a positive multiple of 1,000', () => {
        expect(BYTE_TRIGGER).toBeGreaterThan(0);
        expect(BYTE_TRIGGER % 1000).toBe(0);
    });
});

// Spawns git and node per test: the default 5 s timeout fails under load, as check-secrets.test.js's
// real-git tests do (BACKLOG 🟤 [2026-10-11] "Raise the 5 s timeout…").
describe('CLI: never blocks a commit', { timeout: 30_000 }, () => {
    let dir;

    // Vitest runs inside the pre-commit hook, where git can export these. The script's own git
    // calls would then read the real commit's index instead of the temp repo's.
    const env = { ...process.env };
    delete env.GIT_DIR;
    delete env.GIT_INDEX_FILE;
    delete env.GIT_WORK_TREE;
    // Identity and config through the environment, not four `git config` processes per test: this
    // suite runs in every pre-commit, and process spawns are nearly all of its time.
    Object.assign(env, {
        GIT_AUTHOR_NAME: 'G5 Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'G5 Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'core.autocrlf',
        GIT_CONFIG_VALUE_0: 'false',
        GIT_CONFIG_KEY_1: 'commit.gpgsign',
        GIT_CONFIG_VALUE_1: 'false',
    });
    const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env });
    const run = (extraEnv = {}, cwd = dir) =>
        spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', env: { ...env, ...extraEnv } });
    const write = (text) => fs.writeFileSync(path.join(dir, 'CLAUDE.md'), text);

    const initRepo = () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-size-'));
        git(['init', '--quiet']);
    };

    const commitBase = () => {
        write('# Rules\n');
        git(['add', 'CLAUDE.md']);
        git(['commit', '--quiet', '-m', 'init']);
    };

    afterEach(() => {
        if (dir) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch {
                // Windows can briefly hold a .git pack handle; a leaked temp dir is harmless.
            }
            dir = undefined;
        }
    });

    // Run from a subdirectory: a cwd-relative pathspec found nothing there and printed nothing,
    // which reads as a pass (PR #82 review #3). The first-commit test below runs from the root.
    it('warns on a staged growth past 500 bytes when run from a subdirectory, and exits 0', () => {
        initRepo();
        commitBase();
        write('# Rules\n' + 'x'.repeat(600) + '\n');
        git(['add', 'CLAUDE.md']);
        const sub = path.join(dir, 'docs');
        fs.mkdirSync(sub);
        const r = run({}, sub);
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('more than 500 bytes in one commit');
    });

    it('is silent when CLAUDE.md changed but is not staged', () => {
        initRepo();
        commitBase();
        write('# Rules\n' + 'x'.repeat(600) + '\n');
        const r = run();
        expect(r.status).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('is silent when CLAUDE.md is staged for deletion', () => {
        initRepo();
        commitBase();
        git(['rm', '--quiet', 'CLAUDE.md']);
        const r = run();
        expect(r.status).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('measures a first commit against an empty HEAD', () => {
        initRepo();
        write('x'.repeat(600) + '\n');
        git(['add', 'CLAUDE.md']);
        const r = run();
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('+601 bytes');
    });

    it('says it could not measure outside a git repository, and still exits 0', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-size-norepo-'));
        const r = run({ GIT_CEILING_DIRECTORIES: path.dirname(dir) });
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('could not measure CLAUDE.md');
    });
});
