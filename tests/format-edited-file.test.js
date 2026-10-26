import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { planFormat, createIsIgnored, LEFT_TO_COMMIT } = require('../.claude/hooks/format-edited-file.js');

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

    it('win32: skips a path Prettier ignores, asking with the posix root-relative path', () => {
        const asked = [];
        const isIgnored = (relPath) => {
            asked.push(relPath);
            return true;
        };
        const root = String.raw`C:\Users\a\repo`;
        const filePath = String.raw`C:\Users\a\repo\docs\planning\TODO.md`;
        expect(planFormat({ filePath, root, isIgnored }, path.win32)).toEqual({
            action: 'skip',
            reason: 'ignored by Prettier',
        });
        expect(asked).toEqual(['docs/planning/TODO.md']);
    });

    it('formats a path the ignore check passes', () => {
        expect(
            planFormat({ filePath: '/r/repo/src/a.js', root: '/r/repo', isIgnored: () => false }, path.posix)
        ).toEqual({ action: 'format', relPath: 'src/a.js' });
    });

    it('formats when the ignore check throws: Prettier decides, as before the check existed', () => {
        const isIgnored = () => {
            throw new Error('boom');
        };
        expect(planFormat({ filePath: '/r/repo/src/a.js', root: '/r/repo', isIgnored }, path.posix).action).toBe(
            'format'
        );
    });

    it('never asks the ignore check about a path outside the project (the ignore library throws on ../)', () => {
        const isIgnored = () => {
            throw new Error('asked about an outside path');
        };
        expect(planFormat({ filePath: '/r/b.js', root: '/r/repo', isIgnored }, path.posix)).toEqual({
            action: 'skip',
            reason: 'outside the project',
        });
    });

    it('leaves the root media-viewer.js to lint-staged at commit', () => {
        expect(planFormat({ filePath: '/r/repo/media-viewer.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'skip',
            reason: 'left to lint-staged at commit',
        });
        const root = String.raw`C:\Users\a\repo`;
        expect(planFormat({ filePath: String.raw`C:\Users\a\repo\media-viewer.js`, root }, path.win32).action).toBe(
            'skip'
        );
    });

    it('skips the renderer without consulting the ignore check (the CLI builds it only on first use)', () => {
        const isIgnored = () => {
            throw new Error('consulted');
        };
        expect(planFormat({ filePath: '/r/repo/media-viewer.js', root: '/r/repo', isIgnored }, path.posix).reason).toBe(
            'left to lint-staged at commit'
        );
    });

    it('formats a nested file that only shares the renderer name', () => {
        expect(planFormat({ filePath: '/r/repo/tests/media-viewer.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'format',
            relPath: 'tests/media-viewer.js',
        });
    });
});

