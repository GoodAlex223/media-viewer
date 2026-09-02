import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    extractLinks,
    findUnindexed,
    findBrokenTargets,
    stripCode,
    selectIndexedFiles,
} = require('../scripts/check-docs-index.js');

describe('stripCode', () => {
    it('removes a fenced block', () => {
        expect(stripCode('a\n```\nhidden\n```\nb')).not.toContain('hidden');
    });

    it('removes a tilde-fenced block', () => {
        expect(stripCode('a\n~~~\nhidden\n~~~\nb')).not.toContain('hidden');
    });

    it('removes a fenced block with an info string', () => {
        expect(stripCode('a\n```bash\nhidden\n```\nb')).not.toContain('hidden');
    });

    it('removes an inline code span', () => {
        expect(stripCode('use `hidden` here')).not.toContain('hidden');
    });

    it('removes a double-backtick span', () => {
        expect(stripCode('use ``hid`den`` here')).not.toContain('hid');
    });

    it('keeps ordinary prose and links intact', () => {
        expect(stripCode('see [a](b.md) now')).toContain('[a](b.md)');
    });

    it('leaves an unterminated fence stripped to end of document', () => {
        // Safer to drop the tail than to parse a half-open fence as live links.
        expect(stripCode('a\n```\nhidden')).not.toContain('hidden');
    });
});

describe('extractLinks', () => {
    it('extracts a reference-style link definition', () => {
        expect(extractLinks('[Tournament Mode]: archive/plans/2026-05-25_tournament.md\n')).toEqual([
            { label: 'Tournament Mode', target: 'archive/plans/2026-05-25_tournament.md' },
        ]);
    });

    it('extracts an inline link', () => {
        expect(extractLinks('| [TODO.md](planning/TODO.md) | Active tasks |\n')).toEqual([
            { label: 'TODO.md', target: 'planning/TODO.md' },
        ]);
    });

    it('extracts both styles from one document', () => {
        const md = [
            '| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture |',
            '',
            '[Sorting Cache]: archive/plans/2025-12-27_sorting-cache.md',
        ].join('\n');
        expect(extractLinks(md).map((l) => l.target)).toEqual([
            'ARCHITECTURE.md',
            'archive/plans/2025-12-27_sorting-cache.md',
        ]);
    });

    it('extracts an inline link carrying a title', () => {
        expect(extractLinks('[a](archive/plans/x.md "The Title")')).toEqual([
            { label: 'a', target: 'archive/plans/x.md' },
        ]);
    });

    it('extracts a reference definition carrying a title', () => {
        expect(extractLinks('[a]: archive/plans/x.md "The Title"\n')).toEqual([
            { label: 'a', target: 'archive/plans/x.md' },
        ]);
    });

    it('extracts an angle-bracket target', () => {
        expect(extractLinks('[a](<archive/plans/has space.md>)')).toEqual([
            { label: 'a', target: 'archive/plans/has space.md' },
        ]);
    });

    it('extracts a link whose label contains brackets', () => {
        expect(extractLinks('[a [b] c](archive/plans/x.md)')).toEqual([
            { label: 'a [b] c', target: 'archive/plans/x.md' },
        ]);
    });

    it('ignores a link inside a fenced code block', () => {
        // The false NEGATIVE this prevents matters most: a plan "indexed" only by an
        // illustrative snippet would otherwise pass the guard.
        expect(extractLinks('```\n[Fake]: archive/plans/nope.md\n```\n')).toEqual([]);
    });

    it('ignores a link inside an inline code span', () => {
        expect(extractLinks('use `[x](archive/plans/nope.md)` here')).toEqual([]);
    });

    it('ignores absolute URLs and mailto targets', () => {
        const md = '[repo](https://example.com/x.md)\n[docs](http://example.com)\n[mail](mailto:a@b.c)\n';
        expect(extractLinks(md)).toEqual([]);
    });

    it('ignores pure-anchor targets', () => {
        expect(extractLinks('[Back to top](#documentation-index)\n')).toEqual([]);
    });

    it('strips an anchor fragment from a file target', () => {
        expect(extractLinks('[Rules](planning/BACKLOG.md#process-rules)\n')).toEqual([
            { label: 'Rules', target: 'planning/BACKLOG.md' },
        ]);
    });

    it('strips a leading ./ from a target', () => {
        expect(extractLinks('[Plan]: ./archive/plans/x.md\n')[0].target).toBe('archive/plans/x.md');
    });

    it('does not treat a collapsed reference usage as a definition', () => {
        expect(extractLinks('| [Sorting Cache][] | Cache sorting results |\n')).toEqual([]);
    });

    it('does not treat an indented colon line as a definition', () => {
        expect(extractLinks('    [Not A Def]: archive/plans/x.md\n')).toEqual([]);
    });

    it('tolerates CRLF line endings', () => {
        expect(extractLinks('[Plan]: archive/plans/x.md\r\n')[0].target).toBe('archive/plans/x.md');
    });

    it('returns [] for empty or non-string input', () => {
        expect(extractLinks('')).toEqual([]);
        expect(extractLinks(null)).toEqual([]);
    });
});

