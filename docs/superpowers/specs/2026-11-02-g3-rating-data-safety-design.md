# G3: rating data that can't go wrong

**Status**: Approved by the user 2026-11-02 ("Looks right, go"); built. The user skipped the brainstorm's questions ("lets skip the questions"), so every decision below is my call unless it quotes a ruling, and each is listed in § 4 for checking.
**Branch**: `g3-rating-data-safety`, cut from `main` at `65d8b71`.
**Scheduled**: [WEEKLY.md](../../planning/WEEKLY.md) G3 (Oct 26–30, Cleanup Week #5, the week's 🏆).
**Origin**: seven members, nine BACKLOG 🟤 entries, listed by title in § 2. A tenth, "A special move of a bulk-rated file weighs 0 in the out-of-date count", joins by my call (§ 4, call 8).

---

## 1. Intent

ROADMAP principle 2 is "No data loss". What this app exists to keep is where the user's files live and how they rated them, and bulk ratings exist nowhere else. Each member can leave a file in the wrong folder, or lose a rating, a label or a cache entry. Each was filed as pre-existing, mostly from a code reading.

**Success** is all of:

- every member's reproduction (§ 2) failed on `main` first, and passes on the branch;
- no file action runs while a folder is opening, and no undo depends on which folder happens to be open;
- two saves of `.bulk_rated.json` can no longer reach the disk in the wrong order;
- a quit writes what the app still owes the disk, and its wait cannot trap the window;
- an uncaught throw in main, while the session log is open (from `logger.init` to `cleanup`), reaches it, and the user still sees the error box they see today;
- the unit and E2E suites pass;
- `media-viewer.js` ends no longer than it started, or the PR states the raise (§ 3.8).

**Non-goals**: a new undo model; keyboard ownership for the tournament prompts; hash and sort cache saves at quit (§ 7). **Anti-goals**: a press that silently acts on a file the user cannot see; a quit that hangs with no way out; losing Electron's error box by installing a handler.

---

## 2. What Phase 0 measured on `main` at `65d8b71`

Every line is a run, not a reading. The tests are in `tests/e2e/rating-data-safety.test.js`; the write-order probe was temporary and is not committed.

| # | Entry title | Reproduction | Result on `main` |
|---|---|---|---|
| 1 | Undo can return a file to the wrong folder | A video on screen; `loadFolder(B)` and Like in one tick; Undo | The liked file lands in folder B. **Reproduced**, but see below |
| 1 | (same) | Like pressed inside the load's bulk-rated read, through `switchToFolder` | **A file of the new folder, never on screen, moves to the like folder** |
| 2 | Bulk-rated saves can still land out of order; `.bulk_rated.json` writes are not atomic, and saves overlap | 300 rounds of two overlapping writes against the real main | **29 of 300** left the older data on disk |
| 3 | Single-move and special undo drop the file's bulk-rated membership and prediction score | Label and score set, then a move, then Undo | Label and score gone after a Like, after a special move, **and after a compare-pair move** |
| 4 | `applyPredictionSortResult` silently drops listed files the sort result omits; `applyPredictionSortResult` drops live files missing from the AI result | A result that omits a listed file, fresh and chip re-sort | The file leaves the list in both |
| 5 | Tournament resume reconciles against a stale file list | Like, open the resume prompt, a real Ctrl+A behind it, Continue | The restored file is dropped from the tournament |
| 6 | No save at app quit | Unsaved entry, then a real window close | `.feature_cache.json` never appears |
| 7 | Main installs no `uncaughtException` handler | A throw from a main timer | The session log has no trace of it |
| 7 | (same) | A rejected promise in main | **Already logged**: this one passed on `main` |

Four findings change what gets built:

- **Member 1's scene is narrower than its entry, and its worst case is different.** Change-folder empties the list before it lists (`_switchToFolderNow`), so "the old file stays on screen while listing" is only reachable through a direct `loadFolder` with media showing, which today means the tournament's Apply reload. The entry's probe was at method level. The reachable case is the second row: `loadFolder` puts the new list in place, then awaits `loadBulkRatedFile()` before it renders, with `isLoading` false. A press in that window moves the first file of the new folder unseen. The window lasts one IPC read locally and longer on a slow drive.
- **Member 3 has a third site.** `moveComparePair` drops the label and score too, and the entry did not name it.
- **Member 7 needs one listener, not two.** `main.js` routes `console.error` into the session log, and Node prints an unhandled rejection through it. Only a throw is missed.
- **A plain `uncaughtException` handler would be a regression.** Measured on Electron 39.1.2: Electron's own listener shows the error box only when `process.listenerCount('uncaughtException') <= 1`, so adding a listener silently removes the box. `uncaughtExceptionMonitor` fires first and changes nothing.

Ruled out by reading: holding the load flag across `_switchToFolderNow`'s reset. `cleanupCurrentMedia()` is synchronous, so its `await` yields only a microtask and no key can land there.

---

## 3. Design

### 3.1 Member 1: nothing acts on files while a folder opens

File actions and folder loads become mutually exclusive. `loadFolder` already refuses during a file action; this adds the other direction, using the flag it already holds.

| Entry point | While `_folderLoadInFlight` |
|---|---|
| `moveCurrentFile`, `moveToSpecialFolder`, `moveComparePair`, `applyBulkRating`, `dislikeSkippedFiles` | return, quietly (the press targets a file the user has not seen; the same reasoning as the file-op guard) |
| `nextMedia`, `previousMedia` | return, quietly, first thing (a render racing the load's own render can leave the screen and the cursor on different files) |
| `handleCancel`, `handleTournamentUndo` | refuse with "Wait for the folder to finish loading", as a dropped undo reads as a broken one |
| `_removeFailedFileByPath`, `switchMode` | refuse through `_refuseIfFolderLoadInFlight()` |

The flag is released just as `showMedia()` hands over to `isLoading`, so a press after the first paint is not swallowed: `showSingleMedia` returns once the element is appended.

**An undo puts a file back where it came from.** One helper replaces the repeated block at each `handleCancel` site and the batch:

```js
async _moveBackFromHistory(entry) {
    const result = await window.electronAPI.moveFile({
        sourcePath: entry.newPath,
        targetFolder: window.electronAPI.path.dirname(entry.originalPath),
        fileName: entry.fileName,
    });
    if (!result.success) throw new Error(result.error);
    this._followRestoredFile(entry, result);
}
```

`handleTournamentUndo` changes only its `targetFolder`, since it re-points the entry later on purpose. The listing is not recursive (`listMediaEntries`), so this equals `baseFolderPath` whenever the guard holds. It makes the rule structural rather than a matter of timing. A source-level test fails on any `targetFolder: this.baseFolderPath` in the renderer, since a convention alone would not hold.

### 3.2 Member 2: one writer, in order

A new pure module, `coalescing-saver.js`, follows the extraction pattern of `like-or-skip.js`:

```js
export class CoalescingSaver {
    constructor(write) {}            // write(folder, payload) → Promise
    request(folder, payload) {}      // → settles once this payload, or a newer one for that folder, is written
    whenIdle(folder = null) {}       // → settles once nothing is queued or running (for one folder, or at all)
}
```

- At most one write **per folder** runs at a time. That is what closes the inversion: the two overlapping IPC calls are what reach main's per-target chain in the wrong order.
- Folders do not share a queue (changed from one global queue while building: per-folder state is simpler, different files cannot invert, and a hung drive then cannot hold back another folder's ratings). A request while a write runs replaces only its own folder's queued request, so A's newest rating survives a quick folder change.
- Everything is frozen at the request: folder, data, warning object and folder name. The freeze is what prevents a cross-folder ratings write, the class PR #81 found.
- A write that throws cannot wedge the queue, and no promise rejects, so the existing un-awaited call in `removeFileFromList` stays safe.

`saveBulkRatedFile` keeps its name and its "resolved means written" meaning for its five awaiting callers. `loadBulkRatedFile` awaits `whenIdle(folder)` before it reads, so reopening a folder cannot read a copy older than its own last save. Waiting on that folder only means an offline folder's write cannot block a load of a different one.

### 3.3 Member 3: one capture, one restore

`_captureUndoFields(file)` returns the four fields a removal destroys: `prunedPairKeys`, `perceptualHash`, `score`, `bulkBucket`. All five capture sites use it: `moveCurrentFile`, `moveToSpecialFolder`, `moveComparePair` twice, and the batch.

`restoreFeatureCachesFromHistory` restores `score` and `bulkBucket` before its features guard, as it already does for the keys and the hash, and saves when it restored a label. Every undo branch already calls it, the tournament's included, so no branch can miss them. The batch's own two restore lines go. It keeps its `await saveBulkRatedFile()`, which now gives it durability rather than the only write. A suffixed restore works unchanged: `_followRestoredFile` re-points the entry first, so the label follows the file's new name.

`LikeOrSkip.trainingWeight` weighs a special entry with a `bulkBucket` as 1 (§ 4, call 8).

### 3.4 Member 4: an AI order keeps every listed file

`applyPredictionSortResult` lays the result over the live list with `SimilaritySort.alignToLive`: ordered files first, then every other live file in live order. "No files to sort" still fires when no name in the result is live. A chip re-sort passes the aligned list to `parkSkippedOrder` unchanged.

Compare mode reads a missing score as 0.5 (`computeValidComparePairs`). With mixed scores that is the middle; when every score sits on one side of 0.5 it puts the kept file in an extreme slot, so it can pair with the top file until the next sort (corrected after PR #95 review 14; § 7).

### 3.5 Member 5: Continue reads the list when it is pressed

The Continue handler reads `this.mediaFiles` after `restoreOriginalOrderForTournament()`, not the list captured when the prompt opened. That list stays only for the prompt's preview text. Keys reached the app behind the prompt, which the reproduction proved with a real Ctrl+A, so Continue also refuses during a file action or a load, as the header actions do. PR #95 review 3 and 7 then closed two consequences: no key dispatches behind a prompt but Escape and F1, and a folder load closes the prompts.

### 3.6 Member 6: a quit saves what is owed

The window-close handshake already exists, and `handleAppCloseRequest` is its one renderer entry. Every path that allowed the close now goes through `_saveThenAllowClose()`:

1. Wait up to 2 s for an in-flight file action, so an undo's label restore gets saved.
2. Stop background extraction, then settle three things together: `_bulkRatedSaver.whenIdle()`, a new `FeatureCacheStore.flush()` (the visit's unsaved entries, then every queued save), and a new `tournament.flushPending()` (a complete tournament's last pick, up to 500 ms old). Not `flush()`, which forces a write of the engine as it stands, to a `_persistFolder` a resumed tournament has not set until its first pick (found tracing this step to the code).
3. Race all of it against a 15 s cap, then `allowAppClose()`, always, in a `finally`.

- **Member 2 makes this required, not optional.** A coalesced save waits in the renderer, where a quit would lose it. Before, each save had already gone to main.
- **The cap.** Training-folder saves in the local perf log ran ~0.3 ms an entry (4,456 ms at 15,864 entries; 3,191 ms at 13,207), so 24k is ~7 s, and a save already streaming plus the queued one is ~14 s. Past the cap the temp file is abandoned and the cache on disk is untouched, which is the loss the app has today.
- **No trap.** After 300 ms a sticky note says "Saving before closing — close again to quit now", and a close request after that allows the close at once; before the note it is ignored, as a double click that would drop a queued save (PR #95 review 10). The leave prompt's write runs before this wait and outside the cap, so a close request after a choice there is let through too (review 9). A normal quit owes nothing, settles in microtasks and shows no note.
- `main.js` does not change. One perf-log line records the wait and whether it hit the cap, so the cap can be re-judged on real numbers.

### 3.7 Member 7: log a throw, keep the box

```js
// logger.js, called at the top of main.js
function installCrashLogging(proc = process) {
    proc.on('uncaughtExceptionMonitor', (err, origin) => {
        try {
            error('process', `${origin}: ${err?.stack ?? err}`);
        } catch (_e) {
            // A logging failure must not turn into a second exception here.
        }
    });
}
```

No file-move handler changes, so PROJECT.md's Tier 1 approval does not apply.

### 3.8 The renderer ceiling

**Result**: 11,527 lines after the build, with `_fileFromHistory` applied at seven sites; then 11,572 after PR #95's review round 1, an explicit raise of 43 over the start for its data-safety fixes, stated in the PR. The renderer sat exactly at its 11,529-line ceiling. The helpers in §§ 3.1 and 3.3 remove about 65 repeated lines and the rest add about 85, so the estimate was about +20. If it lands over, a small `_fileFromHistory(entry)` for the six repeated list-entry literals in the undo branches saves about 36 more. That is the same code being touched, and it is the plan's first resort before a raise. WEEKLY allows G3 an explicit raise (v2's net ≤ 0 binds v2 phases), so a raise stays legal, and the PR must then state it.

The ceiling must **equal** the count when this merges, whichever way it moved, because the ratchet refuses the closeout's push to `main` if the count is under the ceiling too.

---

## 4. My calls, for checking

1. **Refuse, never queue, a press during a folder load.** It targets a file the user has not seen; the file-op guard ruled the same.
2. **Guard navigation and mode switches too**, beyond the entry's list, because a render racing the load's render leaves the cursor on a file that is not on screen.
3. **Keep the `dirname` rule even though the guard makes it redundant**, because it removes the dependency on the open folder and it shrinks the code.
4. **A new top-level module for the saver**, not more renderer code, in line with v2's direction.
5. **Fix the compare-pair site in member 3**, which the entry did not name: same defect, same field, and it is where bulk ratings are made.
6. **15 s cap; 300 ms before the note; a second close quits at once.**
7. **Flush the tournament's debounced write at quit too.** One line, and a save-at-quit that knowingly leaves a pick unsaved would be odd.
8. **Close the tenth entry here.** Its `[possible-dup-of]` tag points at member 3, and with `bulkBucket` on the entry the fix is one line.
9. **Log only for a throw**: no restart and no quit. Electron keeps the app running after its box today, and this does not change that.
10. **No rejection listener.** Rejections are already logged, and a listener would only change their format.

---

## 5. Testing

Each member keeps its E2E from § 2 as the RED that failed first. Added with the fixes:

- `tests/coalescing-saver.test.js`: single flight; newest wins within a folder; a queued folder survives another folder's request; the promise's meaning; `whenIdle` with and without a folder; a throwing writer does not wedge.
- `tests/rating-data-safety-glue.test.js` (the extracted-method technique):
  - the guard table of § 3.1, each row refusing with no IPC and no flag taken;
  - every undo site's target from an entry whose origin differs from `baseFolderPath`;
  - capture and restore, including the suffixed name;
  - `_saveThenAllowClose` under fake timers: the cap, the note's timing, the second close, a rejecting flush still closing;
  - the source-level `targetFolder` control.
- `tests/feature-cache-store.test.js`: `flush` waits for a queued save of an ended visit.
- `tests/logger.test.js`: the monitor logs; a throwing write does not escape.
- `tests/like-or-skip.test.js`: the special-with-label weight, both ways.
- An E2E that two coalesced saves made just before a real close are both on disk. It cannot fail on `main`, where nothing coalesces, so it guards § 3.6 against § 3.2; its comment says so, and I prove it by removing the flush.

The saver is a mutation target: key every folder to one queue and the other-folder test must fail; make the writer overlap and the single-flight test must fail.

---

## 6. Dependencies between members

- Member 6 needs member 2's `whenIdle`, and member 2 is unsafe without member 6, so they land together.
- Member 3's restore calls the saver from inside `restoreFeatureCachesFromHistory`. A batch undo passes `{ deferBulkSave: true }` and saves once itself, as a batch's removal does (changed while building: the existing one-save test stays as it was).
- Member 1's helper and member 3's capture are what keep the renderer near its ceiling.

---

## 7. Left alone, for the plan's Future Improvements

- A render already in flight when a direct `loadFolder` swaps the list can paint a stale file, because `showMedia()` returns early on `isLoading`. The Apply reload reaches it, and so does a JXL decode still running at a folder switch, which then paints over the new folder's image, so a rating moves a file no longer shown (PR #95 review 8). BACKLOG says the user's folders hold no JXL today.
- A pair undo whose second restore fails pushes both entries back, and the first can then never move again (its `newPath` is gone).
- The tournament prompts still do not own focus: Tab and Enter reach the header behind them. Keys no longer dispatch and a load closes them (PR #95 review 3, 7), so the two known results are closed, not the cause.
- A hung renderer can still make the window unclosable, because main has no bound on the handshake. It cannot have a blind one while the leave prompt waits on the user.
- Hash and sort caches are not flushed at quit: they are recomputable, and each has its own periodic save.
- An OS shutdown (`session-end`) was not checked.
- A refused feature-cache save's re-read and re-save are not waited for at quit: they cost a re-extraction, not data.
- File actions are not refused during the save at quit. A press in that window still moves its file, and its label change may not be saved; the next load prunes a stale name.
- A reload skips the close handshake (PR #95 review 13, measured in a bare Electron window): `main.js` sets no menu, so the default menu's reload runs with 0 `close` events, losing a queued save, the 500 ms tournament write and unsaved feature entries. Removing those roles changes the menu and developer tools, so it is the user's call.
- The quit's wait reads `_fileOpInFlight` (PR #95 review 12): `handleTournamentUndo` never holds it, a batch undo past 2 s loses its labels, and with the bulk-dislike or folder-creation dialog open X waits 2 s and shows the note though nothing is saving.
- A kept scoreless file can be bulk-rated, and a label on a file with no features blocks the model cache, so each later AI sort of that folder retrains (PR #95 review 14; BACKLOG "Remember a stable decode failure, so an undecodable training file stops blocking the model cache").
- A bulk label is erased on disk by removals that are not ratings, with no undo: a tournament skip, and the load prune when a stat fails during listing (PR #95 review 15; reach unproven).
- A final tournament pick under 500 ms before a folder switch on a complete tournament never reaches disk: `loadFolder` nulls the engine without a flush (PR #95 review 5). Its wrong-folder half is closed.
- A `.bulk_rated.json` write that never settles holds a later load of that same folder, since the load waits for it. Main's write has no timeout; a read of a drive that hung would hang as well, so this adds no new stall class, but the saver's wait is unbounded.
- 🟤 "`mlFeatures` capture is gated on `isMlEnabled && mlWorker`" stays open: it costs a re-extraction, not data.
