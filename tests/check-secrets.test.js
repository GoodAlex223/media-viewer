import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { scanForSecrets, extractAddedLines } = require('../scripts/check-secrets.js');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Real-shape sample tokens, assembled at runtime so no literal secret
// sits in this file (would otherwise be flagged by the guard scanning itself).
const SAMPLES = {
    aws: 'AKIA' + 'ABCDEFGHIJKLMNOP', // AKIA + 16 uppercase/digits
    github: 'ghp_' + 'a'.repeat(36),
    githubFamily: 'ghs_' + 'B'.repeat(36),
    slack: 'xoxb-' + '1'.repeat(20),
    google: 'AIza' + 'a'.repeat(35),
    // Split mid-"PRIVATE" so no full-shape literal sits on disk (would otherwise
    // be a real match for the private-key pattern when the guard scans this file).
    privKey: '-----BEGIN OPENSSH PRIV' + 'ATE KEY-----',
    privKeyPlain: '-----BEGIN PRIV' + 'ATE KEY-----',
};

describe('scanForSecrets — positive detection', () => {
    it('detects an AWS access key ID', () => {
        const hits = scanForSecrets(`const k = "${SAMPLES.aws}";`);
        expect(hits.map((h) => h.pattern)).toContain('AWS access key ID');
    });
    it('detects a GitHub token (ghp_)', () => {
        expect(scanForSecrets(SAMPLES.github).map((h) => h.pattern)).toContain('GitHub token');
    });
    it('detects the broader GitHub token family (ghs_)', () => {
        expect(scanForSecrets(SAMPLES.githubFamily).map((h) => h.pattern)).toContain('GitHub token');
    });
    it('detects a Slack token', () => {
        expect(scanForSecrets(SAMPLES.slack).map((h) => h.pattern)).toContain('Slack token');
    });
    it('detects a Google API key', () => {
        expect(scanForSecrets(SAMPLES.google).map((h) => h.pattern)).toContain('Google API key');
    });
    it('detects a private key block (OPENSSH)', () => {
        expect(scanForSecrets(SAMPLES.privKey).map((h) => h.pattern)).toContain('Private key block');
    });
    it('detects a plain private key block', () => {
        expect(scanForSecrets(SAMPLES.privKeyPlain).map((h) => h.pattern)).toContain('Private key block');
    });
    it('returns the matched substring in `match`', () => {
        const [hit] = scanForSecrets(SAMPLES.github);
        expect(hit.match).toBe(SAMPLES.github);
    });
});

describe('scanForSecrets — false positives (must NOT match)', () => {
    it('ignores bare marker prefixes in prose', () => {
        const prose = 'The audit looks for AKIA, ghp_, xoxb-, AIza, and BEGIN PRIVATE KEY markers.';
        expect(scanForSecrets(prose)).toEqual([]);
    });
    it('ignores regex-source-style strings (prefix followed by a bracket class)', () => {
        const src = 'regex: /AKIA[0-9A-Z]{16}/ and /ghp_[A-Za-z0-9]{36}/';
        expect(scanForSecrets(src)).toEqual([]);
    });
    it('ignores an empty string', () => {
        expect(scanForSecrets('')).toEqual([]);
    });
    it('ignores ordinary code with no secrets', () => {
        expect(scanForSecrets('const total = a + b; // sum')).toEqual([]);
    });
});

describe('extractAddedLines — unified=0 diff parsing', () => {
    const diff = [
        'diff --git a/app.js b/app.js',
        'index 0000000..1111111 100644',
        '--- a/app.js',
        '+++ b/app.js',
        '@@ -0,0 +1,2 @@',
        '+const key = "value";',
        '+const other = 2;',
        '@@ -10,1 +12,1 @@',
        '-const removed = old;',
        '+const replaced = next;',
    ].join('\n');

    it('collects only added lines with correct paths', () => {
        const added = extractAddedLines(diff);
        expect(added.map((a) => a.text)).toEqual([
            'const key = "value";',
            'const other = 2;',
            'const replaced = next;',
        ]);
        expect(added.every((a) => a.file === 'app.js')).toBe(true);
    });

    it('assigns new-file line numbers from the hunk header', () => {
        const added = extractAddedLines(diff);
        expect(added.map((a) => a.line)).toEqual([1, 2, 12]);
    });

    it('ignores removed lines', () => {
        const added = extractAddedLines(diff);
        expect(added.some((a) => a.text.includes('removed'))).toBe(false);
    });

    it('skips binary hunks', () => {
        const bin = [
            'diff --git a/img.png b/img.png',
            '--- a/img.png',
            '+++ b/img.png',
            'Binary files a/img.png and b/img.png differ',
        ].join('\n');
        expect(extractAddedLines(bin)).toEqual([]);
    });

    it('returns [] for an empty diff', () => {
        expect(extractAddedLines('')).toEqual([]);
    });

    it('integrates with scanForSecrets to flag a planted key in added lines', () => {
        const planted = ['+++ b/config.js', '@@ -0,0 +1,1 @@', '+token = "ghp_' + 'a'.repeat(36) + '"'].join('\n');
        const findings = extractAddedLines(planted).flatMap((a) =>
            scanForSecrets(a.text).map((h) => ({ file: a.file, line: a.line, pattern: h.pattern }))
        );
        expect(findings).toEqual([{ file: 'config.js', line: 1, pattern: 'GitHub token' }]);
    });

    it('does not let a "\\ No newline at end of file" marker advance the line number', () => {
        // Real `git diff --unified=0` emits this marker between the -old and +new
        // lines of a no-trailing-newline replacement. It must not increment newLineNo,
        // or the added line that follows is reported one line too high.
        const noNewlineDiff = [
            '+++ b/f.txt',
            '@@ -1 +1 @@',
            '-old secret line',
            '\\ No newline at end of file',
            '+new secret line',
            '\\ No newline at end of file',
        ].join('\n');
        expect(extractAddedLines(noNewlineDiff)).toEqual([{ file: 'f.txt', line: 1, text: 'new secret line' }]);
    });
});

