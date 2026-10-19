import { describe, it, expect } from 'vitest';
import * as SimilaritySort from '../similarity-sort.js';

const f = (...names) => names.map((n) => ({ name: n, path: `/f/${n}` }));
const paths = (files) => files.map((x) => x.path);

describe('alignToLive', () => {
    it('keeps the order for files still listed and drops the rest', () => {
        expect(paths(SimilaritySort.alignToLive(['/f/c', '/f/b', '/f/a'], f('a', 'c')))).toEqual(['/f/c', '/f/a']);
    });
    it('appends listed files the order lacks, in list order', () => {
        expect(paths(SimilaritySort.alignToLive(['/f/b'], f('a', 'b', 'c')))).toEqual(['/f/b', '/f/a', '/f/c']);
    });
    it('returns the live objects', () => {
        const live = f('a', 'b');
        expect(SimilaritySort.alignToLive(['/f/b', '/f/a'], live)[0]).toBe(live[1]);
    });
    it('lists a repeated path once', () => {
        expect(paths(SimilaritySort.alignToLive(['/f/a', '/f/a'], f('a', 'b')))).toEqual(['/f/a', '/f/b']);
    });
    it('an empty order gives the live list; an empty live list gives []', () => {
        const live = f('a', 'b');
        const out = SimilaritySort.alignToLive([], live);
        expect(paths(out)).toEqual(['/f/a', '/f/b']);
        expect(out).not.toBe(live);
        expect(SimilaritySort.alignToLive(['/f/a'], [])).toEqual([]);
    });
});

describe('takeUserMark / userActedSince', () => {
    const viewer = (o = {}) => ({
        mediaFiles: f('a', 'b', 'c'),
        currentIndex: 0,
        mlComparePairIndex: 0,
        moveHistory: [],
        isCompareMode: false,
        isTournamentMode: false,
        ...o,
    });
    const acted = (before, after) =>
        SimilaritySort.userActedSince(SimilaritySort.takeUserMark(before), SimilaritySort.takeUserMark(after));

    it('an unchanged viewer has not acted', () => {
        expect(acted(viewer(), viewer())).toBe(false);
    });
    it.each([
        ['navigated', { currentIndex: 1 }],
        ['the file under the cursor changed', { mediaFiles: f('b', 'c') }],
        ['moved a file', { moveHistory: [{}] }],
        ['switched to compare', { isCompareMode: true }],
        ['moved through AI compare pairs', { mlComparePairIndex: 2 }],
    ])('%s → acted', (_label, change) => {
        expect(acted(viewer(), viewer(change))).toBe(true);
    });
    it('a different entry at the same history depth has acted', () => {
        expect(acted(viewer({ moveHistory: [{ id: 1 }] }), viewer({ moveHistory: [{ id: 2 }] }))).toBe(true);
    });
    it('the same history entry object has not acted', () => {
        const e = {};
        expect(acted(viewer({ moveHistory: [e] }), viewer({ moveHistory: [e] }))).toBe(false);
    });
});

describe('isHashSaveDue', () => {
    it('is due at 1,000 new hashes, not at 999', () => {
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 1000, lastSaveAt: 0, now: 1 })).toBe(true);
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 999, lastSaveAt: 0, now: 1 })).toBe(false);
    });
    it('is due after 60 s with at least one new hash', () => {
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 1, lastSaveAt: 0, now: 60_000 })).toBe(true);
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 1, lastSaveAt: 0, now: 59_999 })).toBe(false);
    });
    it('is never due with nothing new', () => {
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 0, lastSaveAt: 0, now: 1e12 })).toBe(false);
    });
});
