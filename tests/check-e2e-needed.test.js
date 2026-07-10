import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parsePushRefs, classifyPaths } = require('../scripts/check-e2e-needed.js');

const ZEROS = '0000000000000000000000000000000000000000';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('parsePushRefs', () => {
    it('parses a single ref line', () => {
        const refs = parsePushRefs(`refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}\n`);
        expect(refs).toEqual([
            { localRef: 'refs/heads/main', localSha: SHA_A, remoteRef: 'refs/heads/main', remoteSha: SHA_B },
        ]);
    });

    it('parses multiple ref lines', () => {
        const stdin = `refs/heads/a ${SHA_A} refs/heads/a ${SHA_B}\n` + `refs/heads/b ${SHA_B} refs/heads/b ${ZEROS}\n`;
        expect(parsePushRefs(stdin)).toHaveLength(2);
    });

    it('drops a branch-delete ref (all-zero localSha)', () => {
        const stdin = `(delete) ${ZEROS} refs/heads/gone ${SHA_B}\n`;
        expect(parsePushRefs(stdin)).toEqual([]);
    });

    it('preserves a new-branch ref (all-zero remoteSha) with its zero remoteSha', () => {
        const refs = parsePushRefs(`refs/heads/new ${SHA_A} refs/heads/new ${ZEROS}\n`);
        expect(refs).toHaveLength(1);
        expect(refs[0].remoteSha).toBe(ZEROS);
    });

    it('returns [] for empty or whitespace-only stdin', () => {
        expect(parsePushRefs('')).toEqual([]);
        expect(parsePushRefs('   \n  \n')).toEqual([]);
    });
});

describe('classifyPaths', () => {
    it('returns false (skip) when every path is markdown', () => {
        expect(classifyPaths(['CLAUDE.md', 'docs/planning/WEEKLY.md', 'README.md'])).toBe(false);
    });

    it('returns false (skip) when every path is under docs/ (incl. non-md)', () => {
        expect(classifyPaths(['docs/superpowers/specs/x.md', 'docs/planning/notes.txt'])).toBe(false);
    });

    it('returns true (run) when any path is a JS source file', () => {
        expect(classifyPaths(['docs/planning/WEEKLY.md', 'media-viewer.js'])).toBe(true);
    });

    it('returns true (run) for hook/config/html/css runtime paths', () => {
        expect(classifyPaths(['.husky/pre-push'])).toBe(true);
        expect(classifyPaths(['index.html'])).toBe(true);
        expect(classifyPaths(['styles.css'])).toBe(true);
        expect(classifyPaths(['package.json'])).toBe(true);
        expect(classifyPaths(['tests/e2e/navigation.test.js'])).toBe(true);
    });

    it('returns false (skip) for an empty list', () => {
        expect(classifyPaths([])).toBe(false);
    });

    it('treats a root-level .md as docs (skip)', () => {
        expect(classifyPaths(['CLAUDE.md'])).toBe(false);
    });
});
