// PostToolUse hook (.claude/settings.json): run Prettier on the ONE file an Edit/Write just
// changed — never on the session's working directory — and only where that run buys something.
//
// The hook this replaces ran `npx prettier --write "$CLAUDE_FILE_PATH"`. Claude Code sets no
// such variable (hook input arrives as JSON on stdin), so every edit ran `prettier --write ""`,
// which formats everything under the cwd; from docs/planning that rewrote seven Markdown files
// the repo deliberately leaves unformatted (2026-09-24). This script reads the path from stdin,
// skips paths outside the repo (Prettier would format them with THIS repo's config — memory
// files under ~/.claude are Edit/Write targets in every session), and runs Prettier from the
// repo root, so .prettierignore and .gitignore apply wherever the session's cwd is.
//
// The hook blocks every edit until it exits, so two more paths skip before Prettier starts
// (re-timed 2026-10-26: an ignored .md cost 213 ms, media-viewer.js 1,133 ms, node alone 60 ms):
// - A path Prettier would ignore. `createIsIgnored` is Prettier's own check, so the skip changes
//   nothing Prettier does: its default ignore files (.gitignore, .prettierignore), each with
//   `node_modules` appended, matched by the `ignore` version it bundles (pinned exactly in
//   package.json), ignored when any file matches. The tests hold it to the installed Prettier three
//   ways — the same verdict on every tracked file, the CLI's default ignore files, the bundled
//   `ignore` version — so a Prettier upgrade that would make the hook skip a file Prettier formats
//   fails there. (One that only adds a default ignore file passes: the hook then just spawns more.)
// - The root media-viewer.js: Prettier's parse and print of it is ~1.1 s, so lint-staged formats it
//   at commit instead (a test asks lint-staged's own matcher). A commit that bypasses lint-staged
//   (`SKIP=lint-staged`, `--no-verify`) leaves it unformatted. Not `"async": true`: Prettier writes
//   output computed from its own earlier read, so an edit that lands mid-format would be overwritten.
//
// `planFormat` and `createIsIgnored` are unit-tested (tests/format-edited-file.test.js). The CLI
// always exits 0: a PostToolUse hook cannot undo the edit, and a syntax error is lint-staged's to report.

const fs = require('fs');
const path = require('path');

// Root-relative posix paths that lint-staged formats at commit (`*.{js,cjs}` in package.json).
const LEFT_TO_COMMIT = new Set(['media-viewer.js']);
// Prettier's default --ignore-path (node_modules/prettier/internal/legacy-cli.mjs).
const IGNORE_FILES = ['.gitignore', '.prettierignore'];

/**
 * Decide whether the edited file gets formatted.
 * @param {{filePath: unknown, root: string, isIgnored?: (posixRelPath: string) => boolean}} input
 * @param {typeof path} [pathImpl] - injectable so win32 behaviour is testable on any OS
 * @returns {{action: 'skip', reason: string} | {action: 'format', relPath: string}}
 */
function planFormat({ filePath, root, isIgnored = () => false }, pathImpl = path) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
        return { action: 'skip', reason: 'no file path' };
    }
    // win32 relative() compares case-insensitively, so `c:/…` vs `C:\…` resolves inside the root.
    const relPath = pathImpl.relative(root, pathImpl.resolve(root, filePath));
    const escapes = relPath === '..' || relPath.startsWith(`..${pathImpl.sep}`);
    if (relPath === '' || escapes || pathImpl.isAbsolute(relPath)) {
        return { action: 'skip', reason: 'outside the project' };
    }
    const posixPath = relPath.split(pathImpl.sep).join('/');
    if (LEFT_TO_COMMIT.has(posixPath)) {
        return { action: 'skip', reason: 'left to lint-staged at commit' };
    }
    let ignored = false;
    try {
        ignored = isIgnored(posixPath);
    } catch (_err) {
        // Prettier decides, as it did before this check existed.
    }
    if (ignored) {
        return { action: 'skip', reason: 'ignored by Prettier' };
    }
    return { action: 'format', relPath };
}

/**
 * Prettier's own ignore check for files under `root` (see the header).
 * @param {string} root
 * @returns {(posixRelPath: string) => boolean}
 */
function createIsIgnored(root) {
    const ignore = require('ignore');
    const matchers = IGNORE_FILES.map((name) => {
        let content = '';
        try {
            content = fs.readFileSync(path.join(root, name), 'utf8');
        } catch (err) {
            // As in Prettier: a missing file adds no patterns, and any other read error throws, which
            // planFormat turns into a Prettier run that reports it.
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }
        return ignore({ allowRelativePaths: true }).add(`${content}\nnode_modules`);
    });
    return (posixRelPath) => matchers.some((matcher) => matcher.checkIgnore(posixRelPath).ignored);
}

module.exports = { planFormat, createIsIgnored, LEFT_TO_COMMIT };

// --- CLI: read the hook's stdin JSON, format the edited file, always exit 0 ---
if (require.main === module) {
    const { spawnSync } = require('child_process');
    const root = path.resolve(__dirname, '..', '..');

    let filePath = '';
    try {
        filePath = JSON.parse(fs.readFileSync(0, 'utf8'))?.tool_input?.file_path ?? '';
    } catch (err) {
        process.stderr.write(`format-edited-file: unreadable hook input (${err.message}) — skipped\n`);
        process.exit(0);
    }

    // Built on first use (~15 ms), so the paths that skip without it never pay for it. If `ignore`
    // does not load (node_modules missing or partial), planFormat catches the throw and Prettier decides.
    let matcher;
    const isIgnored = (posixRelPath) => (matcher ??= createIsIgnored(root))(posixRelPath);

    const plan = planFormat({ filePath, root, isIgnored });
    if (plan.action === 'format') {
        const prettierBin = path.join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
        const result = spawnSync(
            process.execPath,
            [prettierBin, '--write', '--ignore-unknown', '--log-level', 'warn', plan.relPath],
            { cwd: root, encoding: 'utf8' }
        );
        if (result.error || result.status !== 0) {
            const why = (result.error?.message ?? result.stderr ?? '').trim();
            process.stderr.write(`format-edited-file: prettier did not format ${plan.relPath}: ${why}\n`);
        }
    }
    process.exit(0);
}
