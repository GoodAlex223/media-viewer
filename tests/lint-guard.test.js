// G1 lint guard: proves the eslint.config.mjs rules FIRE, through ESLint's own Node API with the
// project config — a rule that never fires reads as a control while protecting nothing.
//   - renderer files: no HTML parsing of a built string (innerHTML/outerHTML assigned anything but
//     a static string, insertAdjacentHTML, document.write/writeln)
//   - main.js, main/**, modules/*/main/**: no ipcMain registration outside the ipc-guard wrapper
//   - every main-process file: no require()/import() of a computed name (v2 rule M-1)
//   - module code (modules/*/ui/**, modules/*/workers/**): reaches the app only through `host` (v2 rule M-2),
//     and imports nothing outside its own folder but core/host-api.js (mv/module-imports)
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { readdirSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'eslint.config.mjs') });

// Lints `code` as if it were the repo file `asFile`, so that file's config block applies.
async function restricted(code, asFile) {
    return byRule(code, asFile, 'no-restricted-syntax');
}

async function imports(code, asFile) {
    return byRule(code, asFile, 'mv/module-imports');
}

async function byRule(code, asFile, ruleId) {
    const [result] = await eslint.lintText(code, { filePath: path.join(root, asFile) });
    return result.messages.filter((m) => m.ruleId === ruleId);
}

