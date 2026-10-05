// PreToolUse hook (.claude/settings.json, matcher Bash|PowerShell): ask before any shell command
// whose text names preload.js — CLAUDE.md: "Changes to preload.js require security review".
//
// The `Bash(*preload.js*)` ask rule beside it does not cover this alone: measured 2026-10-05, it
// prompted for `grep … preload.js` and `true && grep … preload.js` but NOT for
// `cd <project dir> && grep … preload.js` (three misses, re-tested). Claude Code strips a `cd` to
// the current directory before hooks run (this hook received the bare `grep …`), so the hook sees
// the command the rule evidently does not; and a hook's "ask" still prompts under auto mode. It is not a
// security boundary either: a command that changes preload.js without naming it (`git checkout
// -- .`, a `*.js` glob) passes — see CLAUDE.md § Best Practices.
//
// `decidePreloadGuard` is pure and unit-tested (tests/guard-preload-bash.test.js). The CLI exits
// 0 always: it prints an ask decision or nothing, and unreadable input falls through to the
// normal permission flow (where the ask rule still applies).

const PRELOAD_PATTERN = /preload\.js/;

/**
 * @param {unknown} command - the shell command text (tool_input.command)
 * @returns {{permissionDecision: 'ask', permissionDecisionReason: string} | null}
 */
function decidePreloadGuard(command) {
    if (typeof command !== 'string' || !PRELOAD_PATTERN.test(command)) {
        return null;
    }
    return {
        permissionDecision: 'ask',
        permissionDecisionReason:
            'This command names preload.js — the security bridge; changes to it require security review (CLAUDE.md).',
    };
}

module.exports = { decidePreloadGuard };

// --- CLI: read the hook's stdin JSON, print an ask decision or nothing, always exit 0 ---
if (require.main === module) {
    const fs = require('fs');
    let command;
    try {
        command = JSON.parse(fs.readFileSync(0, 'utf8'))?.tool_input?.command;
    } catch (_e) {
        process.exit(0);
    }
    const decision = decidePreloadGuard(command);
    if (decision) {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision } }));
    }
    process.exit(0);
}
