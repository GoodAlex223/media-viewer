import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        exclude: ['tests/e2e/**'],
        // Vitest v4's default `forks` pool intermittently lost its worker on this Windows
        // machine — the whole suite reporting "Vitest failed to find the runner" / "No test
        // suite found" (BACKLOG 🟡 [2026-07-02], surfaced under concurrent subagent load).
        // `threads` is a different worker-startup path and measured marginally FASTER here
        // (~4.3s vs ~4.8s), so the swap costs nothing. Note the honest caveat: the flake did
        // not reproduce in 15 consecutive runs on an idle machine, so this mitigates a
        // diagnosed mechanism rather than a reproduced failure. Serializing instead
        // (`fileParallelism: false`) would remove the race by construction but costs 2.2x
        // (~10.6s) on every commit — rejected as disproportionate.
        pool: 'threads',
    },
});
