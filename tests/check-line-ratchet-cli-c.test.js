import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ZEROS, S1, S2, R, C, body, ceiling, git, useRatchetRepo } from './ratchet-repo-harness.js';

// The CLI on a real repo with a local origin, part C: everything that fails closed (cases 9a–e), a push
// that selects nothing, a renderer over 1 MiB, and what the fetch leaves alone. See ratchet-repo-harness.js.
describe('CLI on a real repo with a local origin (C)', { timeout: 120_000 }, () => {
    const repo = useRatchetRepo();

    it('case 9a: refuses when origin is unreachable', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { 'docs/a.md': 'a\n' }, 'tip');
        const r = repo.withUnreachableOrigin(() => repo.run([repo.branch(tip)]));
        repo.expectRefused(r, 'cannot measure', 'could not fetch');
        expect(r.stderr).not.toContain('SKIP=');
    });

    it('case 9b: refuses an unresolvable tip', () => {
        repo.baseMain();
        repo.expectRefused(repo.run([repo.branch('c'.repeat(40))]), 'cannot measure', 'cannot resolve');
    });

    it('case 9c: refuses when the merge has no ceiling file', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { [C]: null }, 'tip');
        repo.expectRefused(
            repo.run([repo.branch(tip)]),
            'cannot measure',
            'scripts/renderer-line-ceiling.txt is missing'
        );
    });

    it('case 9d: refuses when the merge has no renderer', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { [R]: null }, 'tip');
        repo.expectRefused(repo.run([repo.branch(tip)]), 'cannot measure', 'media-viewer.js is missing');
    });

    it('case 9e: refuses a ceiling that does not parse', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { [C]: 'abc\n' }, 'tip');
        repo.expectRefused(
            repo.run([repo.branch(tip)]),
            'cannot measure',
            'scripts/renderer-line-ceiling.txt does not parse'
        );
    });

    it('row 10: passes without fetching when nothing is selected', () => {
        const r = repo.withUnreachableOrigin(() =>
            repo.run([`(delete) ${ZEROS} refs/heads/gone ${S2}`, `refs/tags/v1 ${S1} refs/tags/v1 ${ZEROS}`, ''])
        );
        expect(r.status, r.stderr).toBe(0);
        expect(r.stderr).not.toContain('cannot measure');
    });

    it('row 12: counts a renderer over 1 MiB', () => {
        expect(Buffer.byteLength(body(100000))).toBeGreaterThan(1024 * 1024);
        const b = repo.commit(null, { [R]: body(100000), [C]: ceiling(100000) }, 'big base');
        repo.publishMain(b);
        const tip = repo.commit(b, { 'docs/a.md': 'a\n' }, 'tip');
        repo.expectPassed(repo.run([repo.branch(tip)]), 'media-viewer.js 100000 lines, ceiling 100000');
    });

    // The user's own origin/main is the lease of a later `git push --force-with-lease origin main`, so a
    // hooked push of another branch must not move it, or write FETCH_HEAD.
    it('row 13: leaves refs/remotes/origin/main and FETCH_HEAD where they were', () => {
        const b = repo.baseMain();
        const old = repo.commit(null, { 'docs/old.md': 'x\n' }, 'what the user last fetched');
        git(repo.work, 'update-ref', 'refs/remotes/origin/main', old);
        const fetchHead = path.join(repo.work, '.git', 'FETCH_HEAD');
        fs.rmSync(fetchHead, { force: true });
        const tip = repo.commit(b, { 'docs/a.md': 'a\n' }, 'tip');

        repo.expectPassed(repo.run([repo.branch(tip)]), 'media-viewer.js 100 lines, ceiling 100');

        expect(git(repo.work, 'rev-parse', 'refs/remotes/origin/main')).toBe(old);
        expect(fs.existsSync(fetchHead)).toBe(false);
        expect(git(repo.work, 'rev-parse', 'refs/ratchet/origin-main')).toBe(b);
    });
});
