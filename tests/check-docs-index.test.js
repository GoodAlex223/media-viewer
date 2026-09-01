import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extractLinks, findUnindexed, findBrokenTargets } = require('../scripts/check-docs-index.js');

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
        // `[Label][]` inside a table cell is a usage, not a definition — it carries no target.
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
