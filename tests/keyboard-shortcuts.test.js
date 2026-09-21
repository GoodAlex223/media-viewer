import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

function extractDefaultShortcuts() {
    const match = source.match(/const DEFAULT_SHORTCUTS\s*=\s*(\{[\s\S]*?\n\});/);
    if (!match) throw new Error('Could not find DEFAULT_SHORTCUTS');
    return new Function(`return ${match[1]}`)();
}

function extractMethod(methodName) {
    const regex = new RegExp(`^\\s{4}${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) throw new Error(`Could not find method: ${methodName}`);
    const startIndex = match.index;
    let braceCount = 0;
    let methodEnd = -1;
    const searchStart = startIndex + match[0].length - 1;
    for (let i = searchStart; i < source.length; i++) {
        if (source[i] === '{') braceCount++;
        if (source[i] === '}') braceCount--;
        if (braceCount === 0) {
            methodEnd = i + 1;
            break;
        }
    }
    const methodBody = source.substring(searchStart + 1, methodEnd - 1);
    return new Function(match[1], methodBody);
}

describe('DEFAULT_SHORTCUTS', () => {
    it('has single and compare modes', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts).toHaveProperty('single');
        expect(shortcuts).toHaveProperty('compare');
    });

    it('single mode has like, dislike, next, previous, undo', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.single).toEqual({
            like: 'KeyQ',
            dislike: 'KeyW',
            next: 'KeyS',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
        });
    });

    it('compare mode has left/right like/dislike, next, previous, undo, special', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.compare).toEqual({
            leftLike: 'KeyQ',
            leftDislike: 'KeyW',
            rightLike: 'KeyE',
            rightDislike: 'KeyR',
            next: 'KeyS',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
            bothGood: 'KeyD',
            bothBad: 'KeyF',
            leftSpecial: 'Digit1',
            rightSpecial: 'Digit2',
        });
    });

    it('compare mode mirrors tournament for the special-folder bindings', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.compare.leftSpecial).toBe(shortcuts.tournament.leftSpecial);
        expect(shortcuts.compare.rightSpecial).toBe(shortcuts.tournament.rightSpecial);
    });

    it('single mode has no special-folder binding', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.single.leftSpecial).toBeUndefined();
        expect(shortcuts.single.rightSpecial).toBeUndefined();
        expect(shortcuts.single.special).toBeUndefined();
    });

    it('compare mode has no duplicate key bindings', () => {
        const shortcuts = extractDefaultShortcuts();
        const keys = Object.values(shortcuts.compare);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('tournament mode includes bothWin=D and bothLose=F', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.tournament.bothWin).toBe('KeyD');
        expect(shortcuts.tournament.bothLose).toBe('KeyF');
    });

    it('tournament mode has no duplicate key bindings', () => {
        const shortcuts = extractDefaultShortcuts();
        const keys = Object.values(shortcuts.tournament);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('loadShortcuts', () => {
    const loadShortcuts = extractMethod('loadShortcuts');
    let origLocalStorage;
    let origDefaultShortcuts;

    beforeEach(() => {
        origLocalStorage = globalThis.localStorage;
        origDefaultShortcuts = globalThis.DEFAULT_SHORTCUTS;
        globalThis.DEFAULT_SHORTCUTS = extractDefaultShortcuts();
    });

    afterEach(() => {
        globalThis.localStorage = origLocalStorage;
        globalThis.DEFAULT_SHORTCUTS = origDefaultShortcuts;
    });

    it('returns defaults when no custom shortcuts in localStorage', () => {
        globalThis.localStorage = { getItem: () => null };
        const defaults = extractDefaultShortcuts();
        const result = loadShortcuts.call({});
        expect(result.single).toEqual(defaults.single);
        expect(result.compare).toEqual(defaults.compare);
    });

    it('merges custom overrides with defaults', () => {
        const customShortcuts = { single: { like: 'KeyT' } };
        globalThis.localStorage = { getItem: () => JSON.stringify(customShortcuts) };
        const result = loadShortcuts.call({});
        expect(result.single.like).toBe('KeyT');
        expect(result.single.dislike).toBe('KeyW');
        expect(result.compare.leftLike).toBe('KeyQ');
    });

    it('handles invalid JSON in localStorage gracefully', () => {
        globalThis.localStorage = { getItem: () => 'not-json' };
        const result = loadShortcuts.call({});
        const defaults = extractDefaultShortcuts();
        expect(result.single).toEqual(defaults.single);
    });
});

describe('loadShortcuts migration (v1 -> v2)', () => {
    const loadShortcuts = extractMethod('loadShortcuts');
    let origLocalStorage;
    let origDefaultShortcuts;

    beforeEach(() => {
        origLocalStorage = globalThis.localStorage;
        origDefaultShortcuts = globalThis.DEFAULT_SHORTCUTS;
        globalThis.DEFAULT_SHORTCUTS = extractDefaultShortcuts();
    });

    afterEach(() => {
        globalThis.localStorage = origLocalStorage;
        globalThis.DEFAULT_SHORTCUTS = origDefaultShortcuts;
    });

    it('drops a stale next override so the new KeyS default applies', () => {
        const stale = {
            single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            compare: {
                leftLike: 'KeyQ',
                leftDislike: 'KeyW',
                rightLike: 'KeyE',
                rightDislike: 'KeyR',
                next: 'KeyD',
                previous: 'KeyA',
                undo: 'Ctrl+KeyA',
            },
        };
        const stored = { customShortcuts: JSON.stringify(stale) };
        globalThis.localStorage = {
            getItem: (k) => stored[k] ?? null,
            setItem: (k, v) => {
                stored[k] = v;
            },
        };
        const result = loadShortcuts.call({});
        expect(result.single.next).toBe('KeyS');
        expect(result.compare.next).toBe('KeyS');
        // bothGood/bothBad come from defaults since they were never stored
        expect(result.compare.bothGood).toBe('KeyD');
        expect(result.compare.bothBad).toBe('KeyF');
        // migration persisted: version bumped, stale next removed
        const persisted = JSON.parse(stored.customShortcuts);
        expect(persisted.version).toBe(2);
        expect(persisted.single.next).toBeUndefined();
        expect(persisted.compare.next).toBeUndefined();
    });

    it('preserves an intentional non-next remap through migration', () => {
        const stale = { single: { like: 'KeyT', next: 'KeyD' } };
        const stored = { customShortcuts: JSON.stringify(stale) };
        globalThis.localStorage = {
            getItem: (k) => stored[k] ?? null,
            setItem: (k, v) => {
                stored[k] = v;
            },
        };
        const result = loadShortcuts.call({});
        expect(result.single.like).toBe('KeyT'); // intentional remap kept
        expect(result.single.next).toBe('KeyS'); // stale next dropped -> new default
    });

    it('does not re-migrate (or clobber an intentional next remap) when version is current', () => {
        const current = { version: 2, single: { next: 'KeyP' } };
        const stored = { customShortcuts: JSON.stringify(current) };
        let setCalled = false;
        globalThis.localStorage = {
            getItem: (k) => stored[k] ?? null,
            setItem: () => {
                setCalled = true;
            },
        };
        const result = loadShortcuts.call({});
        expect(result.single.next).toBe('KeyP'); // post-v2 intentional remap preserved
        expect(setCalled).toBe(false); // no re-persist
    });
});

describe('buildKeyString', () => {
    const buildKeyString = extractMethod('buildKeyString');

    it('returns e.code for simple key', () => {
        const e = { code: 'KeyQ', ctrlKey: false, shiftKey: false };
        expect(buildKeyString.call({}, e)).toBe('KeyQ');
    });

    it('prepends Ctrl+ when ctrlKey is true', () => {
        const e = { code: 'KeyA', ctrlKey: true, shiftKey: false };
        expect(buildKeyString.call({}, e)).toBe('Ctrl+KeyA');
    });

    it('prepends Shift+ when shiftKey is true', () => {
        const e = { code: 'KeyD', ctrlKey: false, shiftKey: true };
        expect(buildKeyString.call({}, e)).toBe('Shift+KeyD');
    });

    it('prepends both Ctrl+Shift+ when both are true', () => {
        const e = { code: 'KeyZ', ctrlKey: true, shiftKey: true };
        expect(buildKeyString.call({}, e)).toBe('Ctrl+Shift+KeyZ');
    });

    it('handles non-letter codes', () => {
        const e = { code: 'Space', ctrlKey: false, shiftKey: false };
        expect(buildKeyString.call({}, e)).toBe('Space');
    });
});

describe('buildReverseMap', () => {
    const buildReverseMap = extractMethod('buildReverseMap');

    it('builds correct reverse map for single mode', () => {
        const shortcuts = extractDefaultShortcuts();
        const ctx = { shortcuts };
        const result = buildReverseMap.call(ctx);
        expect(result.single['KeyQ']).toBe('like');
        expect(result.single['KeyW']).toBe('dislike');
        expect(result.single['KeyS']).toBe('next');
        expect(result.single['KeyA']).toBe('previous');
        expect(result.single['Ctrl+KeyA']).toBe('undo');
    });

    it('builds correct reverse map for compare mode', () => {
        const shortcuts = extractDefaultShortcuts();
        const ctx = { shortcuts };
        const result = buildReverseMap.call(ctx);
        expect(result.compare['KeyQ']).toBe('leftLike');
        expect(result.compare['KeyE']).toBe('rightLike');
        expect(result.compare['KeyR']).toBe('rightDislike');
    });

    // Dispatch isolation comes from the mode-keyed reverse map, not from action-name
    // uniqueness: leftSpecial exists in BOTH compare and tournament and resolves to a
    // different handler in each (see the executeAction per-mode tests below).
    it('maps Digit1/Digit2 to the special actions in compare and tournament, but not single', () => {
        const shortcuts = extractDefaultShortcuts();
        const result = buildReverseMap.call({ shortcuts });
        expect(result.compare['Digit1']).toBe('leftSpecial');
        expect(result.compare['Digit2']).toBe('rightSpecial');
        expect(result.tournament['Digit1']).toBe('leftSpecial');
        expect(result.tournament['Digit2']).toBe('rightSpecial');
        expect(result.single['Digit1']).toBeUndefined();
        expect(result.single['Digit2']).toBeUndefined();
    });

    it('reverse map reflects custom overrides', () => {
        const shortcuts = {
            single: { like: 'KeyT', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            compare: {
                leftLike: 'KeyQ',
                leftDislike: 'KeyW',
                rightLike: 'KeyE',
                rightDislike: 'KeyR',
                next: 'KeyD',
                previous: 'KeyA',
                undo: 'Ctrl+KeyA',
            },
        };
        const ctx = { shortcuts };
        const result = buildReverseMap.call(ctx);
        expect(result.single['KeyT']).toBe('like');
        expect(result.single['KeyQ']).toBeUndefined();
    });
});

describe('executeAction', () => {
    const executeAction = extractMethod('executeAction');

    it('calls handleLike for "like" action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'like');
        expect(ctx.handleLike).toHaveBeenCalledOnce();
        expect(ctx.handleDislike).not.toHaveBeenCalled();
    });

    it('calls nextMedia for "next" action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'next');
        expect(ctx.nextMedia).toHaveBeenCalledOnce();
    });

    it('calls handleRightDislike for "rightDislike" action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'rightDislike');
        expect(ctx.handleRightDislike).toHaveBeenCalledOnce();
    });

    it('does nothing for unknown action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'nonexistent');
        expect(ctx.handleLike).not.toHaveBeenCalled();
        expect(ctx.nextMedia).not.toHaveBeenCalled();
    });

    describe('special-folder actions route per mode', () => {
        function specialCtx(mode) {
            return {
                isCompareMode: mode === 'compare',
                isTournamentMode: mode === 'tournament',
                moveToSpecialFolder: vi.fn(),
                handleTournamentSpecial: vi.fn(),
            };
        }

        it('compare mode moves the chosen side to the special folder', () => {
            const ctx = specialCtx('compare');
            executeAction.call(ctx, 'leftSpecial');
            expect(ctx.moveToSpecialFolder).toHaveBeenCalledWith('left');
            expect(ctx.handleTournamentSpecial).not.toHaveBeenCalled();

            executeAction.call(ctx, 'rightSpecial');
            expect(ctx.moveToSpecialFolder).toHaveBeenCalledWith('right');
            expect(ctx.moveToSpecialFolder).toHaveBeenCalledTimes(2);
        });

        it('tournament mode routes through handleTournamentSpecial, not moveToSpecialFolder', () => {
            const ctx = specialCtx('tournament');
            executeAction.call(ctx, 'leftSpecial');
            expect(ctx.handleTournamentSpecial).toHaveBeenCalledWith('left');
            expect(ctx.moveToSpecialFolder).not.toHaveBeenCalled();

            executeAction.call(ctx, 'rightSpecial');
            expect(ctx.handleTournamentSpecial).toHaveBeenCalledWith('right');
        });

        // Single mode has no Digit1/Digit2 binding, so the reverse map never produces
        // these actions there; the handler guard is the second line of defence.
        it('single mode does nothing for either special action', () => {
            const ctx = specialCtx('single');
            executeAction.call(ctx, 'leftSpecial');
            executeAction.call(ctx, 'rightSpecial');
            expect(ctx.moveToSpecialFolder).not.toHaveBeenCalled();
            expect(ctx.handleTournamentSpecial).not.toHaveBeenCalled();
        });
    });
});

describe('checkShortcutConflict', () => {
    const checkShortcutConflict = extractMethod('checkShortcutConflict');

    it('returns null when key is not in use', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyT')).toBeNull();
    });

    it('returns conflicting action name when key is already used', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyW')).toBe('dislike');
    });

    it('allows reassigning same key to same action', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyQ')).toBeNull();
    });

    it('checks only within the same mode', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyE')).toBeNull();
    });

    it('blocks reserved keys used by fixed utility shortcuts', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'F1')).toBe('_reserved');
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'Space')).toBe('_reserved');
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyI')).toBe('_reserved');
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyZ')).toBe('_reserved');
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyX')).toBe('_reserved');
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'Escape')).toBe('_reserved');
    });

    it('reports the new compare special bindings as conflicts', () => {
        const ctx = { shortcuts: extractDefaultShortcuts() };
        expect(checkShortcutConflict.call(ctx, 'compare', 'leftLike', 'Digit1')).toBe('leftSpecial');
        expect(checkShortcutConflict.call(ctx, 'compare', 'leftLike', 'Digit2')).toBe('rightSpecial');
    });

    it('does not treat Digit1/Digit2 as reserved keys', () => {
        const ctx = { shortcuts: extractDefaultShortcuts() };
        expect(checkShortcutConflict.call(ctx, 'compare', 'leftSpecial', 'Digit1')).toBeNull();
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'Digit1')).toBeNull();
    });
});

describe('_specialShortcutSuffix', () => {
    const _specialShortcutSuffix = extractMethod('_specialShortcutSuffix');
    const keyDisplayName = extractMethod('keyDisplayName');

    function ctxWith(shortcuts) {
        return { shortcuts, keyDisplayName };
    }

    it('renders the bound key as a parenthesised suffix', () => {
        const ctx = ctxWith(extractDefaultShortcuts());
        expect(_specialShortcutSuffix.call(ctx, 'compare', 'leftSpecial')).toBe(' (1)');
        expect(_specialShortcutSuffix.call(ctx, 'compare', 'rightSpecial')).toBe(' (2)');
        expect(_specialShortcutSuffix.call(ctx, 'tournament', 'leftSpecial')).toBe(' (1)');
    });

    // The whole point of deriving rather than hardcoding: a remap must reach the tooltip.
    it('follows a remapped binding instead of the default', () => {
        const shortcuts = extractDefaultShortcuts();
        shortcuts.compare.leftSpecial = 'Digit9';
        expect(_specialShortcutSuffix.call(ctxWith(shortcuts), 'compare', 'leftSpecial')).toBe(' (9)');
    });

    it('renders a modifier binding through keyDisplayName', () => {
        const shortcuts = extractDefaultShortcuts();
        shortcuts.compare.leftSpecial = 'Ctrl+Digit1';
        expect(_specialShortcutSuffix.call(ctxWith(shortcuts), 'compare', 'leftSpecial')).toBe(' (Ctrl+1)');
    });

    it('returns an empty string when the action is unbound in that mode', () => {
        const ctx = ctxWith(extractDefaultShortcuts());
        expect(_specialShortcutSuffix.call(ctx, 'single', 'special')).toBe('');
        expect(_specialShortcutSuffix.call(ctx, 'single', 'leftSpecial')).toBe('');
    });

    it('returns an empty string for an unknown mode rather than throwing', () => {
        const ctx = ctxWith(extractDefaultShortcuts());
        expect(_specialShortcutSuffix.call(ctx, 'nosuchmode', 'leftSpecial')).toBe('');
    });
});

describe('saveShortcut', () => {
    const saveShortcut = extractMethod('saveShortcut');
    let origLocalStorage;

    beforeEach(() => {
        origLocalStorage = globalThis.localStorage;
    });

    afterEach(() => {
        globalThis.localStorage = origLocalStorage;
    });

    it('updates shortcut map and saves to localStorage', () => {
        const stored = {};
        globalThis.localStorage = {
            setItem: (k, v) => {
                stored[k] = v;
            },
            removeItem: () => {},
        };
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                return { single: {}, compare: {} };
            },
            updateSpecialButtonsState: vi.fn(),
        };
        saveShortcut.call(ctx, 'single', 'like', 'KeyT');
        expect(ctx.shortcuts.single.like).toBe('KeyT');
        const saved = JSON.parse(stored.customShortcuts);
        expect(saved.single.like).toBe('KeyT');
        expect(saved.version).toBe(2); // version persisted so migration does not re-run
    });

    it('rebuilds reverse map after save', () => {
        globalThis.localStorage = { setItem: () => {}, removeItem: () => {} };
        let rebuildCalled = false;
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                rebuildCalled = true;
                return { single: {}, compare: {} };
            },
            updateSpecialButtonsState: vi.fn(),
        };
        saveShortcut.call(ctx, 'single', 'like', 'KeyT');
        expect(rebuildCalled).toBe(true);
    });

    // The special tooltips are derived from this.shortcuts, so a remap that does not
    // refresh them leaves the button advertising the old key while F1 shows the new one.
    it('refreshes the special-button tooltips so a remap reaches them', () => {
        globalThis.localStorage = { setItem: () => {}, removeItem: () => {} };
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ' },
                compare: { leftLike: 'KeyQ', leftSpecial: 'Digit1' },
            },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                return { single: {}, compare: {} };
            },
            updateSpecialButtonsState: vi.fn(),
        };
        saveShortcut.call(ctx, 'compare', 'leftSpecial', 'Digit9');
        expect(ctx.updateSpecialButtonsState).toHaveBeenCalledOnce();
    });
});

describe('resetShortcuts', () => {
    const resetShortcuts = extractMethod('resetShortcuts');
    let origLocalStorage;
    let origDefaultShortcuts;

    beforeEach(() => {
        origLocalStorage = globalThis.localStorage;
        origDefaultShortcuts = globalThis.DEFAULT_SHORTCUTS;
        globalThis.DEFAULT_SHORTCUTS = extractDefaultShortcuts();
    });

    afterEach(() => {
        globalThis.localStorage = origLocalStorage;
        globalThis.DEFAULT_SHORTCUTS = origDefaultShortcuts;
    });

    it('restores defaults and clears localStorage', () => {
        let removedKey = null;
        globalThis.localStorage = {
            removeItem: (k) => {
                removedKey = k;
            },
        };
        const defaults = extractDefaultShortcuts();
        const ctx = {
            shortcuts: {
                single: { like: 'KeyT', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: {
                    leftLike: 'KeyQ',
                    leftDislike: 'KeyW',
                    rightLike: 'KeyE',
                    rightDislike: 'KeyR',
                    next: 'KeyD',
                    previous: 'KeyA',
                    undo: 'Ctrl+KeyA',
                },
            },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                return { single: {}, compare: {} };
            },
            updateSpecialButtonsState: vi.fn(),
            stopListeningMode() {},
            _listeningState: null,
        };
        resetShortcuts.call(ctx);
        expect(ctx.shortcuts.single).toEqual(defaults.single);
        expect(ctx.shortcuts.compare).toEqual(defaults.compare);
        expect(removedKey).toBe('customShortcuts');
    });

    it('refreshes the special-button tooltips after restoring defaults', () => {
        globalThis.localStorage = { removeItem: () => {} };
        const ctx = {
            shortcuts: { single: {}, compare: { leftSpecial: 'Digit9' } },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                return { single: {}, compare: {} };
            },
            updateSpecialButtonsState: vi.fn(),
            stopListeningMode() {},
            _listeningState: null,
        };
        resetShortcuts.call(ctx);
        expect(ctx.updateSpecialButtonsState).toHaveBeenCalledOnce();
    });
});
