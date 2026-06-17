// Pre-commit secret guard (tier a): regex scan of staged content for
// high-signal credential markers. No runtime dependencies.
//
// `scanForSecrets` is pure and unit-tested. Patterns match the full
// token SHAPE (not bare prefixes), so this file does not flag its own
// regex sources and prose mentions of the markers do not match.

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

module.exports = { scanForSecrets, SECRET_PATTERNS };
