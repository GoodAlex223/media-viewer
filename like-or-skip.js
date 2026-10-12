// Like-or-skip flow (G2) — pure logic: no DOM, no IPC, no MediaViewer state.
// Spec: docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md
// media-viewer.js imports this file as a namespace (`import * as LikeOrSkip`), so an extracted-method
// unit test supplies every function through one global (`globalThis.LikeOrSkip`).

/**
 * The files the user passed with Next while the AI order was on screen (spec § 5).
 * `active` is the feature's own "the AI order is what's on screen" token. It is deliberately not
 * isSortedByPrediction, which the similarity sort leaves set (spec F5).
 */
export class SkipTracker {
    constructor() {
        this.active = false;
        /** @type {Set<string>} file paths */
        this.skipped = new Set();
    }

    /** The AI order was applied. A fresh sort starts empty; a chip re-sort keeps the skips (spec D2). */
    activate({ keepSkips = false } = {}) {
        this.active = true;
        if (!keepSkips) {
            this.skipped.clear();
        }
    }

    /** The order on screen is no longer the AI order: tracking stops and the skips are dropped. */
    deactivate() {
        this.active = false;
        this.skipped.clear();
    }

    recordSkip(path) {
        if (this.active) {
            this.skipped.add(path);
        }
    }

    /** The file left the list (rated, moved or removed). */
    forget(path) {
        this.skipped.delete(path);
    }

    /** A batch undo put the file back: a skip again, but only while tracking is on. */
    restore(path) {
        if (this.active) {
            this.skipped.add(path);
        }
    }

    /** The skipped files still in `mediaFiles`, in list order — the only source of the count. */
    skippedIn(mediaFiles) {
        if (this.skipped.size === 0) {
            return [];
        }
        return mediaFiles.filter((f) => this.skipped.has(f.path));
    }
}

/**
 * Where the cursor lands after a batch removed `movedPaths` (spec § 6 step 8). Returns a PATH, not an
 * index: the caller maps it onto the list as it stands when the batch finishes, so nothing depends on
 * the list keeping its pre-batch order across the renames' awaits.
 * - the file on screen survived → that file;
 * - it moved → the first survivor after it in the pre-batch order, else the first survivor
 *   (moveCurrentFile's wrap-to-start);
 * - nothing survived → null.
 */
export function planCursorAfterBatch(filesBefore, movedPaths, currentIndex) {
    const survivors = filesBefore.filter((f) => !movedPaths.has(f.path));
    if (survivors.length === 0) {
        return null;
    }
    const onScreen = filesBefore[currentIndex];
    if (onScreen && !movedPaths.has(onScreen.path)) {
        return onScreen.path;
    }
    for (let i = currentIndex + 1; i < filesBefore.length; i++) {
        if (!movedPaths.has(filesBefore[i].path)) {
            return filesBefore[i].path;
        }
    }
    return survivors[0].path;
}

/**
 * The list after a batch undo puts `restored` ({ file, originalIndex }) back (spec § 7 step 2).
 * With no reorder since the batch, ascending re-insertion rebuilds the pre-batch order exactly; each
 * position is shifted down by the batch files that did not come back (`missing`, original indices),
 * which would otherwise have held the earlier slots. After a reorder the original indices mean
 * nothing, so the files are parked at the front in their original order — where skips live. Pure.
 */
export function planUndoReinsertion(mediaFiles, restored, { orderUnchanged, missing = [] }) {
    const ascending = [...restored].sort((a, b) => a.originalIndex - b.originalIndex);
    if (!orderUnchanged) {
        return [...ascending.map((r) => r.file), ...mediaFiles];
    }
    const result = [...mediaFiles];
    for (const { file, originalIndex } of ascending) {
        const position = originalIndex - missing.filter((m) => m < originalIndex).length;
        result.splice(Math.min(position, result.length), 0, file);
    }
    return result;
}

/** "1 file", "3 files" — the user-facing counts of this flow. */
export function formatCount(n, noun) {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** How many files a history entry moved into or out of the training set (spec § 8). */
export function trainingWeight(entry) {
    if (!entry) {
        return 0;
    }
    if (entry.skipBatch) {
        return entry.files.length;
    }
    if (entry.bothGood || entry.bothBad) {
        return entry.bulkFiles?.length ?? 2;
    }
    if (entry.actionType === 'like' || entry.actionType === 'dislike') {
        return 1;
    }
    return 0; // special moves and anything else that does not feed training
}

/**
 * Training-set changes since the AI order was computed (spec § 8): the weighted symmetric difference,
 * by identity, between the history then (`markSnapshot`, a copy of moveHistory's entry references) and
 * now. An undone pre-mark rating is in the snapshot only; a new rating in the history only; a failed
 * undo pushes the same object back and so counts nothing. Order-insensitive, so an in-place splice of
 * history cannot misalign it. 0 when there is no mark (not on the AI order).
 */
export function computeStaleCount(history, markSnapshot) {
    if (!markSnapshot) {
        return 0;
    }
    const now = new Set(history);
    const then = new Set(markSnapshot);
    let count = 0;
    for (const entry of markSnapshot) {
        if (!now.has(entry)) {
            count += trainingWeight(entry);
        }
    }
    for (const entry of history) {
        if (!then.has(entry)) {
            count += trainingWeight(entry);
        }
    }
    return count;
}

/**
 * The list a chip re-sort shows (spec D2, D3): the skipped files first, in their current relative order
 * (behind the cursor, where the like-or-skip flow keeps them), then every unjudged file in the new model
 * order. A skipped file the sort result left out (no features) stays parked rather than vanishing. The
 * cursor lands on the first unjudged file, or on 0 when every remaining file is skipped.
 */
export function parkSkippedOrder(currentFiles, sortedFiles, skippedSet) {
    const parked = currentFiles.filter((f) => skippedSet.has(f.path));
    const parkedPaths = new Set(parked.map((f) => f.path));
    const unjudged = sortedFiles.filter((f) => !parkedPaths.has(f.path));
    return { files: [...parked, ...unjudged], cursor: unjudged.length > 0 ? parked.length : 0 };
}