// Every real .js file under a repo folder, as repo-relative paths with forward slashes ([] when it is absent).
function jsFilesUnder(dir) {
    let entries;
    try {
        entries = readdirSync(path.join(root, dir), { recursive: true });
    } catch {
        return [];
    }
    return entries.filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f.split(path.sep).join('/')}`);
}

const RENDERER_FILES = [
    'media-viewer.js',
    'tournament.js',
    'fullscreen.js',
    'zoom.js',
    'ml-training.js',
    'face-detector.js',
    'recent-folders.js',
    'similarity-sort.js',
    'perceptual-hash.js',
    'main-thread-hash.js',
    'hash-pool.js',
    'hash-parity.js',
    'hash-worker.js', // a module worker the page imports too (PR #87 review #15)
    'feature-cache-store.js',
    // v2 (P1a): core and module code. Virtual paths prove each glob; real core files join as they appear.
    'core/x.js',
    'modules/x/ui/index.js',
    'modules/x/ui/sub/y.js',
    'modules/x/workers/w.js',
    ...jsFilesUnder('core'),
];

// Module code may not touch document.body (M-2), so its prelude takes the root a host would hand it.
const MODULE_PRE = 'const el = createRoot();\nconst name = String(Date.now());\n';
const PAGE_PRE = 'const el = document.body;\nconst name = String(Date.now());\n';

describe.each(RENDERER_FILES)('HTML sink guard in %s', (asFile) => {
    const pre = asFile.startsWith('modules/') ? MODULE_PRE : PAGE_PRE;

    it.each([
        ['an interpolated template', 'el.innerHTML = `<b>${name}</b>`;'],
        ['a concatenation', "el.innerHTML = '<b>' + name + '</b>';"],
        ['a variable', 'el.innerHTML = name;'],
        ['a conditional', "el.innerHTML = name ? '<b>a</b>' : '<i>b</i>';"],
        ['an append of built markup', "el.innerHTML += '<b>' + name;"],
        ['outerHTML', 'el.outerHTML = `<p>${name}</p>`;'],
        ['a computed innerHTML key', "el['innerHTML'] = name;"],
        ['insertAdjacentHTML', "el.insertAdjacentHTML('beforeend', '<b>x</b>');"],
        ['document.write', "document.write('<b>x</b>');"],
        ['document.writeln', 'document.writeln(name);'],
    ])('flags %s', async (_label, line) => {
        expect(await restricted(pre + line + '\n', asFile)).toHaveLength(1);
    });

    it.each([
        ['a static string', "el.innerHTML = '<b>x</b>';"],
        ['an empty string', "el.innerHTML = '';"],
        ['an expression-free template', 'el.innerHTML = `<div>\n  <b>x</b>\n</div>`;'],
        ['textContent', 'el.textContent = `<b>${name}</b>`;'],
    ])('allows %s', async (_label, line) => {
        expect(await restricted(pre + line + '\n', asFile)).toHaveLength(0);
    });
});

describe.each(['main.js', 'main/x.js', 'modules/x/main/a.js'])('%s registers IPC only through the guard', (asFile) => {
    const pre = "const { ipcMain } = require('electron');\nconst guard = { handle() {}, on() {} };\n";

    it.each([
        ['ipcMain.handle', "ipcMain.handle('x', async () => 1);"],
        ['ipcMain.handleOnce', "ipcMain.handleOnce('x', async () => 1);"],
        ['ipcMain.on', "ipcMain.on('x', () => {});"],
        ['ipcMain.once', "ipcMain.once('x', () => {});"],
        ['ipcMain.addListener', "ipcMain.addListener('x', () => {});"],
    ])('flags a bare %s', async (_label, line) => {
        expect(await restricted(pre + line + '\n', asFile)).toHaveLength(1);
    });

    it('allows guard.handle and guard.on', async () => {
        const code = pre + "guard.handle('x', [], async () => 1);\nguard.on('y', () => {});\n";
        expect(await restricted(code, asFile)).toHaveLength(0);
    });
});

it('leaves ipc-guard.js, the wrapper itself, free to call ipcMain', async () => {
    const pre = "const { ipcMain } = require('electron');\n";
    expect(await restricted(pre + "ipcMain.handle('x', async () => 1);\n", 'ipc-guard.js')).toHaveLength(0);
});

// M-1 (v2 spec § 6.2): main never loads code because a manifest named it, so no main-process file may require or
// import a name it computed. A literal name is a file someone reviewed.
describe.each(['main.js', 'logger.js', 'ipc-guard.js', 'main/x.js', 'modules/x/main/a.js'])('M-1 in %s', (asFile) => {
    const pre = 'const name = String(Date.now());\n';

    it.each([
        ['require of a variable', 'require(name);'],
        ['require of a template', 'require(`./${name}`);'],
        ['import() of a variable', 'import(name);'],
    ])('flags %s', async (_label, line) => {
        expect(await restricted(pre + line + '\n', asFile)).toHaveLength(1);
    });

    it.each([
        ['a literal require', "require('path');"],
        ['a literal import()', "import('@huggingface/transformers');"],
    ])('allows %s', async (_label, line) => {
        expect(await restricted(pre + line + '\n', asFile)).toHaveLength(0);
    });
});

// M-2 (v2 spec § 6.2): module code reaches the app only through `host`: never the renderer's globals, never a
// document-wide lookup (the host hands it a root).
describe.each(['modules/x/ui/index.js', 'modules/x/workers/w.js'])('M-2 in %s', (asFile) => {
    it.each([
        ['window.mediaViewer', "window.mediaViewer.loadFolder('x');"],
        ['window.electronAPI', 'window.electronAPI.moveFile({});'],
        ['a computed electronAPI', "window['electronAPI'];"],
        ['globalThis.electronAPI', 'globalThis.electronAPI;'],
        ['document.querySelector', "document.querySelector('.x');"],
        ['document.querySelectorAll', "document.querySelectorAll('.x');"],
        ['document.getElementById', "document.getElementById('x');"],
        ['document.getElementsByClassName', "document.getElementsByClassName('x');"],
        ['document.body', 'document.body.append(1);'],
    ])('flags %s', async (_l, line) => expect(await restricted(line + '\n', asFile)).toHaveLength(1));
    it.each([
        ['host calls', "host.ui.notify('x');"],
        ['a lookup under a handed-over root', "createRoot().querySelector('.x');"],
    ])('allows %s', async (_l, line) => expect(await restricted(line + '\n', asFile)).toHaveLength(0));
});

it('core may look up the document (M-2 is for modules only)', async () => {
    expect(await restricted("document.getElementById('x');\n", 'core/x.js')).toHaveLength(0);
});

// mv/module-imports: a module imports only its own files and core/host-api.js (types), never the app's code or
// another module's.
describe('mv/module-imports', () => {
    it.each([
        ['the renderer', "import '../../../media-viewer.js';"],
        ['core code', "import '../../../core/module-host.js';"],
        ["another module's file", "import '../../y/ui/a.js';"],
        ['a bare package name', "import 'lodash';"],
        ["a re-export of another module's file", "export * from '../../y/ui/a.js';"],
        ["a dynamic import of another module's file", "import('../../y/ui/a.js');"],
    ])('flags %s from ui/', async (_l, line) => {
        expect(await imports(line + '\n', 'modules/x/ui/index.js')).toHaveLength(1);
    });

    it.each([
        ['a sibling', "import './a.js';"],
        ['its own worker folder', "import '../workers/w.js';"],
        ['the host API types', "import '../../../core/host-api.js';"],
    ])('allows %s from ui/', async (_l, line) => {
        expect(await imports(line + '\n', 'modules/x/ui/index.js')).toHaveLength(0);
    });

    it('allows a worker to import its own ui/ file', async () => {
        expect(await imports("import '../ui/a.js';\n", 'modules/x/workers/w.js')).toHaveLength(0);
    });

    it('flags a dynamic import of a computed name, which no reader can check', async () => {
        const code = 'const name = String(Date.now());\nimport(name);\n';
        expect(await imports(code, 'modules/x/ui/index.js')).toHaveLength(1);
    });

    it('flags a worker importing core code', async () => {
        expect(await imports("import '../../../core/x.js';\n", 'modules/x/workers/w.js')).toHaveLength(1);
    });
});
