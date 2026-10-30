import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ZEROS, S1, S2, T, body } from './ratchet-repo-harness.js';

// The pure functions. The CLI on a real repo is in check-line-ratchet-cli-{a,b,c}.test.js.
const require = createRequire(import.meta.url);
// Loaded per call, so a missing module fails each row on its own instead of the whole file at collection.
const lib = () => require('../scripts/check-line-ratchet.js');

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
        ['\uFEFF11529\n', 11529],
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
        // git writes the source expression of `git push origin '<expr>:<ref>'` verbatim as the local ref.
        ['a local ref with spaces', line('HEAD^{/fix the bug}', S1, 'refs/heads/x', ZEROS), 'refs/heads/x'],
        // check-ref-format accepts a no-break space, which `\s` and trim() would treat as a separator.
        ['a remote ref with a no-break space', line('HEAD', S1, 'refs/heads/a b', ZEROS), 'refs/heads/a b'],
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

    it('keeps the spaces of a local ref in its field', () => {
        expect(lib().selectUpdates(line('HEAD^{/fix the bug}', S1, 'refs/heads/x', S2))[0].localRef).toBe(
            'HEAD^{/fix the bug}'
        );
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
