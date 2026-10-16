// Pre-commit CLAUDE.md size warning: says so when a commit grows CLAUDE.md past its limits.
//
// CLAUDE.md loads into every session, so its size is paid on every turn. Lines are a poor
// measure here: each rule is one line, and a rule grows by getting longer, so the line count
// barely moves while the bytes climb (2026-10-09 → 10-16: lines +9%, bytes +30%). Both
// warnings are therefore in bytes; lines are only reported.
//
// 1. GROWTH — the commit adds more than GROWTH_WARN_BYTES, net (staged copy minus HEAD's):
//    more than one rule plus its reason, the shape CLAUDE.md § Maintenance asks for.
// 2. TRIGGER — the staged copy is past BYTE_TRIGGER and the commit grows it at all. Past the
//    trigger the file is due for an audit (§ Maintenance). A shrinking commit never warns.
//
// NEVER BLOCKS: this is advice, not a gate. The CLI always exits 0, and the hook line ends in
// `|| true`. When it cannot measure, it says so on stderr: silence would read as a pass.
//
// SCOPE: it reads the git index and HEAD, not the working tree, because `git commit` commits
// the index (as check-docs-index.js does). Not staged, or staged for deletion: silent.
//
// `measure`, `evaluate` and `formatWarning` are pure and unit-tested. No runtime dependencies.

const GROWTH_WARN_BYTES = 500;
// The size after the G5 audit plus 25%, rounded up to the next 1,000. Change it only at an
// audit (CLAUDE.md § Maintenance).
const BYTE_TRIGGER = 73000;

/**
 * Size a text the way `wc -lc` would: lines are newline characters, bytes are UTF-8.
 * @param {string} text
 * @returns {{lines: number, bytes: number}}
 */
function measure(text) {
    const s = typeof text === 'string' ? text : '';
    return { lines: (s.match(/\n/g) || []).length, bytes: Buffer.byteLength(s, 'utf8') };
}

/**
 * Which warnings a commit earns. Both limits are exclusive: exactly at a limit is fine.
 * @param {{lines: number, bytes: number}} before HEAD's copy (zeroes when HEAD has none)
 * @param {{lines: number, bytes: number}} after the staged copy
 * @param {{growthWarnBytes: number, byteTrigger: number}} limits
 * @returns {Array<'growth'|'trigger'>}
 */
function evaluate(before, after, limits) {
    const delta = after.bytes - before.bytes;
    const kinds = [];
    if (delta > limits.growthWarnBytes) {
        kinds.push('growth');
    }
    if (delta > 0 && after.bytes > limits.byteTrigger) {
        kinds.push('trigger');
    }
    return kinds;
}

const signed = (n) => (n >= 0 ? `+${n}` : String(n));

/**
 * The warning text for `kinds`, or '' when there is nothing to warn about.
 * @param {{lines: number, bytes: number}} before
 * @param {{lines: number, bytes: number}} after
 * @param {Array<'growth'|'trigger'>} kinds
 * @param {{growthWarnBytes: number, byteTrigger: number}} limits
 * @returns {string}
 */
function formatWarning(before, after, kinds, limits) {
    if (!kinds || kinds.length === 0) {
        return '';
    }
    const out = [
        `⚠️  CLAUDE.md grows by ${signed(after.bytes - before.bytes)} bytes (${signed(after.lines - before.lines)} lines) ` +
            `in this commit — now ${after.lines} lines / ${after.bytes} bytes.`,
    ];
    if (kinds.includes('growth')) {
        out.push(`   • more than ${limits.growthWarnBytes} bytes in one commit`);
    }
    if (kinds.includes('trigger')) {
        out.push(
            `   • past its ${limits.byteTrigger}-byte audit trigger: the file is due for an audit (CLAUDE.md § Maintenance)`
        );
    }
    out.push('   A new rule is one sentence plus at most one "why"; history goes to DONE.md or the spec;');
    out.push('   extend an existing bullet rather than add a near-duplicate.');
    out.push('   (A warning only — the commit goes ahead.)');
    return out.join('\n');
}

module.exports = { measure, evaluate, formatWarning, GROWTH_WARN_BYTES, BYTE_TRIGGER };

// --- CLI: warn about the staged CLAUDE.md; never fail the commit ---
if (require.main === module) {
    const { execFileSync } = require('child_process');
    // stderr is piped, not inherited: `git show HEAD:CLAUDE.md` failing on a first commit is expected.
    const git = (args) =>
        execFileSync('git', args, {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

    try {
        const staged = git(['diff', '--cached', '--name-only', '--diff-filter=AMR', '--', 'CLAUDE.md']).trim();
        if (staged !== '') {
            const after = measure(git(['show', ':CLAUDE.md']));
            let headText = '';
            try {
                headText = git(['show', 'HEAD:CLAUDE.md']);
            } catch (_err) {
                headText = ''; // no commit yet, or CLAUDE.md is new in this commit
            }
            const before = measure(headText);
            const limits = { growthWarnBytes: GROWTH_WARN_BYTES, byteTrigger: BYTE_TRIGGER };
            const message = formatWarning(before, after, evaluate(before, after, limits), limits);
            if (message) {
                console.error(`\n${message}\n`);
            }
        }
    } catch (err) {
        const reason = String((err && err.message) || err).split('\n')[0];
        console.error(`check-claude-md-size: could not measure CLAUDE.md (not blocking): ${reason}`);
    }
    process.exit(0);
}
