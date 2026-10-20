// G1 lint guard: proves the eslint.config.mjs rules FIRE, through ESLint's own Node API with the
// project config — a rule that never fires reads as a control while protecting nothing.
//   - renderer files: no HTML parsing of a built string (innerHTML/outerHTML assigned anything but
//     a static string, insertAdjacentHTML, document.write/writeln)
//   - main.js: no ipcMain registration outside the ipc-guard wrapper
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import path from 'path';

const root = path.resolve(__dirname, '..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'eslint.config.mjs') });

// Lints `code` as if it were the repo file `asFile`, so that file's config block applies.
async function restricted(code, asFile) {
    const [result] = await eslint.lintText(code, { filePath: path.join(root, asFile) });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
}

const RENDERER_FILES = [
    'media-viewer.js',
    'tournament.js',
    'fullscreen.js',
    'ml-training.js',
    'face-detector.js',
    'recent-folders.js',
    'similarity-sort.js',
];

describe.each(RENDERER_FILES)('HTML sink guard in %s', (asFile) => {
    const pre = 'const el = document.body;\nconst name = String(Date.now());\n';

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

describe('main.js registers IPC only through the guard', () => {
    const pre = "const { ipcMain } = require('electron');\nconst guard = { handle() {}, on() {} };\n";

    it.each([
        ['ipcMain.handle', "ipcMain.handle('x', async () => 1);"],
        ['ipcMain.handleOnce', "ipcMain.handleOnce('x', async () => 1);"],
        ['ipcMain.on', "ipcMain.on('x', () => {});"],
        ['ipcMain.once', "ipcMain.once('x', () => {});"],
        ['ipcMain.addListener', "ipcMain.addListener('x', () => {});"],
    ])('flags a bare %s', async (_label, line) => {
        expect(await restricted(pre + line + '\n', 'main.js')).toHaveLength(1);
    });

    it('allows guard.handle and guard.on', async () => {
        const code = pre + "guard.handle('x', [], async () => 1);\nguard.on('y', () => {});\n";
        expect(await restricted(code, 'main.js')).toHaveLength(0);
    });

    it('leaves ipc-guard.js, the wrapper itself, free to call ipcMain', async () => {
        expect(await restricted(pre + "ipcMain.handle('x', async () => 1);\n", 'ipc-guard.js')).toHaveLength(0);
    });
});
