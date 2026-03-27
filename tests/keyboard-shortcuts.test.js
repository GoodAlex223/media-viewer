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
            next: 'KeyD',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
        });
    });

    it('compare mode has left/right like/dislike, next, previous, undo', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.compare).toEqual({
            leftLike: 'KeyQ',
            leftDislike: 'KeyW',
            rightLike: 'KeyE',
            rightDislike: 'KeyR',
            next: 'KeyD',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
        });
    });
});

describe('loadShortcuts', () => {
    const loadShortcuts = extractMethod('loadShortcuts');
    let origLocalStorage;

    beforeEach(() => {
        origLocalStorage = globalThis.localStorage;
    });

    afterEach(() => {
        globalThis.localStorage = origLocalStorage;
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
        expect(result.single['KeyD']).toBe('next');
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
        };
        saveShortcut.call(ctx, 'single', 'like', 'KeyT');
        expect(ctx.shortcuts.single.like).toBe('KeyT');
        const saved = JSON.parse(stored.customShortcuts);
        expect(saved.single.like).toBe('KeyT');
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
        };
        saveShortcut.call(ctx, 'single', 'like', 'KeyT');
        expect(rebuildCalled).toBe(true);
    });
});

describe('resetShortcuts', () => {
    const resetShortcuts = extractMethod('resetShortcuts');
    let origLocalStorage;

    beforeEach(() => {
        origLocalStorage = globalThis.localStorage;
    });

    afterEach(() => {
        globalThis.localStorage = origLocalStorage;
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
        };
        resetShortcuts.call(ctx);
        expect(ctx.shortcuts.single).toEqual(defaults.single);
        expect(ctx.shortcuts.compare).toEqual(defaults.compare);
        expect(removedKey).toBe('customShortcuts');
    });
});
