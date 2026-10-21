// The six feature-cache wipe triggers (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md § 3),
// each driven through the real renderer methods against FakeMain's in-memory disk and asserted on what that disk
// holds afterwards. Each trigger test fails on main's code, so it is committed as `it.fails` and flips to `it` in
// the task that fixes it. Each has a control that passes on both.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    FakeMain,
    makeHost,
    makeFiles,
    openFolder,
    view,
    holdImage,
    drainWorker,
    startAutosave,
    autosaveTick,
    resetHarness,
    settle,
} from './feature-cache-harness.js';

let main;
let host;

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    main = new FakeMain();
});

afterEach(() => {
    resetHarness();
    vi.restoreAllMocks();
});

describe('T1: a late extraction result', () => {
    // A's background run has a0's image load in flight when the user switches to B, whose cache holds 2,000.
    async function run({ switchFolder }) {
        host = makeHost(main, { enableClipFeatures: true });
        await openFolder(main, host, '/A', makeFiles('/A', 'a', 3));
        await host.loadFeatureCache();
        main.seed('/B', makeFiles('/B', 'b', 2000));
        main.list('/B', makeFiles('/B', 'b', 2000));
        const release = holdImage(host, '/A/a0.jpg');
        const extraction = host.startBackgroundFeatureExtraction();
        await release.reached;
        if (switchFolder) {
            await host.switchToFolder('/B');
            await settle();
        }
        release();
        await settle();
        await drainWorker(host);
        await extraction;
        await settle();
    }

    it.fails("T1: a late extraction result from the old folder does not replace the new folder's cache", async () => {
        await run({ switchFolder: true });
        expect(main.entriesOf('/B').size).toBe(2000);
    });

    it('T1 control: with no switch, the run saves its new entry', async () => {
        await run({ switchFolder: false });
        expect(main.entriesOf('/A').has('a0.jpg')).toBe(true);
    });
});

describe('T2: a save cut short', () => {
    // A's 2,500 entries are read and saved; the folder changes while the first chunk write is in flight.
    async function run({ changeFolder }) {
        host = makeHost(main);
        const files = makeFiles('/A', 'a', 2500);
        main.seed('/A', files);
        await openFolder(main, host, '/A', files);
        await host.loadFeatureCache();
        const release = main.hold('featureCacheWriteChunk', 1);
        const save = host.saveFeatureCache();
        await release.reached;
        if (changeFolder) {
            await openFolder(main, host, '/B', makeFiles('/B', 'b', 10));
        }
        release();
        await save;
        await settle();
    }

    it.fails("T2: a save that is streaming when the folder changes writes the old folder's whole cache", async () => {
        await run({ changeFolder: true });
        expect(main.entriesOf('/A').size).toBe(2500);
        expect(main.writesTo('/A').filter((w) => w.closed)).toHaveLength(1);
    });

    it('T2 control: with no folder change, the save writes the whole cache', async () => {
        await run({ changeFolder: false });
        expect(main.entriesOf('/A').size).toBe(2500);
        expect(main.writesTo('/A').filter((w) => w.closed)).toHaveLength(1);
    });
});

describe('T3: a cache never read', () => {
    // After an AI sort in A (A read, the autosave armed), the user opens B and views three files B's cache lacks.
    // B lists 2,003 files; its cache holds the first 2,000.
    async function run({ readB }) {
        host = makeHost(main);
        const aFiles = makeFiles('/A', 'a', 3);
        main.seed('/A', aFiles);
        await openFolder(main, host, '/A', aFiles);
        await host.loadFeatureCache();
        startAutosave(host);
        const bFiles = makeFiles('/B', 'b', 2003);
        main.seed('/B', bFiles.slice(0, 2000));
        main.list('/B', bFiles);
        await host.switchToFolder('/B');
        await settle();
        if (readB) {
            await host.loadFeatureCache();
        }
        for (const i of [2000, 2001, 2002]) {
            await view(host, i);
        }
        await autosaveTick();
        await settle();
    }

    it.fails('T3: browsing a folder whose cache was never read does not replace it', async () => {
        await run({ readB: false });
        expect(main.entriesOf('/B').size).toBe(2000);
    });

    it("T3 control: after B's cache is read, browsing adds to it", async () => {
        await run({ readB: true });
        expect(main.entriesOf('/B').size).toBe(2003);
    });
});

