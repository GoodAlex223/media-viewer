// Pre-commit secret guard (tier a): regex scan of staged content for
// high-signal credential markers. No runtime dependencies.
//
// `scanForSecrets` and `extractAddedLines` are pure and unit-tested.
// Patterns match the full token SHAPE (not bare prefixes), so this file
// does not flag its own regex sources and prose mentions of the markers
// do not match. The CLI section at the bottom is a thin git wrapper that
// shells out to `git diff --cached`, runs both pure functions, and sets
// the exit code.

const SECRET_PATTERNS = [
    { name: 'AWS access key ID', regex: /AKIA[0-9A-Z]{16}/ },
    { name: 'GitHub token', regex: /gh[opsru]_[A-Za-z0-9]{36}/ },
    { name: 'Slack token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
    { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{35}/ },
    { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

/**
 * Scan a string for credential markers.
 * @param {string} text
 * @returns {Array<{pattern: string, match: string}>}
 */
function scanForSecrets(text) {
    const hits = [];
    for (const { name, regex } of SECRET_PATTERNS) {
        const m = typeof text === 'string' ? text.match(regex) : null;
        if (m) {
            hits.push({ pattern: name, match: m[0] });
        }
    }
    return hits;
}

/**
 * Parse a `git diff --cached --unified=0` text into added lines.
 * Header lines that appear before the first @@ are harmless: `newLineNo`
 * is reset by every hunk header, and no `+` content is collected until then.
 * @param {string} diffText
 * @returns {Array<{file: string|null, line: number, text: string}>}
 */
function extractAddedLines(diffText) {
    const added = [];
    let file = null;
    let newLineNo = 0;
    let inBinary = false;
    for (const raw of diffText.split('\n')) {
        if (raw.startsWith('+++ ')) {
            const p = raw.slice(4).trim();
            file = p === '/dev/null' ? null : p.replace(/^b\//, '');
            inBinary = false;
            continue;
        }
        if (raw.startsWith('--- ')) {
            continue;
        }
        if (raw.startsWith('Binary files')) {
            inBinary = true;
            continue;
        }
        if (raw.startsWith('@@')) {
            const m = raw.match(/\+(\d+)/);
            newLineNo = m ? parseInt(m[1], 10) : 0;
            continue;
        }
        if (inBinary) {
            continue;
        }
        if (raw.startsWith('+')) {
            added.push({ file, line: newLineNo, text: raw.slice(1) });
            newLineNo++;
        } else if (raw.startsWith('-')) {
            // removed line — does not advance the new-file line counter
        } else {
            newLineNo++;
        }
    }
    return added;
}

module.exports = { scanForSecrets, extractAddedLines, SECRET_PATTERNS };

// --- CLI: scan the staged diff, block the commit on any hit ---
if (require.main === module) {
    const { execSync } = require('child_process');
    let diff = '';
    try {
        diff = execSync('git diff --cached --unified=0 --diff-filter=ACM', {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (err) {
        console.error('check-secrets: failed to read staged diff:', err.message);
        process.exit(1);
    }

    const findings = [];
    for (const { file, line, text } of extractAddedLines(diff)) {
        for (const hit of scanForSecrets(text)) {
            findings.push({ file, line, pattern: hit.pattern });
        }
    }

    if (findings.length > 0) {
        console.error('\n⛔ Potential secret(s) found in staged changes:\n');
        for (const f of findings) {
            console.error(`  ${f.file}:${f.line} — ${f.pattern}`);
        }
        console.error(
            '\nRemove the secret(s) and re-stage. If this is a genuine false positive,' +
                ' bypass with: git commit --no-verify\n'
        );
        process.exit(1);
    }
    process.exit(0);
}
