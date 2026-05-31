import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKLOG_PATH = join(__dirname, '..', 'docs', 'planning', 'BACKLOG.md');

const REQUIRED_HEADERS = [
    '## 📌 Process Rules (READ BEFORE PROPOSING WORK)',
    '## 🔵 User-Flagged Ideas',
    '## 🟡 Operational & Observation Items',
    '## 🟤 Auto-Generated Tech Debt',
];

describe('BACKLOG.md structure', () => {
    it('retains all 4 required top-level headers', () => {
        const content = readFileSync(BACKLOG_PATH, 'utf-8');
        const missing = REQUIRED_HEADERS.filter((h) => !content.includes(h));
        expect(missing, `Missing required headers: ${missing.join(', ')}`).toEqual([]);
    });

    it('still has at least one ### sub-header in each source section', () => {
        // Heuristic guard against accidental gutting of any source section.
        // Each source section ## (the last 3 of REQUIRED_HEADERS) must contain
        // at least one ### sub-header before the next ## boundary.
        const content = readFileSync(BACKLOG_PATH, 'utf-8');
        for (const header of REQUIRED_HEADERS.slice(1)) {
            const idx = content.indexOf(header);
            expect(idx, `Header not found: ${header}`).toBeGreaterThan(-1);
            const next = content.indexOf('\n## ', idx + 1);
            const slice = content.slice(idx, next === -1 ? undefined : next);
            expect(slice, `${header} appears empty (no ### sub-header)`).toMatch(/^### /m);
        }
    });
});
