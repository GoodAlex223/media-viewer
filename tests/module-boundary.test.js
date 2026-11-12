// v2 rule M-1 (spec § 6.2), the source scan: main never requires a module's code. Lint already refuses a computed
// require()/import() name in every main-process file (eslint.config.mjs, DYNAMIC_LOAD_BAN; tests/lint-guard.test.js
// proves it fires), so the names main loads are literals, and this scan reads them: none may reach into modules/.
// The one exception the spec allows is main/adapters/index.js, the literal list of reviewed adapters (a later
// phase; absent in P1a).
//
// Blind spots, stated: a computed argument (lint's half), and a require( written inside a string or regex literal,
// which this scan reads as code. Comments are stripped first, so prose that quotes a require is not one.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import config from '../eslint.config.mjs';

const root = path.resolve(__dirname, '..');

// Every string-literal argument of require(…) or import(…) that names something under modules/.
export function findModuleRequires(src) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return [...code.matchAll(/\b(?:require|import)\(\s*(['"`])([^'"`$]*)\1\s*\)/g)]
        .map((m) => m[2])
        .filter((name) => name.includes('modules/'));
}

function jsFilesUnder(dir, keep = () => true) {
    let entries;
    try {
        entries = readdirSync(path.join(root, dir), { recursive: true });
    } catch {
        return [];
    }
    return entries
        .map((f) => `${dir}/${f.split(path.sep).join('/')}`)
        .filter((f) => f.endsWith('.js'))
        .filter(keep);
}

// Block 1 of the lint config, read from the config itself so the two lists cannot drift.
const mainBlock = config.find((block) => Array.isArray(block.files) && block.files.includes('logger.js'));

describe('M-1 source scan', () => {
    it('finds a planted require of module code (control: the scan fires)', () => {
        expect(findModuleRequires("const g = require('../modules/fetch/main/gallery-dl.js');\n")).toEqual([
            '../modules/fetch/main/gallery-dl.js',
        ]);
        expect(findModuleRequires("await import('./modules/x/main/a.js');\n")).toEqual(['./modules/x/main/a.js']);
    });

    it('ignores a require quoted in a comment, and one of a non-module file', () => {
        const src = "// require('../modules/x/main/a.js')\n/* import('./modules/y.js') */\nrequire('./main/x.js');\n";
        expect(findModuleRequires(src)).toEqual([]);
    });

    it("reads block 1's file list from the lint config", () => {
        expect(mainBlock.files).toContain('main.js');
    });

    it('no main-process file requires module code, but main/adapters/index.js', () => {
        const scanned = [
            ...mainBlock.files,
            ...jsFilesUnder('main'),
            ...jsFilesUnder('modules', (f) => f.split('/')[2] === 'main'),
        ];
        expect(scanned.length).toBeGreaterThanOrEqual(mainBlock.files.length);
        const hits = scanned
            .filter((f) => f !== 'main/adapters/index.js')
            .flatMap((f) => findModuleRequires(readFileSync(path.join(root, f), 'utf8')).map((n) => `${f}: ${n}`));
        expect(hits).toEqual([]);
    });
});
