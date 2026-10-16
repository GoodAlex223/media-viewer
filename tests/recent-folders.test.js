// G4 recently opened folders (spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md
// §§ 5–6): the pure module, tested directly.
import { describe, it, expect } from 'vitest';
import {
    MAX_RECENT_FOLDERS,
    MAX_PATH_LENGTH,
    parseRecentFolders,
    recordRecentFolder,
    removeRecentFolder,
    serializeRecentFolders,
    folderDisplayName,
    classifyRecentFolder,
} from '../recent-folders.js';

const stored = (entries, version = 1) => JSON.stringify({ version, entries });
const entry = (path, openedAt = 1) => ({ path, openedAt });

describe('parseRecentFolders — validate and clamp (spec § 5)', () => {
    it('reads a valid list in stored order', () => {
        const list = [entry('C:\\a', 2), entry('C:\\b', 1)];
        expect(parseRecentFolders(stored(list))).toEqual(list);
    });

    it.each([
        ['nothing stored', null],
        ['not JSON', '{oops'],
        ['JSON null', 'null'],
        ['a bare array', '[]'],
        ['an unknown version', stored([entry('C:\\a')], 2)],
        ['entries that are not an array', JSON.stringify({ version: 1, entries: {} })],
    ])('reads %s as an empty list', (_label, raw) => {
        expect(parseRecentFolders(raw)).toEqual([]);
    });

    it('drops every invalid entry shape and keeps the valid one', () => {
        const raw = stored([
            null,
            'C:\\a',
            { openedAt: 1 },
            entry(''),
            entry(42),
            { path: 'C:\\b' },
            entry('C:\\c', -1),
            entry('C:\\d', '5'),
            entry('C:\\e', null),
            entry('C:\\ok', 5),
        ]);
        expect(parseRecentFolders(raw)).toEqual([entry('C:\\ok', 5)]);
    });

    it('drops a non-finite openedAt (JSON can spell one: 1e400 parses to Infinity)', () => {
        const raw = '{"version":1,"entries":[{"path":"C:\\\\x","openedAt":1e400},{"path":"C:\\\\y","openedAt":3}]}';
        expect(parseRecentFolders(raw)).toEqual([entry('C:\\y', 3)]);
    });

    it('keeps the first (newest) of duplicate paths', () => {
        expect(parseRecentFolders(stored([entry('C:\\a', 3), entry('C:\\b', 2), entry('C:\\a', 1)]))).toEqual([
            entry('C:\\a', 3),
            entry('C:\\b', 2),
        ]);
    });

    it('compares paths exactly: a case variant is a different folder', () => {
        const list = [entry('C:\\Pics', 2), entry('C:\\pics', 1)];
        expect(parseRecentFolders(stored(list))).toEqual(list);
    });

    it('caps the list at MAX_RECENT_FOLDERS, keeping the newest', () => {
        const list = Array.from({ length: MAX_RECENT_FOLDERS + 2 }, (_, i) => entry(`C:\\f${i}`, 100 - i));
        expect(parseRecentFolders(stored(list))).toEqual(list.slice(0, MAX_RECENT_FOLDERS));
    });

    it('keeps a path of exactly MAX_PATH_LENGTH characters and drops a longer one', () => {
        const atLimit = 'C:\\' + 'x'.repeat(MAX_PATH_LENGTH - 3);
        const over = atLimit + 'y';
        expect(parseRecentFolders(stored([entry(over), entry(atLimit)]))).toEqual([entry(atLimit)]);
    });

    it('keeps only path and openedAt', () => {
        expect(parseRecentFolders(stored([{ path: 'C:\\a', openedAt: 1, name: 'x', extra: true }]))).toEqual([
            entry('C:\\a', 1),
        ]);
    });
});

