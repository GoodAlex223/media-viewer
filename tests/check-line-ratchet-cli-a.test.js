import { describe, it, expect } from 'vitest';
import { ZEROS, R, C, body, ceiling, useRatchetRepo } from './ratchet-repo-harness.js';

// The CLI on a real repo with a local origin, part A: the ceiling rules across a merge (planted cases 1–5),
// every ref of a push, a symlinked renderer, and a local ref with spaces. See ratchet-repo-harness.js.
describe('CLI on a real repo with a local origin (A)', { timeout: 120_000 }, () => {
    const repo = useRatchetRepo();

    it('case 1: refuses a branch over the ceiling', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { [R]: body(101) }, 'tip');
        const r = repo.run([repo.branch(tip)]);
        repo.expectRefused(
            r,
            'media-viewer.js 101 lines, ceiling 100',
            'over by 1',
            'shrink media-viewer.js',
            'raise the ceiling in scripts/renderer-line-ceiling.txt'
        );
        // The hook's check_failed names the SKIP token, so the check does not print it a second time.
        expect(r.stderr).not.toContain('SKIP=');
    });

    it('case 2: passes a stale branch that did not touch the renderer', () => {
        const s = repo.staleMain();
        const tip = repo.commit(s, { 'docs/a.md': 'a\n' }, 'tip');
        repo.expectPassed(repo.run([repo.branch(tip)]), 'media-viewer.js 90 lines, ceiling 90', 'at the ceiling');
    });

    it('case 3: refuses a stale branch that grew the renderer by 3', () => {
        const s = repo.staleMain();
        const tip = repo.commit(s, { [R]: body(100) + body(3, { tag: 'extra' }) }, 'tip');
        repo.expectRefused(repo.run([repo.branch(tip)]), 'media-viewer.js 93 lines, ceiling 90', 'over by 3');
    });

    it('case 4a: passes a branch that raises the ceiling and grows to it', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { [R]: body(105), [C]: ceiling(105) }, 'tip');
        repo.expectPassed(repo.run([repo.branch(tip)]), 'media-viewer.js 105 lines, ceiling 105');
    });

    it('case 4b: passes the same raise pushed to main', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { [R]: body(105), [C]: ceiling(105) }, 'tip');
        repo.expectPassed(
            repo.run([`refs/heads/feature ${tip} refs/heads/main ${b}`]),
            'refs/heads/main: media-viewer.js 105 lines, ceiling 105'
        );
    });

    it('case 5: refuses when both sides changed the ceiling to different values', () => {
        const b = repo.commit(null, { [R]: body(100), [C]: ceiling(100) }, 'base');
        repo.publishMain(repo.commit(b, { [R]: body(95, { from: 6 }), [C]: ceiling(95) }, 'main moves'));
        const tip = repo.commit(b, { [R]: body(100) + body(2, { tag: 'extra' }), [C]: ceiling(110) }, 'tip');
        const r = repo.run([repo.branch(tip)]);
        repo.expectRefused(r, 'scripts/renderer-line-ceiling.txt conflicts with origin/main — merge origin/main first');
        // Shrinking or raising does not resolve a conflict, so the check does not advise either.
        expect(r.stderr).not.toContain('shrink');
        expect(r.stderr).not.toContain('SKIP=');
    });

    it('row 11: measures every ref and refuses the push when one is over', () => {
        const b = repo.baseMain();
        const ok = repo.commit(b, { 'docs/a.md': 'a\n' }, 'ok');
        const big = repo.commit(b, { [R]: body(101) }, 'big');
        repo.expectRefused(
            repo.run([repo.branch(ok, 'refs/heads/ok'), repo.branch(big, 'refs/heads/big')]),
            'refs/heads/ok: media-viewer.js 100 lines, ceiling 100',
            'refs/heads/big: media-viewer.js 101 lines, ceiling 100'
        );
    });

    it('row 16: refuses a renderer that is a symlink instead of measuring its link text', () => {
        const b = repo.baseMain();
        const tip = repo.commitSymlink(b, R, 'elsewhere.js', 'tip');
        repo.expectRefused(repo.run([repo.branch(tip)]), 'cannot measure', 'media-viewer.js is not a regular file');
    });

    it('row 18: measures a push whose local ref is an expression with spaces', () => {
        const b = repo.baseMain();
        const tip = repo.commit(b, { 'docs/a.md': 'a\n' }, 'tip');
        repo.expectPassed(
            repo.run([`HEAD^{/fix the bug} ${tip} refs/heads/feature ${ZEROS}`]),
            'media-viewer.js 100 lines, ceiling 100'
        );
    });
});
