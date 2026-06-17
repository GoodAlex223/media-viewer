import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { scanForSecrets } = require('../scripts/check-secrets.js');

// Real-shape sample tokens, assembled at runtime so no literal secret
// sits in this file (would otherwise be flagged by the guard scanning itself).
const SAMPLES = {
    aws: 'AKIA' + 'ABCDEFGHIJKLMNOP', // AKIA + 16 uppercase/digits
    github: 'ghp_' + 'a'.repeat(36),
    githubFamily: 'ghs_' + 'B'.repeat(36),
    slack: 'xoxb-' + '1'.repeat(20),
    google: 'AIza' + 'a'.repeat(35),
    // Split mid-"PRIVATE" so no full-shape literal sits on disk (would otherwise
    // be a real match for the private-key pattern when the guard scans this file).
    privKey: '-----BEGIN OPENSSH PRIV' + 'ATE KEY-----',
    privKeyPlain: '-----BEGIN PRIV' + 'ATE KEY-----',
};

describe('scanForSecrets — positive detection', () => {
    it('detects an AWS access key ID', () => {
        const hits = scanForSecrets(`const k = "${SAMPLES.aws}";`);
        expect(hits.map((h) => h.pattern)).toContain('AWS access key ID');
    });
    it('detects a GitHub token (ghp_)', () => {
        expect(scanForSecrets(SAMPLES.github).map((h) => h.pattern)).toContain('GitHub token');
    });
    it('detects the broader GitHub token family (ghs_)', () => {
        expect(scanForSecrets(SAMPLES.githubFamily).map((h) => h.pattern)).toContain('GitHub token');
    });
    it('detects a Slack token', () => {
        expect(scanForSecrets(SAMPLES.slack).map((h) => h.pattern)).toContain('Slack token');
    });
    it('detects a Google API key', () => {
        expect(scanForSecrets(SAMPLES.google).map((h) => h.pattern)).toContain('Google API key');
    });
    it('detects a private key block (OPENSSH)', () => {
        expect(scanForSecrets(SAMPLES.privKey).map((h) => h.pattern)).toContain('Private key block');
    });
    it('detects a plain private key block', () => {
        expect(scanForSecrets(SAMPLES.privKeyPlain).map((h) => h.pattern)).toContain('Private key block');
    });
    it('returns the matched substring in `match`', () => {
        const [hit] = scanForSecrets(SAMPLES.github);
        expect(hit.match).toBe(SAMPLES.github);
    });
});

describe('scanForSecrets — false positives (must NOT match)', () => {
    it('ignores bare marker prefixes in prose', () => {
        const prose = 'The audit looks for AKIA, ghp_, xoxb-, AIza, and BEGIN PRIVATE KEY markers.';
        expect(scanForSecrets(prose)).toEqual([]);
    });
    it('ignores regex-source-style strings (prefix followed by a bracket class)', () => {
        const src = 'regex: /AKIA[0-9A-Z]{16}/ and /ghp_[A-Za-z0-9]{36}/';
        expect(scanForSecrets(src)).toEqual([]);
    });
    it('ignores an empty string', () => {
        expect(scanForSecrets('')).toEqual([]);
    });
    it('ignores ordinary code with no secrets', () => {
        expect(scanForSecrets('const total = a + b; // sum')).toEqual([]);
    });
});
