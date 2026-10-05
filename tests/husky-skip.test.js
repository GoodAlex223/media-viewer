import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shAvailable = spawnSync('sh', ['-c', 'exit 0']).status === 0;

// Source .husky/skip.sh in a fresh sh and run `script` against a given SKIP value.
function runSkip(script, skipValue) {
    const env = { ...process.env, HOOK_NAME: 'test-hook' };
    delete env.SKIP;
    if (skipValue !== undefined) {
        env.SKIP = skipValue;
    }
    return spawnSync('sh', ['-c', `. ./.husky/skip.sh; ${script}`], { cwd: ROOT, env, encoding: 'utf8' });
}
const verdict = (token, skipValue) =>
    runSkip(`if skipped ${token}; then echo SKIPPED; else echo RAN; fi`, skipValue).stdout.trim();

describe.skipIf(!shAvailable)('.husky/skip.sh (needs sh on PATH — Git Bash on Windows)', () => {
    it('runs every check when SKIP is unset or empty', () => {
        expect(verdict('secrets')).toBe('RAN');
        expect(verdict('secrets', '')).toBe('RAN');
    });

    it('skips an exactly named check and warns on stderr every time', () => {
        const result = runSkip('skipped secrets && echo SKIPPED', 'secrets');
        expect(result.stdout.trim()).toBe('SKIPPED');
        expect(result.stderr).toContain('test-hook: SKIP=secrets — the secrets check did NOT run');
    });

    it('accepts a comma-separated list with spaces', () => {
        expect(verdict('secrets', 'docs-index, secrets')).toBe('SKIPPED');
        expect(verdict('docs-index', 'docs-index, secrets')).toBe('SKIPPED');
        expect(verdict('vitest', 'docs-index, secrets')).toBe('RAN');
    });

    it('matches whole tokens only — never a prefix, a longer token, or another case', () => {
        expect(verdict('docs-index', 'docs')).toBe('RAN');
        expect(verdict('secrets', 'secrets-x')).toBe('RAN');
        expect(verdict('secrets', 'SECRETS')).toBe('RAN');
    });

    it('check_skip_tokens warns about each unknown token and names the known ones', () => {
        const result = runSkip('check_skip_tokens "secrets vitest"', 'secret,vitest,SECRETS');
        expect(result.stderr).toContain("unknown SKIP token 'secret' — this hook's checks are: secrets vitest");
        expect(result.stderr).toContain("unknown SKIP token 'SECRETS'");
        expect(result.stderr).not.toContain("'vitest'");
    });

    it('check_skip_tokens is silent when every token is known, and does not glob-expand', () => {
        expect(runSkip('check_skip_tokens "secrets vitest"', 'vitest').stderr).toBe('');
        const globbed = runSkip('check_skip_tokens "secrets"', '*');
        expect(globbed.stderr).toContain("unknown SKIP token '*'");
        expect(globbed.stderr).not.toContain('package.json');
    });
});
