// A stand-in for hash-pool.js's HashPool (G2 PR 2, Task 5). Not a test file. It hashes through `hashFn` serially, in
// path order, so a context whose `_createHashPool` is built on its own `computePerceptualHash` mock keeps that mock's
// meaning: each call happens before its result is yielded, as one file at a time did before the pool.
import { vi } from 'vitest';

/**
 * @param {(path: string) => Promise<string>} hashFn
 * @param {{ size?: number, route?: string, canary?: { ok: boolean, detail: string } }} [options]
 */
export function fakeHashPool(hashFn, { size = 3, route = 'worker', canary = { ok: true, detail: 'fake' } } = {}) {
    return {
        size,
        mainOnly: false,
        checkCanary: vi.fn(async () => canary),
        hashFiles: vi.fn(async function* (paths, { signal = null } = {}) {
            for (const path of paths) {
                if (signal?.aborted) {
                    return;
                }
                let hash;
                try {
                    hash = await hashFn(path);
                } catch (error) {
                    yield { path, hash: null, route: 'none', error };
                    continue;
                }
                yield { path, hash, route };
            }
        }),
        terminate: vi.fn(),
    };
}
