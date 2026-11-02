// G3 "Rating data that can't go wrong" (spec docs/superpowers/specs/2026-11-02-g3-rating-data-safety-design.md):
// the MediaViewer methods behind each member, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable (the technique of media-viewer-utils.test.js, sync or async). */
function extract(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(((?:[^()]|\\([^()]*\\))*)\\)\\s*\\{`, 'm'));
    if (!match) {
        throw new Error(`Could not find method: ${name}`);
    }
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            const Ctor = match[1] ? AsyncFunction : Function;
            return new Ctor(match[2], source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

describe('member 1: nothing acts on files while a folder opens', () => {
    const LOADING = 'Wait for the folder to finish loading';
    const files = [
        { name: 'a.jpg', path: '/f/a.jpg' },
        { name: 'b.jpg', path: '/f/b.jpg' },
    ];
    let moveFile;

    function makeCtx(over = {}) {
        return {
            _folderLoadInFlight: true,
            _fileOpInFlight: false,
            isLoading: false,
            mediaNavigationInProgress: false,
            mediaFiles: [...files],
            currentIndex: 0,
            moveHistory: [],
            customSpecialFolder: '/special',
            isSortedByPrediction: true,
            isCompareMode: true,
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            showNotification: vi.fn(),
            showDropZone: vi.fn(),
            signalUserActivity: vi.fn(),
            // Each is the first thing its method reaches past the guard, ending it there.
            areFoldersConfigured: vi.fn(() => false),
            _refuseIfNeedsRegrant: vi.fn(() => true),
            _refuseIfFileOpInFlight: () => false,
            _refuseIfFolderLoadInFlight: extract('_refuseIfFolderLoadInFlight'),
            _tournamentPromptOpen: () => false,
            removeFailedFile: vi.fn(),
            likeOrSkip: { active: true, skippedIn: vi.fn(() => []) },
            get compareLeftFile() {
                this.pairRead = true;
                return null;
            },
            compareRightFile: null,
            ...over,
        };
    }

    beforeEach(() => {
        moveFile = vi.fn(async () => ({ success: true }));
        globalThis.window = { electronAPI: { moveFile } };
    });
    afterEach(() => {
        delete globalThis.window;
    });

    // [method, args, did it get past the guard?] With the flag down, the same call must reach its check.
    const QUIET = [
        ['moveCurrentFile', ['like'], (c) => c.areFoldersConfigured.mock.calls.length > 0],
        ['moveToSpecialFolder', [], (c) => c._refuseIfNeedsRegrant.mock.calls.length > 0],
        ['moveComparePair', ['left', 'like', 'dislike'], (c) => c.areFoldersConfigured.mock.calls.length > 0],
        ['applyBulkRating', ['good'], (c) => c.pairRead === true],
        ['dislikeSkippedFiles', [], (c) => c.likeOrSkip.skippedIn.mock.calls.length > 0, { isCompareMode: false }],
    ];

    it.each(QUIET)('%s refuses quietly and takes no flag', async (name, args, reached, over = {}) => {
        const method = extract(name);
        const ctx = makeCtx(over);
        await method.apply(ctx, args);
        expect(reached(ctx)).toBe(false);
        expect(ctx._fileOpInFlight).toBe(false);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(moveFile).not.toHaveBeenCalled();

        const control = makeCtx({ ...over, _folderLoadInFlight: false });
        await method.apply(control, args);
        expect(reached(control)).toBe(true);
    });

    // PR #95 round 2, issue 1: the key gate does not cover focus reaching a rating button behind a prompt, and entry
    // has reset the cursor with no render. Refused at the action, like a press during a load.
    it.each(QUIET)('%s also refuses behind a tournament prompt', async (name, args, reached, over = {}) => {
        const method = extract(name);
        const ctx = makeCtx({ ...over, _folderLoadInFlight: false, _tournamentPromptOpen: () => true });
        await method.apply(ctx, args);
        expect(reached(ctx)).toBe(false);
        expect(ctx._fileOpInFlight).toBe(false);
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    it('nextMedia returns first thing: not even the empty-list branch runs', () => {
        const nextMedia = extract('nextMedia');
        const ctx = makeCtx({ mediaFiles: [] });
        nextMedia.call(ctx);
        expect(ctx.showDropZone).not.toHaveBeenCalled();
        const control = makeCtx({ mediaFiles: [], _folderLoadInFlight: false });
        nextMedia.call(control);
        expect(control.showDropZone).toHaveBeenCalledOnce();
    });

    it('previousMedia returns before it acts', () => {
        const previousMedia = extract('previousMedia');
        const ctx = makeCtx();
        previousMedia.call(ctx);
        expect(ctx.signalUserActivity).not.toHaveBeenCalled();
    });

    it('an undo says why, ahead of "No moves to undo"', async () => {
        const ctx = makeCtx();
        await extract('handleCancel').call(ctx);
        expect(ctx.showNotification.mock.calls).toEqual([[LOADING, 'info']]);
        expect(moveFile).not.toHaveBeenCalled();

        const control = makeCtx({ _folderLoadInFlight: false });
        await extract('handleCancel').call(control);
        expect(control.showNotification.mock.calls).toEqual([['No moves to undo', 'error']]);
    });

    it('a tournament undo says why, and leaves the stack alone', async () => {
        const peekUndoEntry = vi.fn(() => null);
        const ctx = makeCtx({ isTournamentMode: true, tournament: { engine: { peekUndoEntry } } });
        await extract('handleTournamentUndo').call(ctx);
        expect(ctx.showNotification.mock.calls).toEqual([[LOADING, 'info']]);
        expect(peekUndoEntry).not.toHaveBeenCalled();
    });

    it("the load-error toast's Remove refuses", () => {
        const ctx = makeCtx();
        extract('_removeFailedFileByPath').call(ctx, files[0].path);
        expect(ctx.removeFailedFile).not.toHaveBeenCalled();
        expect(ctx.showNotification.mock.calls).toEqual([[LOADING, 'info']]);
    });

    it('a mode switch refuses', async () => {
        const ctx = makeCtx();
        await extract('switchMode').call(ctx, 'tournament');
        expect(ctx.showNotification.mock.calls).toEqual([[LOADING, 'info']]);
    });
});

describe('member 1: an undo puts a file back where it came from', () => {
    const moveBack = () => extract('_moveBackFromHistory');
    const body = (name) => extract(name).toString();

    afterEach(() => {
        delete globalThis.window;
    });

    function api(result) {
        const moveFile = vi.fn(async () => result);
        globalThis.window = {
            electronAPI: {
                moveFile,
                path: {
                    dirname: (p) => p.slice(0, p.lastIndexOf('/')),
                    basename: (p) => p.slice(p.lastIndexOf('/') + 1),
                },
            },
        };
        return moveFile;
    }

    const ctx = () => ({ baseFolderPath: '/another', _followRestoredFile: extract('_followRestoredFile') });

    it('targets the folder the file came from, whatever folder is open', async () => {
        const moveFile = api({ success: true, targetPath: '/from/a.jpg' });
        const entry = { fileName: 'a.jpg', originalPath: '/from/a.jpg', newPath: '/liked/a.jpg' };
        await moveBack().call(ctx(), entry);
        expect(moveFile.mock.calls).toEqual([
            [{ sourcePath: '/liked/a.jpg', targetFolder: '/from', fileName: 'a.jpg' }],
        ]);
    });

    it('follows a suffixed landing, and throws on a failure with the entry as it was', async () => {
        api({ success: true, targetPath: '/from/a (1).jpg' });
        const entry = { fileName: 'a.jpg', originalPath: '/from/a.jpg', newPath: '/liked/a.jpg' };
        await moveBack().call(ctx(), entry);
        expect(entry).toMatchObject({ fileName: 'a (1).jpg', originalPath: '/from/a (1).jpg' });

        api({ success: false, error: 'EBUSY' });
        const failing = { fileName: 'b.jpg', originalPath: '/from/b.jpg', newPath: '/liked/b.jpg' };
        await expect(moveBack().call(ctx(), failing)).rejects.toThrow('EBUSY');
        expect(failing.originalPath).toBe('/from/b.jpg');
    });

    // A convention would not hold: this fails on any new undo site that targets the open folder.
    it('no method moves a file back into the open folder', () => {
        expect(source).not.toContain('targetFolder: this.baseFolderPath');
    });

    it('every undo branch goes through the helper; the tournament keeps its own move', () => {
        const calls = (name) => body(name).split('this._moveBackFromHistory(').length - 1;
        expect(calls('handleCancel')).toBe(6);
        expect(calls('_undoSkipBatch')).toBe(1);
        expect(body('handleTournamentUndo')).toContain(
            'targetFolder: window.electronAPI.path.dirname(move.originalPath)'
        );
    });
});

describe('member 3: an undo gives a file back what its removal destroyed', () => {
    const captureUndoFields = extract('_captureUndoFields');
    const restore = extract('restoreFeatureCachesFromHistory');
    const file = { name: 'a.jpg', path: '/f/a.jpg' };

    function captureCtx(over = {}) {
        return {
            _bulkPairKeysReferencing: () => [],
            perceptualHashes: new Map(),
            predictionScores: new Map(),
            bulkRated: new Map(),
            ...over,
        };
    }

    function restoreCtx() {
        return {
            bulkRatedPairs: new Set(),
            perceptualHashes: new Map(),
            predictionScores: new Map(),
            bulkRated: new Map(),
            saveBulkRatedFile: vi.fn(async () => {}),
        };
    }

    it('captures all four fields', () => {
        const ctx = captureCtx({
            _bulkPairKeysReferencing: () => ['a.jpg|b.jpg'],
            perceptualHashes: new Map([[file.path, '0101']]),
            predictionScores: new Map([[file.path, 0.9]]),
            bulkRated: new Map([[file.name, 'good']]),
        });
        expect(captureUndoFields.call(ctx, file)).toEqual({
            prunedPairKeys: ['a.jpg|b.jpg'],
            perceptualHash: '0101',
            score: 0.9,
            bulkBucket: 'good',
        });
    });

    it('omits what the file does not have, and keeps a score of 0', () => {
        expect(Object.keys(captureUndoFields.call(captureCtx(), file))).toEqual([]);
        const ctx = captureCtx({ predictionScores: new Map([[file.path, 0]]) });
        expect(captureUndoFields.call(ctx, file)).toEqual({ score: 0 });
    });

    it('every move site captures through the one helper, before the removal', () => {
        const count = (text, needle) => text.split(needle).length - 1;
        expect(count(source, '...this._captureUndoFields(')).toBe(5);
        for (const [method, sites] of [
            ['moveCurrentFile', 1],
            ['moveToSpecialFolder', 1],
            ['moveComparePair', 2],
            ['dislikeSkippedFiles', 1],
        ]) {
            expect(count(extract(method).toString(), '...this._captureUndoFields('), method).toBe(sites);
        }
    });

    // PR #95 review 19: a one-word slip here gives the right-hand file the left one's label, and labels feed training.
    it("a pair move captures each file's own fields", () => {
        const body = extract('moveComparePair').toString();
        expect(body).toMatch(/const primaryEntry = \{[^}]*\.\.\.this\._captureUndoFields\(primaryFile\),\s*\};/);
        expect(body).toMatch(/const secondaryEntry = \{[^}]*\.\.\.this\._captureUndoFields\(secondaryFile\),\s*\};/);
    });

    it('restores the label and the score, and saves the label', () => {
        const ctx = restoreCtx();
        restore.call(ctx, { fileName: 'a.jpg', originalPath: '/f/a.jpg', score: 0.9, bulkBucket: 'bad' });
        expect(ctx.bulkRated.get('a.jpg')).toBe('bad');
        expect(ctx.predictionScores.get('/f/a.jpg')).toBe(0.9);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('a batch undo defers the save, and makes its own once', () => {
        const ctx = restoreCtx();
        restore.call(ctx, { fileName: 'a.jpg', originalPath: '/f/a.jpg', bulkBucket: 'bad' }, { deferBulkSave: true });
        expect(ctx.bulkRated.get('a.jpg')).toBe('bad');
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
    });

    it('restores a score of 0, and saves nothing for a file with no label', () => {
        const ctx = restoreCtx();
        restore.call(ctx, { fileName: 'a.jpg', originalPath: '/f/a.jpg', score: 0 });
        expect(ctx.predictionScores.get('/f/a.jpg')).toBe(0);
        expect(ctx.bulkRated.size).toBe(0);
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
    });

    it('a file with no features still gets both back, under the name it came back to', () => {
        const ctx = restoreCtx();
        // What _followRestoredFile leaves when the name was taken: the entry already points at the suffixed file.
        restore.call(ctx, {
            fileName: 'a (1).jpg',
            originalPath: '/f/a (1).jpg',
            mlFeatures: null,
            score: 0.4,
            bulkBucket: 'good',
        });
        expect([...ctx.bulkRated]).toEqual([['a (1).jpg', 'good']]);
        expect([...ctx.predictionScores]).toEqual([['/f/a (1).jpg', 0.4]]);
    });
});

describe('member 5: Continue reads the list when it is pressed', () => {
    const showContinue = extract('showTournamentContinuePrompt');
    const state = { createdAt: 0, gamesPlayed: 0, files: ['/f/a', '/f/b'], options: { rounds: 3 } };
    let els;

    function makeCtx(over = {}) {
        return {
            mediaFiles: [{ path: '/f/a' }, { path: '/f/b' }],
            isComputingHashes: false,
            isPredictionSorting: false,
            restoreOriginalOrderForTournament: vi.fn(),
            _refuseIfFileOpInFlight: vi.fn(() => false),
            _refuseIfFolderLoadInFlight: vi.fn(() => false),
            _enterResumedTournamentUI: vi.fn(async () => {}),
            showNotification: vi.fn(),
            tournament: {
                validateStateFile: () => ({ valid: true, removed: [], added: [] }),
                handleResumeReconciled: vi.fn(async () => ({ ok: true, removedCount: 0 })),
            },
            ...over,
        };
    }

    beforeEach(() => {
        els = {};
        const el = () => ({ style: {}, textContent: '', append: vi.fn(), replaceChildren: vi.fn() });
        globalThis.document = { getElementById: (id) => (els[id] ??= el()), createElement: el };
    });
    afterEach(() => {
        delete globalThis.document;
    });

    it('a file that came back behind the prompt is in the list it reconciles against', async () => {
        const ctx = makeCtx();
        showContinue.call(ctx, state, ['/f/a']); // the list when the prompt opened: /f/b was in the like folder
        await els.tournamentResumeAccept.onclick();
        expect(ctx.tournament.handleResumeReconciled).toHaveBeenCalledWith(state, ['/f/a', '/f/b']);
    });

    it('reads the list after the folder order is restored', async () => {
        const ctx = makeCtx();
        ctx.restoreOriginalOrderForTournament = vi.fn(() => {
            ctx.mediaFiles = [{ path: '/f/b' }, { path: '/f/a' }];
        });
        showContinue.call(ctx, state, ['/f/a']);
        await els.tournamentResumeAccept.onclick();
        expect(ctx.tournament.handleResumeReconciled).toHaveBeenCalledWith(state, ['/f/b', '/f/a']);
    });

    it.each(['_refuseIfFileOpInFlight', '_refuseIfFolderLoadInFlight'])(
        '%s refuses Continue: nothing resumes and the prompt stays',
        async (guard) => {
            const ctx = makeCtx({ [guard]: vi.fn(() => true) });
            showContinue.call(ctx, state, ['/f/a']);
            els.tournamentResumeModal.style.display = 'flex';
            await els.tournamentResumeAccept.onclick();
            expect(ctx.restoreOriginalOrderForTournament).not.toHaveBeenCalled();
            expect(ctx.tournament.handleResumeReconciled).not.toHaveBeenCalled();
            expect(els.tournamentResumeModal.style.display).toBe('flex');
        }
    );
});

describe('the tournament prompts (PR #95 review 3, 7)', () => {
    const IDS = ['tournamentConfigModal', 'tournamentResumeModal', 'tournamentSummaryModal'];
    let els;

    beforeEach(() => {
        els = Object.fromEntries(IDS.map((id) => [id, { style: { display: 'none' } }]));
        globalThis.document = { getElementById: (id) => els[id] ?? null };
    });
    afterEach(() => {
        delete globalThis.document;
    });

    it.each(IDS)('%s open: a key must not dispatch behind it', (id) => {
        const open = extract('_tournamentPromptOpen');
        expect(open.call({})).toBe(false);
        els[id].style.display = 'flex';
        expect(open.call({})).toBe(true);
    });

    it('the keydown handler checks first, with only Escape and F1 let past', () => {
        const gate = source.indexOf(
            "if (this._tournamentPromptOpen() && e.key !== 'Escape' && e.key !== 'F1') return;"
        );
        expect(gate).toBeGreaterThan(-1);
        const handler = source.lastIndexOf("document.addEventListener('keydown', (e) => {", gate);
        expect(gate - handler).toBeLessThan(300); // the handler's first statement, comment aside
        expect(source.indexOf('if (this.mediaFiles.length === 0) {', handler)).toBeGreaterThan(gate);
    });

    it('a folder load closes every prompt, after its refusals', () => {
        const close = extract('_closeTournamentPrompts');
        for (const id of IDS) els[id].style.display = 'flex';
        close.call({});
        for (const id of IDS) expect(els[id].style.display).toBe('none');

        const load = extract('loadFolder').toString();
        const refusal = load.indexOf('this._refuseIfFolderLoadInFlight()');
        const closing = load.indexOf('this._closeTournamentPrompts()');
        expect(refusal).toBeGreaterThan(-1);
        expect(closing).toBeGreaterThan(refusal);
        expect(closing).toBeLessThan(load.indexOf('await '));
    });

    // Round 2, issue 5: from a mode or folder switch the app stays open, and the picks since the last write are gone.
    it('Save & leave says so on screen when its write failed', async () => {
        const accept = { style: {}, textContent: '' };
        const el = () => ({ style: {}, textContent: '', append: vi.fn(), replaceChildren: vi.fn() });
        els.tournamentResumeAccept = accept;
        for (const id of ['tournamentResumeTitle', 'tournamentResumeBody', 'tournamentResumeDiscard']) els[id] = el();
        globalThis.document.createElement = el;
        const after = vi.fn();
        for (const failed of [true, false]) {
            const ctx = {
                showNotification: vi.fn(),
                tournament: {
                    lastWriteFailed: failed,
                    flush: vi.fn(async () => {}),
                    engine: { getProgress: () => ({ gamesPlayed: 0, gamesTotal: 1 }) },
                },
            };
            extract('showTournamentLeavePrompt').call(ctx, after);
            await accept.onclick();
            expect(ctx.showNotification.mock.calls.length, String(failed)).toBe(failed ? 1 : 0);
            if (failed) {
                expect(ctx.showNotification.mock.calls[0][1]).toBe('warning');
                expect(ctx.showNotification.mock.calls[0][2]).toEqual({ sticky: true });
            }
        }
        expect(after).toHaveBeenCalledTimes(2); // it still leaves
    });

    it('the leave prompt marks a choice as soon as it is made, and clears it with the prompt', () => {
        const body = extract('showTournamentLeavePrompt').toString();
        expect(body.split('this._leaveChoiceMade = true;').length - 1).toBe(2); // Save & leave, Discard
        expect(body).toContain('this._leaveChoiceMade = false;');
    });
});

describe('member 6: _saveThenAllowClose', () => {
    const saveThenAllowClose = extract('_saveThenAllowClose');
    const settleSavesForClose = extract('_settleSavesForClose');
    let allowAppClose, logPerf, logError;

    function makeCtx(over = {}) {
        const ctx = {
            _fileOpInFlight: false,
            cancelBackgroundExtraction: vi.fn(),
            _bulkRatedSaver: { whenIdle: vi.fn(async () => {}) },
            featureCacheStore: { flush: vi.fn(async () => {}) },
            tournament: { flushPending: vi.fn(async () => {}) },
            showNotification: vi.fn(),
            ...over,
        };
        ctx._settleSavesForClose = settleSavesForClose.bind(ctx);
        return ctx;
    }

    const NOTE = 'Saving before closing — close again to quit now';

    beforeEach(() => {
        vi.useFakeTimers();
        allowAppClose = vi.fn();
        logPerf = vi.fn();
        logError = vi.fn();
        globalThis.window = { electronAPI: { allowAppClose, logPerf, logError } };
    });
    afterEach(() => {
        vi.useRealTimers();
        delete globalThis.window;
    });

    it('with nothing owed it closes without a note, and the timers it armed cannot fire later', async () => {
        const ctx = makeCtx();
        await saveThenAllowClose.call(ctx);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('settles all three saves before it closes, the extraction stopped first', async () => {
        const order = [];
        let finishFeatures;
        const ctx = makeCtx({
            cancelBackgroundExtraction: vi.fn(() => order.push('cancel')),
            _bulkRatedSaver: {
                whenIdle: vi.fn(async (...args) => {
                    order.push(`bulk(${args.length})`); // no folder: a queued save of a folder left behind counts
                }),
            },
            featureCacheStore: {
                flush: vi.fn(() => {
                    order.push('features');
                    return new Promise((resolve) => (finishFeatures = resolve));
                }),
            },
            tournament: { flushPending: vi.fn(async () => order.push('tournament')) },
        });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(0);
        expect(order).toEqual(['cancel', 'bulk(0)', 'features', 'tournament']);
        expect(allowAppClose).not.toHaveBeenCalled();
        finishFeatures();
        await closing;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    // Round 2, issue 3: a close let through during the leave prompt's write, then that prompt's own continuation.
    it('a second run while one is waiting does nothing: one wait, one close', async () => {
        let finish;
        const ctx = makeCtx({
            featureCacheStore: { flush: vi.fn(() => new Promise((resolve) => (finish = resolve))) },
        });
        const first = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(0);
        await saveThenAllowClose.call(ctx);
        expect(ctx.featureCacheStore.flush).toHaveBeenCalledTimes(1);
        expect(allowAppClose).not.toHaveBeenCalled();
        finish();
        await first;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('holds the flag a second close looks at from the first moment', () => {
        const ctx = makeCtx({ featureCacheStore: { flush: () => new Promise(() => {}) } });
        saveThenAllowClose.call(ctx);
        expect(ctx._closeSaveInFlight).toBe(true);
    });

    it('a slow save shows the sticky note at 300 ms, not before', async () => {
        const ctx = makeCtx({ featureCacheStore: { flush: () => new Promise(() => {}) } });
        saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(299);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(ctx.showNotification.mock.calls).toEqual([[NOTE, 'info', { sticky: true }]]);
        expect(ctx._closeSaveNoteShown).toBe(true); // what lets a second close through
    });

    it('a save that never settles closes at the 15 s cap, and the perf log says so', async () => {
        const ctx = makeCtx({ featureCacheStore: { flush: () => new Promise(() => {}) } });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(14_999);
        expect(allowAppClose).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await closing;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        expect(logPerf.mock.calls).toEqual([['Quit save: 15000ms, capped']]);
        expect(vi.getTimerCount()).toBe(0);
    });

    // "settled", not "saved": a failed write settles too, and it reaches the session log on its own (PR #95 review 6).
    it('a finished wait logs as settled', async () => {
        await saveThenAllowClose.call(makeCtx());
        expect(logPerf).toHaveBeenCalledTimes(1);
        expect(logPerf.mock.calls[0][0]).toMatch(/^Quit save: \d+ms, settled$/);
    });

    it('a flush that rejects does not end the wait for the others', async () => {
        let finishBulk;
        const ctx = makeCtx({
            _bulkRatedSaver: { whenIdle: vi.fn(() => new Promise((resolve) => (finishBulk = resolve))) },
            featureCacheStore: {
                flush: vi.fn(async () => {
                    throw new Error('disk');
                }),
            },
        });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(0);
        expect(allowAppClose).not.toHaveBeenCalled();
        finishBulk();
        await closing;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    // PR #95 review 11: a running sort kept collecting vectors behind the flush.
    it('stops a running sort as well as the extraction', async () => {
        const abort = vi.fn();
        await saveThenAllowClose.call(makeCtx({ sortAbortController: { abort } }));
        expect(abort).toHaveBeenCalledOnce();
    });

    it("the extraction's tail does not start a second full save behind the quit's", () => {
        const body = extract('startBackgroundFeatureExtraction').toString();
        const gate = body.indexOf('if (this._closeSaveInFlight)');
        expect(gate).toBeGreaterThan(-1);
        expect(gate).toBeLessThan(body.indexOf('this.featureCacheStore.finishExtractionRun('));
    });

    it('a rejecting flush does not stop the other saves or the close', async () => {
        const ctx = makeCtx({
            featureCacheStore: {
                flush: vi.fn(async () => {
                    throw new Error('disk');
                }),
            },
        });
        await saveThenAllowClose.call(ctx);
        expect(ctx.tournament.flushPending).toHaveBeenCalledTimes(1);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('a flush or a cancel that throws synchronously still closes, and is logged', async () => {
        for (const over of [
            {
                cancelBackgroundExtraction: () => {
                    throw new Error('dom gone');
                },
            },
            {
                featureCacheStore: {
                    flush: () => {
                        throw new Error('sync');
                    },
                },
            },
        ]) {
            allowAppClose.mockClear();
            logError.mockClear();
            await saveThenAllowClose.call(makeCtx(over));
            expect(allowAppClose).toHaveBeenCalledTimes(1);
            expect(logError).toHaveBeenCalledTimes(1);
        }
    });

    it('a logPerf that throws still closes', async () => {
        logPerf.mockImplementation(() => {
            throw new Error('ipc');
        });
        await saveThenAllowClose.call(makeCtx());
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('waits for a file action to finish before it reads what is owed', async () => {
        const ctx = makeCtx({ _fileOpInFlight: true });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(100);
        expect(ctx._bulkRatedSaver.whenIdle).not.toHaveBeenCalled();
        ctx._fileOpInFlight = false;
        await vi.advanceTimersByTimeAsync(25);
        expect(ctx._bulkRatedSaver.whenIdle).toHaveBeenCalledTimes(1);
        await closing;
    });

    it('stops waiting on a stuck file action after 2 s', async () => {
        const ctx = makeCtx({ _fileOpInFlight: true });
        const closing = saveThenAllowClose.call(ctx);
        await vi.advanceTimersByTimeAsync(1_950);
        expect(ctx._bulkRatedSaver.whenIdle).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(75);
        expect(ctx._bulkRatedSaver.whenIdle).toHaveBeenCalledTimes(1);
        await closing;
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });
});
