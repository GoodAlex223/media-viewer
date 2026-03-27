import { describe, it, expect, vi } from 'vitest';
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

    it('returns defaults when no custom shortcuts in localStorage', () => {
        const defaults = extractDefaultShortcuts();
        const ctx = { localStorage: { getItem: () => null } };
        const result = loadShortcuts.call(ctx);
        expect(result.single).toEqual(defaults.single);
        expect(result.compare).toEqual(defaults.compare);
    });

    it('merges custom overrides with defaults', () => {
        const customShortcuts = { single: { like: 'KeyT' } };
        const ctx = { localStorage: { getItem: () => JSON.stringify(customShortcuts) } };
        const result = loadShortcuts.call(ctx);
        expect(result.single.like).toBe('KeyT');
        expect(result.single.dislike).toBe('KeyW');
        expect(result.compare.leftLike).toBe('KeyQ');
    });

    it('handles invalid JSON in localStorage gracefully', () => {
        const ctx = { localStorage: { getItem: () => 'not-json' } };
        const result = loadShortcuts.call(ctx);
        const defaults = extractDefaultShortcuts();
        expect(result.single).toEqual(defaults.single);
    });
});
