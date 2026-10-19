import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import vm from 'vm';

const require = createRequire(import.meta.url);
const {
    parseStoreDump,
    buildWriteScript,
    migrateStorage,
    READ_SCRIPT,
    MAX_KEYS,
    MAX_TOTAL_CHARS,
    MERGED_KEY,
} = require('../storage-migration.js');

// A localStorage stand-in for running the generated scripts in a vm context.
function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        map: m,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        key: (i) => [...m.keys()][i] ?? null,
        get length() {
            return m.size;
        },
    };
}
const run = (code, storage) => vm.runInNewContext(code, { localStorage: storage, Object });

describe('parseStoreDump', () => {
    it('accepts an array of string pairs', () => {
        expect(parseStoreDump('[["a","1"],["b","x"]]')).toEqual([
            ['a', '1'],
            ['b', 'x'],
        ]);
        expect(parseStoreDump('[]')).toEqual([]);
    });

    it.each([
        ['not JSON', '{'],
        ['not an array', '{"a":"1"}'],
        ['a non-pair', '[["a"]]'],
        ['a non-string value', '[["a",1]]'],
        ['a non-string key', '[[1,"a"]]'],
        ['not a string at all', 42],
    ])('refuses %s', (_label, input) => {
        expect(parseStoreDump(input)).toBeNull();
    });

    it('refuses more than MAX_KEYS keys, and more than MAX_TOTAL_CHARS characters', () => {
        const many = JSON.stringify(Array.from({ length: MAX_KEYS + 1 }, (_v, i) => [`k${i}`, 'v']));
        expect(parseStoreDump(many)).toBeNull();
        expect(parseStoreDump(JSON.stringify([['k', 'x'.repeat(MAX_TOTAL_CHARS)]]))).toBeNull();
        expect(parseStoreDump(JSON.stringify([['k', 'x'.repeat(MAX_TOTAL_CHARS - 1)]]))).not.toBeNull();
    });
});

describe('READ_SCRIPT and buildWriteScript', () => {
    it('READ_SCRIPT dumps every key as a pair', () => {
        const dump = run(READ_SCRIPT, fakeStorage({ a: '1', 'C:\\x': 'é' }));
        expect(parseStoreDump(dump)).toEqual([
            ['a', '1'],
            ['C:\\x', 'é'],
        ]);
    });

    it('writes only absent keys, returns the count, and survives quotes, backslashes and U+2028', () => {
        const pairs = [
            ['path', 'C:\\Users\\a\\"q"'],
            ['text', 'line\u2028sep\u2029end </script>'],
            ['kept', 'old'],
        ];
        const storage = fakeStorage({ kept: 'new' });
        expect(run(buildWriteScript(pairs), storage)).toBe(2);
        expect(storage.getItem('path')).toBe('C:\\Users\\a\\"q"');
        expect(storage.getItem('text')).toBe('line\u2028sep\u2029end </script>');
        expect(storage.getItem('kept')).toBe('new');
        expect(run(buildWriteScript(pairs), storage)).toBe(0); // a re-run adds nothing
    });

    // A retry after a completed write (say the marker write failed) must not bring back a key the
    // user removed in between: "absent" can't tell never-set from removed. The mark is set last, so a
    // store that holds it holds every key written before it.
    it('marks the store last when it writes, and a run that finds the mark writes nothing', () => {
        const pairs = [
            ['customLikeFolder', 'C:\\liked'],
            ['customShortcuts', '{"version":2}'],
        ];
        const storage = fakeStorage();
        expect(run(buildWriteScript(pairs), storage)).toBe(2);
        expect([...storage.map.keys()].at(-1)).toBe(MERGED_KEY);
        storage.map.delete('customLikeFolder'); // the user clears the like folder
        expect(run(buildWriteScript(pairs), storage)).toBe(0);
        expect(storage.getItem('customLikeFolder')).toBeNull();
    });
});

describe('migrateStorage', () => {
    function harness({ markerExists = false, dump = '[["a","1"]]', failAt = null } = {}) {
        const calls = [];
        const fs = {
            access: vi.fn(async () => {
                if (!markerExists) {
                    throw Object.assign(new Error('nope'), { code: 'ENOENT' });
                }
            }),
            mkdir: vi.fn(async () => {}),
            writeFile: vi.fn(async (...args) => {
                if (failAt === 'marker') {
                    throw new Error('disk full');
                }
                calls.push(['marker', ...args]);
            }),
        };
        const step = (name, value) =>
            vi.fn(async () => {
                calls.push([name]);
                if (failAt === name) {
                    throw new Error(`${name} failed`);
                }
                return value;
            });
        const deps = {
            markerPath: '/data/storage-migration.json',
            fs,
            loadOldOrigin: step('old'),
            loadNewOrigin: step('new'),
            flush: step('flush'),
            executeJavaScript: vi.fn(async (code) => {
                calls.push([code === READ_SCRIPT ? 'read' : 'write']);
                if (failAt === 'read' && code === READ_SCRIPT) {
                    throw new Error('read failed');
                }
                return code === READ_SCRIPT ? dump : 1;
            }),
            logger: { warn: vi.fn() },
            now: () => Date.UTC(2026, 9, 19),
        };
        return { deps, calls, fs };
    }

    it('skips everything when the marker exists', async () => {
        const { deps, calls } = harness({ markerExists: true });
        expect(await migrateStorage(deps)).toEqual({ ran: false, reason: 'marker present' });
        expect(calls).toEqual([]);
    });

    it('reads the old origin, writes the new one, flushes it to disk, then writes the marker, in that order', async () => {
        const { deps, calls } = harness();
        expect(await migrateStorage(deps)).toEqual({ ran: true, keys: 1, written: 1 });
        expect(calls.map((c) => c[0])).toEqual(['old', 'read', 'new', 'write', 'flush', 'marker']);
        const marker = JSON.parse(calls.at(-1)[2]);
        expect(marker).toEqual({ version: 1, migratedAt: '2026-10-19T00:00:00.000Z', keys: 1, written: 1 });
    });

    it('writes the marker without a write step when the old store is empty', async () => {
        const { deps, calls } = harness({ dump: '[]' });
        expect(await migrateStorage(deps)).toEqual({ ran: true, keys: 0, written: 0 });
        expect(calls.map((c) => c[0])).toEqual(['old', 'read', 'new', 'marker']);
    });

    it.each(['old', 'read', 'new', 'flush', 'marker'])(
        'on a failure at %s: warns, writes no marker, never throws',
        async (failAt) => {
            const { deps, calls } = harness({ failAt });
            const out = await migrateStorage(deps);
            expect(out.ran).toBe(false);
            expect(deps.logger.warn).toHaveBeenCalledWith(
                'storage-migration',
                expect.stringContaining('retry next launch')
            );
            expect(calls.some((c) => c[0] === 'marker')).toBe(false);
        }
    );

    it('refuses a dump that fails validation, before touching the new origin', async () => {
        const { deps, calls } = harness({ dump: '{"not":"pairs"}' });
        expect((await migrateStorage(deps)).ran).toBe(false);
        expect(calls.map((c) => c[0])).toEqual(['old', 'read']);
    });
});
