// Similarity sort (G2 hash sort off the renderer) — pure logic: no DOM, no IPC, no MediaViewer state.
// Spec: docs/superpowers/specs/2026-10-19-g2-hash-sort-off-renderer-design.md
// media-viewer.js imports this file as a namespace (`import * as SimilaritySort`), so an extracted-method
// unit test supplies every function through one global (`globalThis.SimilaritySort`).
//
// Path identity is exact string equality: no case folding, no normalisation.

export const HASH_SAVE_EVERY = 1000;
export const HASH_SAVE_INTERVAL_MS = 60_000;

/**
 * Lay a computed order over the live file list. Returns the live objects: first those whose path is in
 * `orderedPaths`, in that order and each once; then every live file the order lacks, in live order.
 * Never mutates its inputs.
 */
export function alignToLive(orderedPaths, liveFiles) {
    const byPath = new Map();
    for (const file of liveFiles) {
        byPath.set(file.path, file);
    }
    const out = [];
    const placed = new Set();
    for (const p of orderedPaths) {
        const file = byPath.get(p);
        if (file !== undefined && !placed.has(p)) {
            placed.add(p);
            out.push(file);
        }
    }
    for (const file of liveFiles) {
        if (!placed.has(file.path)) {
            placed.add(file.path);
            out.push(file);
        }
    }
    return out;
}

/** A snapshot of everything a user action moves, compared later by `userActedSince`. */
export function takeUserMark(viewer) {
    const history = viewer.moveHistory;
    return {
        currentPath: viewer.mediaFiles[viewer.currentIndex]?.path ?? null,
        currentIndex: viewer.currentIndex,
        pairIndex: viewer.mlComparePairIndex,
        historyLength: history.length,
        historyTop: history.length > 0 ? history[history.length - 1] : null,
        mode: viewer.isTournamentMode ? 'tournament' : viewer.isCompareMode ? 'compare' : 'single',
    };
}

/** True when any field of the two marks differs. */
export function userActedSince(before, after) {
    return (
        before.currentPath !== after.currentPath ||
        before.currentIndex !== after.currentIndex ||
        before.pairIndex !== after.pairIndex ||
        before.historyLength !== after.historyLength ||
        before.historyTop !== after.historyTop ||
        before.mode !== after.mode
    );
}

/** Whether the hash cache is due a save: every HASH_SAVE_EVERY new hashes, or HASH_SAVE_INTERVAL_MS with any. */
export function isHashSaveDue({ newSinceSave, lastSaveAt, now }) {
    return newSinceSave >= HASH_SAVE_EVERY || (newSinceSave > 0 && now - lastSaveAt >= HASH_SAVE_INTERVAL_MS);
}
