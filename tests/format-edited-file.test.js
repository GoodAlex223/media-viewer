import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { planFormat } = require('../.claude/hooks/format-edited-file.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'format-edited-file.js');
const UGLY_JS = 'const   a  =  {b:1}\n';
const PRETTY_JS = 'const a = { b: 1 };\n';

describe('planFormat — which edited file gets formatted', () => {
    it('skips a missing, empty or blank path (the old hook formatted the whole cwd here)', () => {
        for (const filePath of [undefined, null, '', '   ']) {
            expect(planFormat({ filePath, root: '/r/repo' }, path.posix)).toEqual({
                action: 'skip',
                reason: 'no file path',
            });
        }
    });

    it('formats a file inside the project, as a root-relative path', () => {
        expect(planFormat({ filePath: '/r/repo/src/a.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'format',
            relPath: 'src/a.js',
        });
    });

    it('skips a sibling directory that merely shares the root as a prefix', () => {
        expect(planFormat({ filePath: '/r/repoX/a.js', root: '/r/repo' }, path.posix).action).toBe('skip');
    });

    it('skips a path that escapes the root through ..', () => {
        expect(planFormat({ filePath: '/r/repo/../b.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'skip',
            reason: 'outside the project',
        });
    });

    it('does not mistake a root file whose name starts with .. for an escape', () => {
        expect(planFormat({ filePath: '/r/repo/..foo.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'format',
            relPath: '..foo.js',
        });
    });

    it('skips the root directory itself', () => {
        expect(planFormat({ filePath: '/r/repo', root: '/r/repo' }, path.posix).action).toBe('skip');
    });

    it('win32: formats a lowercase-drive, forward-slash path under an uppercase-drive root', () => {
        const root = String.raw`C:\Users\a\repo`;
        expect(planFormat({ filePath: 'c:/Users/a/repo/x.js', root }, path.win32)).toEqual({
            action: 'format',
            relPath: 'x.js',
        });
    });

    it('win32: skips a file on another drive', () => {
        const root = String.raw`C:\Users\a\repo`;
        expect(planFormat({ filePath: String.raw`D:\x.js`, root }, path.win32).action).toBe('skip');
    });

    it('win32: skips a memory file under ~/.claude (outside the project)', () => {
        const root = String.raw`C:\Users\a\Projects\repo`;
        const memory = String.raw`C:\Users\a\.claude\projects\p\memory\note.md`;
        expect(planFormat({ filePath: memory, root }, path.win32)).toEqual({
            action: 'skip',
            reason: 'outside the project',
        });
    });
});

// Each test spawns node (and Prettier): above vitest's 5 s default under Windows spawn latency
// (the check-secrets timeout flake, BACKLOG [2026-09-24]).
describe('format-edited-file CLI — run as Claude Code runs it', { timeout: 20000 }, () => {
    const created = [];
    const probe = (relPath, content) => {
        const abs = path.join(ROOT, relPath);
        fs.writeFileSync(abs, content);
        created.push(abs);
        return abs;
    };
    const runHook = (stdin, cwd = ROOT) => spawnSync(process.execPath, [HOOK], { input: stdin, cwd, encoding: 'utf8' });
    const edited = (filePath) => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } });

    afterEach(() => {
        for (const abs of created.splice(0)) {
            fs.rmSync(abs, { force: true });
        }
    });

    it('formats the one edited in-repo file and leaves a mis-formatted sibling untouched — from a subdirectory cwd', () => {
        // The session cwd is docs/planning: a hook that inherited it (instead of running Prettier
        // from the repo root) would either miss the file or lose .prettierignore — both caught here
        // and by the next test.
        const a = probe(`tests/__fmt_probe_a_${process.pid}.js`, UGLY_JS);
        const b = probe(`tests/__fmt_probe_b_${process.pid}.js`, UGLY_JS);
        const result = runHook(edited(a), path.join(ROOT, 'docs', 'planning'));
        expect(result.status).toBe(0);
        expect(fs.readFileSync(a, 'utf8')).toBe(PRETTY_JS);
        expect(fs.readFileSync(b, 'utf8')).toBe(UGLY_JS);
    });

    it('honours .prettierignore even when the session cwd is a subdirectory', () => {
        const md = probe(`docs/__fmt_probe_${process.pid}.md`, '*  x\n*  y\n');
        const result = runHook(edited(md), path.join(ROOT, 'docs', 'planning'));
        expect(result.status).toBe(0);
        expect(fs.readFileSync(md, 'utf8')).toBe('*  x\n*  y\n');
    });

    it('leaves a file outside the repo untouched', () => {
        const outside = path.join(os.tmpdir(), `__fmt_probe_outside_${process.pid}.js`);
        fs.writeFileSync(outside, UGLY_JS);
        created.push(outside);
        expect(runHook(edited(outside)).status).toBe(0);
        expect(fs.readFileSync(outside, 'utf8')).toBe(UGLY_JS);
    });

    it('exits 0 on empty, malformed or path-less input', () => {
        expect(runHook('').status).toBe(0);
        expect(runHook('{not json').status).toBe(0);
        expect(runHook(JSON.stringify({ tool_input: {} })).status).toBe(0);
    });

    it('exits 0 and leaves an unparseable file exactly as written, saying why on stderr', () => {
        const bad = probe(`tests/__fmt_probe_bad_${process.pid}.js`, 'const = ;\n');
        const result = runHook(edited(bad));
        expect(result.status).toBe(0);
        expect(fs.readFileSync(bad, 'utf8')).toBe('const = ;\n');
        expect(result.stderr).toContain('prettier did not format');
    });
});