describe('extractAddedLines — real git diff output', () => {
    let repoDir;

    // These tests also run inside the pre-commit hook (a git-hook context). Git can export
    // GIT_DIR / GIT_INDEX_FILE to hook subprocesses, which would redirect init/add/diff away
    // from the temp repo despite `cwd`; strip them so git always resolves via the temp cwd.
    const gitEnv = { ...process.env };
    delete gitEnv.GIT_DIR;
    delete gitEnv.GIT_INDEX_FILE;
    const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', env: gitEnv });

    const initRepo = () => {
        repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-git-'));
        git(['init', '--quiet']);
        git(['config', 'user.email', 'test@example.com']);
        git(['config', 'user.name', 'CW-V Test']);
        git(['config', 'core.autocrlf', 'false']); // stable LF line-shapes on Windows
        git(['config', 'commit.gpgsign', 'false']);
    };

    const stagedDiff = () => git(['diff', '--cached', '--unified=0']);

    afterEach(() => {
        if (repoDir) {
            try {
                fs.rmSync(repoDir, { recursive: true, force: true });
            } catch {
                // Windows can briefly hold a .git pack handle; a leaked temp dir is harmless.
            }
            repoDir = undefined;
        }
    });

    it('parses a no-trailing-newline replacement (the "\\ No newline" marker)', () => {
        initRepo();
        fs.writeFileSync(path.join(repoDir, 'f.txt'), 'old secret line'); // no trailing \n
        git(['add', 'f.txt']);
        git(['commit', '--quiet', '-m', 'init']);
        fs.writeFileSync(path.join(repoDir, 'f.txt'), 'new secret line'); // no trailing \n
        git(['add', 'f.txt']);

        expect(extractAddedLines(stagedDiff())).toEqual([{ file: 'f.txt', line: 1, text: 'new secret line' }]);
    });

    it('attributes added lines to the correct file across a multi-file staged diff', () => {
        initRepo();
        fs.writeFileSync(path.join(repoDir, 'a.txt'), 'alpha one\nalpha two\n');
        fs.writeFileSync(path.join(repoDir, 'b.txt'), 'beta one\n');
        git(['add', 'a.txt', 'b.txt']);

        expect(extractAddedLines(stagedDiff())).toEqual([
            { file: 'a.txt', line: 1, text: 'alpha one' },
            { file: 'a.txt', line: 2, text: 'alpha two' },
            { file: 'b.txt', line: 1, text: 'beta one' },
        ]);
    });

    it('skips a staged binary file but still collects the following text file', () => {
        initRepo();
        // NUL bytes make git treat this as binary ("Binary files ... differ").
        fs.writeFileSync(path.join(repoDir, 'img.bin'), Buffer.from([0, 1, 2, 0, 3, 255]));
        fs.writeFileSync(path.join(repoDir, 'note.txt'), 'text secret line\n');
        git(['add', 'img.bin', 'note.txt']);

        expect(extractAddedLines(stagedDiff())).toEqual([{ file: 'note.txt', line: 1, text: 'text secret line' }]);
    });

    it('flags a planted key from real diff output (end-to-end through git)', () => {
        initRepo();
        const token = 'ghp_' + 'a'.repeat(36); // assembled — never a literal on disk
        fs.writeFileSync(path.join(repoDir, 'config.js'), `const t = "${token}";\n`);
        git(['add', 'config.js']);

        const findings = extractAddedLines(stagedDiff()).flatMap((a) =>
            scanForSecrets(a.text).map((h) => ({ file: a.file, line: a.line, pattern: h.pattern }))
        );
        expect(findings).toEqual([{ file: 'config.js', line: 1, pattern: 'GitHub token' }]);
    });
});