describe('selectIndexedFiles', () => {
    const DIRS = ['archive/plans', 'superpowers/specs'];

    it('keeps .md files under the indexed directories, made docs-relative', () => {
        const tracked = ['docs/archive/plans/a.md', 'docs/superpowers/specs/b-design.md', 'media-viewer.js'];
        expect(selectIndexedFiles(tracked, DIRS)).toEqual(['archive/plans/a.md', 'superpowers/specs/b-design.md']);
    });

    it('excludes non-markdown files', () => {
        expect(selectIndexedFiles(['docs/archive/plans/notes.txt'], DIRS)).toEqual([]);
    });

    it('excludes README.md in any case form', () => {
        const tracked = ['docs/archive/plans/README.md', 'docs/archive/plans/readme.md'];
        expect(selectIndexedFiles(tracked, DIRS)).toEqual([]);
    });

    it('excludes files in sibling directories that merely share a prefix', () => {
        // `archive/plans-old/` must not be swept in by a naive startsWith.
        expect(selectIndexedFiles(['docs/archive/plans-old/a.md'], DIRS)).toEqual([]);
    });

    it('excludes nested paths deeper than the indexed directory', () => {
        expect(selectIndexedFiles(['docs/archive/plans/sub/a.md'], DIRS)).toEqual([]);
    });

    it('normalizes backslash separators', () => {
        expect(selectIndexedFiles(['docs\\archive\\plans\\a.md'], DIRS)).toEqual(['archive/plans/a.md']);
    });

    it('returns [] for an empty tracked list', () => {
        expect(selectIndexedFiles([], DIRS)).toEqual([]);
    });
});

describe('findUnindexed', () => {
    const links = [
        { label: 'A', target: 'archive/plans/a.md' },
        { label: 'B', target: 'superpowers/specs/b-design.md' },
    ];

    it('returns paths that no link targets', () => {
        expect(findUnindexed(links, ['archive/plans/a.md', 'archive/plans/c.md'])).toEqual(['archive/plans/c.md']);
    });

    it('returns [] when every path is indexed', () => {
        expect(findUnindexed(links, ['archive/plans/a.md', 'superpowers/specs/b-design.md'])).toEqual([]);
    });

    it('matches on the full relative path, not the basename', () => {
        // The dead `2025-12-29_video-fullscreen-toggle` row is exactly this case: the basename
        // is mentioned, but only via a path the file does not live at. That is NOT indexed.
        const stale = [{ label: 'Video Fullscreen Toggle', target: 'planning/plans/vft.md' }];
        expect(findUnindexed(stale, ['archive/plans/vft.md'])).toEqual(['archive/plans/vft.md']);
    });

    it('normalizes backslash separators before comparing', () => {
        expect(findUnindexed(links, ['archive\\plans\\a.md'])).toEqual([]);
    });

    it('returns [] for an empty file list', () => {
        expect(findUnindexed(links, [])).toEqual([]);
    });

    it('reports every path when there are no links at all', () => {
        expect(findUnindexed([], ['archive/plans/a.md'])).toEqual(['archive/plans/a.md']);
    });
});

describe('findBrokenTargets', () => {
    const exists = (t) => t === 'archive/plans/real.md';

    it('flags a target that does not resolve', () => {
        const links = [
            { label: 'Real', target: 'archive/plans/real.md' },
            { label: 'Dead', target: 'planning/plans/gone.md' },
        ];
        expect(findBrokenTargets(links, exists)).toEqual([{ label: 'Dead', target: 'planning/plans/gone.md' }]);
    });

    it('returns [] when every target resolves', () => {
        expect(findBrokenTargets([{ label: 'Real', target: 'archive/plans/real.md' }], exists)).toEqual([]);
    });

    it('reports a duplicated dead target once per link definition', () => {
        const links = [
            { label: 'Dead A', target: 'planning/plans/gone.md' },
            { label: 'Dead B', target: 'planning/plans/gone.md' },
        ];
        expect(findBrokenTargets(links, exists)).toHaveLength(2);
    });

    it('returns [] for an empty link list', () => {
        expect(findBrokenTargets([], exists)).toEqual([]);
    });
});
