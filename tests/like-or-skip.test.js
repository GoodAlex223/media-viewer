import { describe, it, expect } from 'vitest';
import {
    SkipTracker,
    planCursorAfterBatch,
    planUndoReinsertion,
    formatCount,
    trainingWeight,
    computeStaleCount,
    parkSkippedOrder,
} from '../like-or-skip.js';

const file = (name) => ({ name, path: `/f/${name}` });
const files = (...names) => names.map(file);
const pathsOf = (list) => new Set(list.map((f) => f.path));
const names = (list) => list.map((f) => f.name);

describe('SkipTracker', () => {
    it('records nothing while inactive', () => {
        const t = new SkipTracker();
        t.recordSkip('/f/a');
        t.restore('/f/b');
        expect(t.active).toBe(false);
        expect(t.skipped.size).toBe(0);
    });

    it('records skips once active, and a fresh activation empties the set', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.recordSkip('/f/a');
        expect([...t.skipped]).toEqual(['/f/a']);
        t.activate();
        expect(t.skipped.size).toBe(0);
        expect(t.active).toBe(true);
    });

    it('a re-sort activation keeps the skips (spec D2)', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.activate({ keepSkips: true });
        expect([...t.skipped]).toEqual(['/f/a']);
    });

    it('deactivate stops tracking and drops the skips', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.deactivate();
        expect(t.active).toBe(false);
        expect(t.skipped.size).toBe(0);
    });

    it('forget drops a path in any state; restore re-adds only while active', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.forget('/f/a');
        expect(t.skipped.size).toBe(0);
        t.restore('/f/a');
        expect([...t.skipped]).toEqual(['/f/a']);
    });

    it('skippedIn returns the listed skips in list order, never an unlisted path', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/c');
        t.recordSkip('/f/a');
        t.recordSkip('/f/gone');
        expect(names(t.skippedIn(files('a', 'b', 'c')))).toEqual(['a', 'c']);
    });
});

describe('planCursorAfterBatch', () => {
    const list = files('a', 'b', 'c', 'd', 'e');

    it('follows the file on screen when it survives, with moved files before and after it', () => {
        expect(planCursorAfterBatch(list, pathsOf([list[0], list[1], list[4]]), 2)).toBe('/f/c');
    });

    it('lands on the first survivor after the file on screen when it moved', () => {
        expect(planCursorAfterBatch(list, pathsOf([list[0], list[1]]), 1)).toBe('/f/c');
        expect(planCursorAfterBatch(list, pathsOf([list[2]]), 2)).toBe('/f/d');
    });

    it('wraps to the first survivor when nothing survives after the file on screen', () => {
        expect(planCursorAfterBatch(list, pathsOf([list[3], list[4]]), 4)).toBe('/f/a');
    });

    it('returns null when every file moved', () => {
        expect(planCursorAfterBatch(list, pathsOf(list), 3)).toBeNull();
    });
});

describe('planUndoReinsertion', () => {
    it('rebuilds the exact pre-batch order when nothing was reordered', () => {
        const before = files('a', 'b', 'c', 'd', 'e');
        const after = [before[2], before[4]]; // a, b and d moved
        const restored = [
            { file: before[3], originalIndex: 3 },
            { file: before[0], originalIndex: 0 },
            { file: before[1], originalIndex: 1 },
        ];
        expect(names(planUndoReinsertion(after, restored, { orderUnchanged: true }))).toEqual([
            'a',
            'b',
            'c',
            'd',
            'e',
        ]);
    });

    it('shifts each position past the files that did not come back (partial undo)', () => {
        const before = files('a', 'b', 'c', 'd'); // a, b, c skipped; d on screen
        const restored = [
            { file: before[0], originalIndex: 0 },
            { file: before[2], originalIndex: 2 },
        ];
        const result = planUndoReinsertion([before[3]], restored, { orderUnchanged: true, missing: [1] });
        expect(names(result)).toEqual(['a', 'c', 'd']);
    });

    it('parks the restored files at the front, in their original order, after a reorder', () => {
        const restored = [
            { file: file('b'), originalIndex: 4 },
            { file: file('a'), originalIndex: 1 },
        ];
        expect(names(planUndoReinsertion(files('x', 'y'), restored, { orderUnchanged: false }))).toEqual([
            'a',
            'b',
            'x',
            'y',
        ]);
    });

    it('clamps an index past the end', () => {
        const result = planUndoReinsertion(files('x'), [{ file: file('a'), originalIndex: 9 }], {
            orderUnchanged: true,
        });
        expect(names(result)).toEqual(['x', 'a']);
    });

    it('does not mutate its inputs', () => {
        const current = files('x');
        const restored = [{ file: file('a'), originalIndex: 0 }];
        planUndoReinsertion(current, restored, { orderUnchanged: true });
        expect(names(current)).toEqual(['x']);
        expect(restored).toHaveLength(1);
    });
});