describe('T4: a read that crosses a folder switch', () => {
    // A's cache holds 1,500 entries (two chunks); B lists and holds 2,000.
    async function openA() {
        host = makeHost(main);
        const aFiles = makeFiles('/A', 'a', 1500);
        main.seed('/A', aFiles);
        await openFolder(main, host, '/A', aFiles);
        main.seed('/B', makeFiles('/B', 'b', 2000));
        main.list('/B', makeFiles('/B', 'b', 2000));
        // The AI sort's read takes the sort's signal; loadFolder's _abortInFlightPredictionSort aborts it.
        host.sortAbortController = new AbortController();
    }

    async function runB({ switchFolder }) {
        await openA();
        startAutosave(host);
        const release = main.hold('featureCacheChunk', 2);
        const read = host.loadFeatureCache({ signal: host.sortAbortController.signal });
        await release.reached;
        if (switchFolder) {
            await host.switchToFolder('/B');
            await settle();
        }
        release();
        await read;
        await settle();
        if (switchFolder) {
            await view(host, 0);
            await autosaveTick();
            await settle();
        }
    }

    it.fails("T4b: an old folder's read that ends after a switch puts nothing in the new folder's file", async () => {
        await runB({ switchFolder: true });
        expect([...main.entriesOf('/B').keys()].every((n) => n.startsWith('b'))).toBe(true);
        expect(main.entriesOf('/B').size).toBe(2000);
    });

    it("T4b control: with no switch, the read commits A's entries", async () => {
        await runB({ switchFolder: false });
        expect(host.featureCache.size).toBe(1500);
        expect(host.featureCache.has('/A/a0.jpg')).toBe(true);
    });

    it.fails("T4c: a read in the new folder reads it, even while the old folder's read is in flight", async () => {
        await openA();
        const release = main.hold('featureCacheOpen', 1);
        const readA = host.loadFeatureCache({ signal: host.sortAbortController.signal });
        await release.reached;
        await host.switchToFolder('/B');
        await settle();
        const readB = host.loadFeatureCache();
        release();
        await readB;
        await readA;
        await settle();
        expect(host.featureCache.has('/B/b0.jpg')).toBe(true);
    });

    it('T4c control: with no read in flight, a read in the new folder reads it', async () => {
        await openA();
        await host.switchToFolder('/B');
        await settle();
        await host.loadFeatureCache();
        expect(host.featureCache.has('/B/b0.jpg')).toBe(true);
    });
});

describe('T5: a switch to an empty folder', () => {
    async function run({ empty }) {
        host = makeHost(main);
        const aFiles = makeFiles('/A', 'a', 4);
        main.seed('/A', aFiles.slice(0, 3));
        await openFolder(main, host, '/A', aFiles);
        await host.loadFeatureCache();
        await view(host, 3);
        startAutosave(host);
        if (empty) {
            await openFolder(main, host, '/E', []);
        }
        await autosaveTick();
        await settle();
    }

    it.fails('T5: switching to an empty folder writes nothing into its cache file', async () => {
        await run({ empty: true });
        expect(main.entriesOf('/E')).toBeUndefined();
    });

    it('T5 control: with no switch, the autosave saves the viewed file into A', async () => {
        await run({ empty: false });
        expect(main.entriesOf('/A').has('a3.jpg')).toBe(true);
    });
});

describe('T6: a dirty flag that lies', () => {
    // A lists a0–a6 and its cache holds a0–a4. a5 is viewed; the first autosave's close is held.
    async function run({ a6Early }) {
        host = makeHost(main);
        const aFiles = makeFiles('/A', 'a', 7);
        main.seed('/A', aFiles.slice(0, 5));
        await openFolder(main, host, '/A', aFiles);
        await host.loadFeatureCache();
        startAutosave(host);
        await view(host, 5);
        if (a6Early) {
            await view(host, 6);
        }
        const release = main.hold('featureCacheWriteClose', 1);
        const tick1 = autosaveTick();
        await release.reached;
        if (!a6Early) {
            await view(host, 6);
        }
        const tick2 = autosaveTick();
        release();
        await tick1;
        await tick2;
        await settle();
        await autosaveTick();
        await settle();
    }

    it.fails('T6: an entry added while a save is closing is saved by the next autosave', async () => {
        await run({ a6Early: false });
        expect(main.entriesOf('/A').has('a6.jpg')).toBe(true);
    });

    it('T6 control: an entry added before the save is saved by it', async () => {
        await run({ a6Early: true });
        expect(main.entriesOf('/A').has('a6.jpg')).toBe(true);
    });
});