describe('recordRecentFolder', () => {
    it('puts a new folder first, stamped now', () => {
        expect(recordRecentFolder([entry('C:\\a', 1)], 'C:\\b', 50)).toEqual([entry('C:\\b', 50), entry('C:\\a', 1)]);
    });

    it('moves a listed folder to the front instead of listing it twice', () => {
        expect(recordRecentFolder([entry('C:\\a', 2), entry('C:\\b', 1)], 'C:\\b', 9)).toEqual([
            entry('C:\\b', 9),
            entry('C:\\a', 2),
        ]);
    });

    it('caps at MAX_RECENT_FOLDERS, dropping the oldest', () => {
        const full = Array.from({ length: MAX_RECENT_FOLDERS }, (_, i) => entry(`C:\\f${i}`, 100 - i));
        const result = recordRecentFolder(full, 'C:\\new', 200);
        expect(result).toHaveLength(MAX_RECENT_FOLDERS);
        expect(result[0]).toEqual(entry('C:\\new', 200));
        expect(result.map((e) => e.path)).not.toContain(`C:\\f${MAX_RECENT_FOLDERS - 1}`);
    });

    it('does not mutate its input', () => {
        const input = Object.freeze([Object.freeze(entry('C:\\a', 1))]);
        expect(() => recordRecentFolder(input, 'C:\\b', 2)).not.toThrow();
        expect(input).toEqual([entry('C:\\a', 1)]);
    });

    it.each([
        ['an empty path', ''],
        ['a non-string', 42],
        ['a path over MAX_PATH_LENGTH', 'C:\\' + 'x'.repeat(MAX_PATH_LENGTH)],
    ])('ignores %s', (_label, bad) => {
        const list = [entry('C:\\a', 1)];
        const result = recordRecentFolder(list, bad, 5);
        expect(result).toEqual(list);
        expect(result).not.toBe(list);
    });
});

describe('removeRecentFolder', () => {
    it('removes exactly that path', () => {
        expect(removeRecentFolder([entry('C:\\a'), entry('C:\\b')], 'C:\\a')).toEqual([entry('C:\\b')]);
    });

    it('leaves the list as it was for a path it does not hold, as a copy', () => {
        const list = [entry('C:\\a')];
        const result = removeRecentFolder(list, 'C:\\A');
        expect(result).toEqual(list);
        expect(result).not.toBe(list);
    });
});

describe('serializeRecentFolders', () => {
    it('writes the version-1 envelope that parse reads back', () => {
        const list = [entry('C:\\a', 2), entry('C:\\b', 1)];
        const text = serializeRecentFolders(list);
        expect(JSON.parse(text)).toEqual({ version: 1, entries: list });
        expect(parseRecentFolders(text)).toEqual(list);
    });

    it('writes only path and openedAt', () => {
        expect(JSON.parse(serializeRecentFolders([{ path: 'C:\\a', openedAt: 1, junk: 1 }]))).toEqual({
            version: 1,
            entries: [entry('C:\\a', 1)],
        });
    });
});

describe('folderDisplayName (Review Focus 1)', () => {
    const win = (p) => p.split('\\').filter(Boolean).pop() ?? '';

    it('is the last path segment', () => {
        expect(folderDisplayName('C:\\pics\\Liked_3', win)).toBe('Liked_3');
    });

    it('falls back to the whole path when there is no last segment (a drive root)', () => {
        expect(folderDisplayName('D:\\', () => '')).toBe('D:\\');
    });

    it('falls back to the whole path without a basename function (no Electron API)', () => {
        expect(folderDisplayName('C:\\pics\\Liked_3', undefined)).toBe('C:\\pics\\Liked_3');
    });
});

describe('classifyRecentFolder — the spec § 6 table', () => {
    it.each([
        [true, true, 'open'],
        [true, false, 'missing'],
        [true, null, 'regrant'], // the existence check was refused: as not granted
        [true, undefined, 'error'], // the existence check failed
        [false, undefined, 'regrant'],
        ['unreachable', undefined, 'unreachable'],
        [undefined, undefined, 'error'], // the status query failed or was refused (a null reply)
        ['granted', undefined, 'error'], // main maps statuses to true/false/'unreachable'; anything else is unexpected
    ])('status %s, exists %s → %s', (status, exists, outcome) => {
        expect(classifyRecentFolder(status, exists)).toBe(outcome);
    });
});