describe('formatCount', () => {
    it('pluralises everything but one', () => {
        expect(formatCount(1, 'file')).toBe('1 file');
        expect(formatCount(3, 'file')).toBe('3 files');
        expect(formatCount(0, 'rating')).toBe('0 ratings');
    });
});

describe('trainingWeight', () => {
    it('counts the files an entry moved into or out of the training set', () => {
        expect(trainingWeight({ actionType: 'like' })).toBe(1);
        expect(trainingWeight({ actionType: 'dislike', compareMode: true })).toBe(1);
        expect(trainingWeight({ bothGood: true, bulkFiles: [{}, {}] })).toBe(2);
        expect(trainingWeight({ bothBad: true, bulkFiles: [{}, {}] })).toBe(2);
        expect(trainingWeight({ skipBatch: true, files: [{}, {}, {}] })).toBe(3);
        expect(trainingWeight({ actionType: 'special' })).toBe(0);
        expect(trainingWeight(undefined)).toBe(0);
    });
});

describe('computeStaleCount — the weighted symmetric difference since the mark (spec § 8)', () => {
    const like = () => ({ actionType: 'like' });

    it('is 0 with no mark (not on the AI order)', () => {
        expect(computeStaleCount([like()], null)).toBe(0);
    });

    it('counts ratings added since the mark', () => {
        const before = like();
        const mark = [before];
        expect(computeStaleCount([before, like(), { skipBatch: true, files: [{}, {}] }], mark)).toBe(3);
    });

    it('an undo of a post-mark rating takes it back off', () => {
        const before = like();
        expect(computeStaleCount([before], [before])).toBe(0);
    });

    it('an undo of a pre-mark rating adds to the count', () => {
        const a = like();
        const b = like();
        expect(computeStaleCount([a], [a, b])).toBe(1);
    });

    it('a failed undo that pushes the same entry back changes nothing', () => {
        const a = like();
        const history = [a];
        const mark = history.slice();
        history.pop();
        history.push(a);
        expect(computeStaleCount(history, mark)).toBe(0);
    });

    it('an in-place splice of a weight-0 entry changes nothing', () => {
        const a = like();
        const s = { actionType: 'special' };
        const b = like();
        expect(computeStaleCount([a, b], [a, s, b])).toBe(0);
    });

    it('a partially failed undo of a pre-mark batch overcounts, never undercounts', () => {
        const batch = { skipBatch: true, files: [{}, {}, {}] };
        const residual = { skipBatch: true, files: [{}] };
        // 2 files came back (true change 2); the hint says 4.
        expect(computeStaleCount([residual], [batch])).toBe(4);
    });
});

describe('parkSkippedOrder — re-sort keeps skips behind the cursor (spec D2, D3)', () => {
    it('puts the skips first in their current order, then the unjudged in the new model order', () => {
        const current = files('a', 'b', 'c', 'd', 'e'); // a and c skipped
        const sorted = files('e', 'c', 'd', 'b', 'a');
        const { files: result, cursor } = parkSkippedOrder(current, sorted, new Set(['/f/c', '/f/a']));
        expect(names(result)).toEqual(['a', 'c', 'e', 'd', 'b']);
        expect(cursor).toBe(2);
    });

    it('lands on 0 when every remaining file is skipped', () => {
        const current = files('a', 'b');
        const { files: result, cursor } = parkSkippedOrder(current, files('b', 'a'), new Set(['/f/a', '/f/b']));
        expect(names(result)).toEqual(['a', 'b']);
        expect(cursor).toBe(0);
    });

    it('keeps a skipped file the sort result left out (no features), and ignores stale paths', () => {
        const current = files('a', 'b', 'c');
        const { files: result } = parkSkippedOrder(current, files('c', 'b'), new Set(['/f/a', '/f/gone']));
        expect(names(result)).toEqual(['a', 'c', 'b']);
    });
});
