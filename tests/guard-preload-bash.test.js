import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { decidePreloadGuard } = require('../.claude/hooks/guard-preload-bash.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'guard-preload-bash.js');

describe('decidePreloadGuard — which shell commands must ask first', () => {
    it('asks for a command that names preload.js', () => {
        expect(decidePreloadGuard('grep -c contextBridge preload.js')).toMatchObject({ permissionDecision: 'ask' });
    });

    it('asks when preload.js sits behind a cd prefix (the shape the Bash ask rule misses)', () => {
        const command = 'cd /c/Users/a/repo && sed -i "s/a/b/" preload.js';
        expect(decidePreloadGuard(command)).toMatchObject({ permissionDecision: 'ask' });
    });

    it('asks for a PowerShell-style path naming preload.js', () => {
        expect(decidePreloadGuard(String.raw`Set-Content -Path .\preload.js -Value x`)).toMatchObject({
            permissionDecision: 'ask',
        });
    });

    it('gives a reason naming the security-review rule', () => {
        expect(decidePreloadGuard('cat preload.js').permissionDecisionReason).toContain('security review');
    });

    it('stays silent for commands that do not name preload.js', () => {
        for (const command of ['npm test', 'grep -rn contextBridge .', 'node tests/e2e/helpers/rdp-preload.cjs', '']) {
            expect(decidePreloadGuard(command)).toBeNull();
        }
    });

    it('stays silent for non-string input', () => {
        expect(decidePreloadGuard(undefined)).toBeNull();
        expect(decidePreloadGuard(null)).toBeNull();
    });
});

// Each test spawns node: give it room above vitest's 5 s default under Windows spawn latency.
describe('guard-preload-bash CLI — run as Claude Code runs it', { timeout: 20000 }, () => {
    const runHook = (stdin) => spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8' });
    const call = (toolName, command) =>
        JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: { command } });

    it('prints an ask decision as hookSpecificOutput JSON and exits 0', () => {
        const result = runHook(call('Bash', 'cd /tmp && tail -3 preload.js'));
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'ask',
                permissionDecisionReason: expect.stringContaining('preload.js'),
            },
        });
    });

    it('covers the PowerShell tool too', () => {
        const result = runHook(call('PowerShell', 'Get-Content preload.js'));
        expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
    });

    it('prints nothing and exits 0 for an unrelated command', () => {
        const result = runHook(call('Bash', 'npm test'));
        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
    });

    it('prints nothing and exits 0 on empty or malformed input', () => {
        for (const stdin of ['', '{not json', JSON.stringify({ tool_input: {} })]) {
            const result = runHook(stdin);
            expect(result.status).toBe(0);
            expect(result.stdout).toBe('');
        }
    });
});
