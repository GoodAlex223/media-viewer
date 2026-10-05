// PostToolUse hook (.claude/settings.json): run Prettier on the ONE file an Edit/Write just
// changed — never on the session's working directory.
//
// The hook this replaces ran `npx prettier --write "$CLAUDE_FILE_PATH"`. Claude Code sets no
// such variable (hook input arrives as JSON on stdin), so every edit ran `prettier --write ""`,
// which formats everything under the cwd; from docs/planning that rewrote seven Markdown files
// the repo deliberately leaves unformatted (2026-09-24). This script reads the path from stdin,
// skips paths outside the repo (Prettier would format them with THIS repo's config — memory
// files under ~/.claude are Edit/Write targets in every session), and runs Prettier from the
// repo root, so .prettierignore and .gitignore apply wherever the session's cwd is.
//
// `planFormat` is pure and unit-tested (tests/format-edited-file.test.js). The CLI always exits
// 0: a PostToolUse hook cannot undo the edit, and a syntax error is lint-staged's to report.

const path = require('path');

/**
 * Decide whether the edited file gets formatted.
 * @param {{filePath: unknown, root: string}} input
 * @param {typeof path} [pathImpl] - injectable so win32 behaviour is testable on any OS
 * @returns {{action: 'skip', reason: string} | {action: 'format', relPath: string}}
 */
function planFormat({ filePath, root }, pathImpl = path) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
        return { action: 'skip', reason: 'no file path' };
    }
    // win32 relative() compares case-insensitively, so `c:/…` vs `C:\…` resolves inside the root.
    const relPath = pathImpl.relative(root, pathImpl.resolve(root, filePath));
    const escapes = relPath === '..' || relPath.startsWith(`..${pathImpl.sep}`);
    if (relPath === '' || escapes || pathImpl.isAbsolute(relPath)) {
        return { action: 'skip', reason: 'outside the project' };
    }
    return { action: 'format', relPath };
}

module.exports = { planFormat };

// --- CLI: read the hook's stdin JSON, format the edited file, always exit 0 ---
if (require.main === module) {
    const fs = require('fs');
    const { spawnSync } = require('child_process');
    const root = path.resolve(__dirname, '..', '..');

    let filePath = '';
    try {
        filePath = JSON.parse(fs.readFileSync(0, 'utf8'))?.tool_input?.file_path ?? '';
    } catch (err) {
        process.stderr.write(`format-edited-file: unreadable hook input (${err.message}) — skipped\n`);
        process.exit(0);
    }

    const plan = planFormat({ filePath, root });
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