// The hook skips before spawning Prettier only where Prettier itself would skip, so its matcher
// must agree with Prettier's own: the installed Prettier is the reference, and a Prettier upgrade
// that changes its bundled `ignore` or its default ignore files fails here.
describe('createIsIgnored — the same verdict as Prettier', { timeout: 30000 }, () => {
    // One path per pattern class in .gitignore / .prettierignore, plus their negations; none is tracked.
    const PROBES = [
        'node_modules/x/index.js',
        'tests/node_modules/a.js',
        'docs/new-note.js',
        'NEW.md',
        'tests/UPPER.MD',
        'package-lock.json',
        'tests/e2e/fixtures/new.json',
        'vendor/lucide/new.js',
        'vendor/other/new.js',
        '.trunk/x.json',
        '.claude/settings.local.json',
        '.claude/worktrees/w/main.js',
        '.claude/hooks/new-hook.js',
        '.claude/settings.json',
        'logs/a.js',
        'a.log',
        '.env',
        '.env.local',
        '.env.example',
        'coverage/a.js',
        'dist/a.js',
        'test-results/a.json',
        '.superpowers/brainstorm/a.html',
        '.mcp.json',
        'new-module.js',
    ];

    it('agrees with prettier.getFileInfo on every tracked file and on a probe per pattern class', async () => {
        const prettier = await import('prettier');
        const ignorePath = [path.join(ROOT, '.gitignore'), path.join(ROOT, '.prettierignore')];
        const listing = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
        expect(listing.status, listing.error?.message ?? listing.stderr).toBe(0);
        const tracked = listing.stdout.split('\0').filter(Boolean);
        expect(tracked.length).toBeGreaterThan(100);

        const isIgnored = createIsIgnored(ROOT);
        const mismatches = [];
        let ignoredCount = 0;
        for (const relPath of [...tracked, ...PROBES]) {
            const { ignored } = await prettier.getFileInfo(path.join(ROOT, relPath), { ignorePath });
            if (ignored) {
                ignoredCount++;
            }
            if (isIgnored(relPath) !== ignored) {
                mismatches.push(`${relPath}: hook ${!ignored}, prettier ${ignored}`);
            }
        }
        expect(mismatches).toEqual([]);
        // Not vacuous: both verdicts occur (every .md under docs/ is ignored; every .js at the root is not).
        expect(ignoredCount).toBeGreaterThan(50);
        expect(ignoredCount).toBeLessThan(tracked.length);
    });

    it('ignores only node_modules when neither ignore file exists, as Prettier does', () => {
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-noignore-'));
        try {
            const isIgnored = createIsIgnored(empty);
            expect(isIgnored('node_modules/a.js')).toBe(true);
            expect(isIgnored('a.md')).toBe(false);
            expect(isIgnored('src/a.js')).toBe(false);
        } finally {
            fs.rmSync(empty, { recursive: true, force: true });
        }
    });

    it('throws on a read error other than ENOENT, as Prettier does, so the hook lets Prettier run and report it', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-unreadable-'));
        try {
            fs.mkdirSync(path.join(root, '.prettierignore')); // EISDIR on read
            expect(() => createIsIgnored(root)).toThrow();
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    // getFileInfo has no default ignore path, so the parity test above hands it the hook's own list.
    // The CLI's default is what the hook mirrors: ask the CLI about a path only .gitignore matches and
    // one only .prettierignore matches. A default that dropped either file would make the hook skip
    // files Prettier formats. (A default that gained a file would only make the hook spawn more.)
    it("matches the CLI's default ignore files: .gitignore and .prettierignore", () => {
        const fileInfo = (relPath, ...flags) => {
            const result = spawnSync(
                process.execPath,
                [path.join(ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs'), '--file-info', relPath, ...flags],
                { cwd: ROOT, encoding: 'utf8' }
            );
            expect(result.status, result.stderr).toBe(0);
            return JSON.parse(result.stdout).ignored;
        };
        const isIgnored = createIsIgnored(ROOT);
        for (const relPath of ['logs/a.js', 'docs/x.js']) {
            expect(fileInfo(relPath), relPath).toBe(true);
            expect(isIgnored(relPath), relPath).toBe(true);
        }
        expect(fileInfo('new-module.js')).toBe(false);
        // Controls: each probe is matched by one file only, so a default without it would read false.
        expect(fileInfo('logs/a.js', '--ignore-path', '.prettierignore')).toBe(false);
        expect(fileInfo('docs/x.js', '--ignore-path', '.gitignore')).toBe(false);
    });

    it('uses the ignore version Prettier bundles', () => {
        const notices = fs.readFileSync(path.join(ROOT, 'node_modules', 'prettier', 'THIRD-PARTY-NOTICES.md'), 'utf8');
        const bundled = [...notices.matchAll(/^## ignore@v(\S+)$/gm)].map((match) => match[1]);
        expect(bundled).toHaveLength(1);
        expect(require('ignore/package.json').version).toBe(bundled[0]);
    });
});

// The renderer is left to lint-staged on the premise that lint-staged formats it at commit. Ask
// lint-staged's own matcher, with the package.json config, rather than trust the comment.
describe('LEFT_TO_COMMIT — lint-staged formats each one at commit', () => {
    it('gives every exempt path a task that runs prettier --write; a narrower config gives none', async () => {
        const { generateTasks } = await import(
            pathToFileURL(path.join(ROOT, 'node_modules', 'lint-staged', 'lib', 'generateTasks.js')).href
        );
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))['lint-staged'];
        const formatsAtCommit = (cfg, relPath) =>
            generateTasks({ config: cfg, cwd: ROOT, files: [path.join(ROOT, relPath)], relative: true }).some(
                (task) => task.fileList.includes(relPath) && task.commands.some((c) => c.startsWith('prettier --write'))
            );
        expect(LEFT_TO_COMMIT.size).toBeGreaterThan(0);
        for (const relPath of LEFT_TO_COMMIT) {
            expect(formatsAtCommit(config, relPath), relPath).toBe(true);
            expect(formatsAtCommit({ '*.cjs': ['prettier --write'] }, relPath), relPath).toBe(false);
        }
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

// The hook's saving is that it never starts Prettier for these paths, and an untouched file cannot
// show that: Prettier leaves ignored files untouched itself. So the hook runs from a copy in a temp
// root with no Prettier installed, where every spawn fails loudly on stderr. A skipped path is silent;
// a formatted one (the control) reports the failed spawn.
describe('format-edited-file CLI — skips before spawning Prettier', { timeout: 20000 }, () => {
    let tmpRoot;
    const NODE_PATH = path.join(ROOT, 'node_modules'); // lets the copied hook load `ignore`, not Prettier
    const runCopiedHook = (relPath, env) =>
        spawnSync(process.execPath, [path.join(tmpRoot, '.claude', 'hooks', 'format-edited-file.js')], {
            input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(tmpRoot, relPath) } }),
            cwd: tmpRoot,
            encoding: 'utf8',
            env,
        });
    const envWithout = (name) => Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== name));

    afterEach(() => {
        if (tmpRoot) {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
            tmpRoot = undefined;
        }
    });

    const makeRoot = () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-root-'));
        fs.mkdirSync(path.join(tmpRoot, '.claude', 'hooks'), { recursive: true });
        fs.copyFileSync(HOOK, path.join(tmpRoot, '.claude', 'hooks', 'format-edited-file.js'));
        fs.writeFileSync(path.join(tmpRoot, '.prettierignore'), '*.md\n');
        fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'build/\n');
        fs.mkdirSync(path.join(tmpRoot, 'build'));
        for (const name of ['a.md', 'build/out.js', 'media-viewer.js', 'b.js']) {
            fs.writeFileSync(path.join(tmpRoot, name), UGLY_JS);
        }
    };

    it('starts no Prettier for a .prettierignore path, a .gitignore path or the renderer; the control does', () => {
        makeRoot();
        const env = { ...envWithout('NODE_PATH'), NODE_PATH };
        for (const relPath of ['a.md', 'build/out.js', 'media-viewer.js']) {
            const result = runCopiedHook(relPath, env);
            expect(result.status).toBe(0);
            expect(result.stderr, relPath).toBe('');
        }
        const control = runCopiedHook('b.js', env);
        expect(control.status).toBe(0);
        expect(control.stderr).toContain('prettier did not format b.js');
    });

    it('asks Prettier, as before the check existed, when the ignore library cannot load', () => {
        makeRoot();
        // A throwing `ignore` the copy resolves before any ancestor's or global node_modules, so the
        // test does not depend on what the machine has installed. It leaves a sentinel to prove it ran.
        const stub = path.join(tmpRoot, 'node_modules', 'ignore');
        fs.mkdirSync(stub, { recursive: true });
        fs.writeFileSync(
            path.join(stub, 'index.js'),
            "require('fs').writeFileSync(__dirname + '/loaded', '');\nthrow new Error('ignore stub');\n"
        );
        const result = runCopiedHook('a.md', envWithout('NODE_PATH'));
        expect(result.status).toBe(0);
        expect(fs.existsSync(path.join(stub, 'loaded'))).toBe(true);
        expect(result.stderr).toContain('prettier did not format a.md');
    });
});
