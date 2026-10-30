import { describe, it, expect } from 'vitest';
import { R, C, body, ceiling, useRatchetRepo } from './ratchet-repo-harness.js';

// The CLI on a real repo with a local origin, part B: a push to main, conflicts, a change made on both
// sides, a main that is itself over its ceiling or has none, and unrelated histories (planted cases 6–8).
describe('CLI on a real repo with a local origin (B)', { timeout: 120_000 }, () => {
    const repo = useRatchetRepo();

    it('case 6a: refuses a push to main while the ceiling is above the count', () => {
        const l = repo.commit(null, { [R]: body(90), [C]: ceiling(95) }, 'lagging base');
        repo.publishMain(l);
        const tip = repo.commit(l, { 'docs/a.md': 'a\n' }, 'tip');
        const r = repo.run([`HEAD ${tip} refs/heads/main ${l}`]);
        repo.expectRefused(
            r,
            'media-viewer.js 90 lines, ceiling 95',
            'lower the ceiling to 90 in scripts/renderer-line-ceiling.txt'
        );
        // Shrinking or raising would widen the gap, so the check does not advise either.
        expect(r.stderr).not.toContain('shrink');
        expect(r.stderr).not.toContain('raise');
        expect(r.stderr).not.toContain('SKIP=');
    });

    it('case 6b: passes the same tip on a branch, with the reminder', () => {
        const l = repo.commit(null, { [R]: body(90), [C]: ceiling(95) }, 'lagging base');
        repo.publishMain(l);
        const tip = repo.commit(l, { 'docs/a.md': 'a\n' }, 'tip');
        repo.expectPassed(repo.run([repo.branch(tip)]), 'lower the ceiling to 90');
    });

    it('case 7: refuses when the renderer conflicts', () => {
        const b = repo.commit(null, { [R]: body(100), [C]: ceiling(110) }, 'base');
        repo.publishMain(repo.commit(b, { [R]: body(100).replace('line 50\n', 'main 50\n') }, 'main moves'));
        const tip = repo.commit(b, { [R]: body(100).replace('line 50\n', 'branch 50\n') }, 'tip');
        repo.expectRefused(
            repo.run([repo.branch(tip)]),
            'media-viewer.js conflicts with origin/main — merge origin/main first'
        );
    });

    it('case 8: counts a renderer change made on both sides once', () => {
        const b = repo.commit(null, { [R]: body(100), [C]: ceiling(105) }, 'base');
        const grown = body(100) + body(5, { tag: 'same' });
        repo.publishMain(repo.commit(b, { [R]: grown }, 'main grows'));
        const tip = repo.commit(b, { [R]: grown }, 'tip grows the same way');
        repo.expectPassed(repo.run([repo.branch(tip)]), 'media-viewer.js 105 lines, ceiling 105');
    });

    // A main that is over its own ceiling (two PRs that each fitted the slack, a SKIP, a web-UI commit)
    // must not blame a branch that adds nothing to it.
    describe('when origin/main is itself over its ceiling', () => {
        const overMain = () => {
            const m = repo.commit(null, { [R]: body(103), [C]: ceiling(100) }, 'main over its ceiling');
            repo.publishMain(m);
            return m;
        };

        it('row 14a: passes a branch that adds no lines, naming the real offender', () => {
            const m = overMain();
            const tip = repo.commit(m, { 'docs/a.md': 'a\n' }, 'tip');
            repo.expectPassed(
                repo.run([repo.branch(tip)]),
                'over by 3',
                'origin/main is itself over its ceiling (103 lines, ceiling 100)',
                'adds no lines'
            );
        });

        it('row 14b: refuses a branch that adds a line, and says main is over too', () => {
            const m = overMain();
            const tip = repo.commit(m, { [R]: body(104) }, 'tip');
            repo.expectRefused(
                repo.run([repo.branch(tip)]),
                'over by 4',
                'origin/main is itself over its ceiling (103 lines, ceiling 100)'
            );
        });

        it('row 14c: passes a branch that shrinks the renderer, though it is still over', () => {
            const m = overMain();
            const tip = repo.commit(m, { [R]: body(102) }, 'tip');
            repo.expectPassed(repo.run([repo.branch(tip)]), 'media-viewer.js 102 lines, ceiling 100', 'over by 2');
        });
    });

    it('row 15: passes, saying so, when origin/main has no ceiling file yet', () => {
        const m = repo.commit(null, { [R]: body(100) }, 'main before the ratchet');
        repo.publishMain(m);
        const tip = repo.commit(m, { 'docs/a.md': 'a\n' }, 'tip');
        const r = repo.run([repo.branch(tip)]);
        repo.expectPassed(r, 'origin/main has no scripts/renderer-line-ceiling.txt yet');
        expect(r.stderr).not.toContain('cannot measure');
    });

    it('row 17: measures a branch whose history shares nothing with main', () => {
        repo.baseMain();
        const tip = repo.commit(null, { 'docs/a.md': 'a\n' }, 'an orphan branch');
        repo.expectPassed(repo.run([repo.branch(tip)]), 'media-viewer.js 100 lines, ceiling 100');
    });
});
