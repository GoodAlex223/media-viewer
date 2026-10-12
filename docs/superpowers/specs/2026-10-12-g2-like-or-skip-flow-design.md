# G2 Like-or-Skip Flow — Design Spec

**Task Reference**: WEEKLY.md Oct 12–16 § G2 (🔵 🏆, 8 SP → **~10 SP**, see § 13) ← BACKLOG 🔵 [2026-10-04] "Add a bulk 'dislike the skipped files' action to single mode" and "Show that the AI-sort order is out of date after ratings, and offer a one-click re-sort" (the user's workaround recorded in the first entry of the same section, "Help the user separate better from worse…", is the design evidence)
**Created**: 2026-10-12
**Status**: Draft — awaiting user review. Brainstormed and approved section by section on 2026-10-12 (decisions D1–D6, § 3).
**Branch**: `g2-like-or-skip-flow` (from `main` @ `15cec8c`, after G1 merged `e5cd3a8`; one PR, per the week's branch/PR shape)
**Trial vehicle**: _You should know_ (REVIEW-QUEUE § 5, 2026-10-09 row) — the user enables it in this group's session (`/plugin enable cc-plugin-you-should-know@builtin`); read-out at G6.

---

## 1. Goal

Make the user's own like-or-skip workflow fast and safe. The setting: they are splitting `Liked_2` into better
(`Liked_3`, the like folder) and worse (`Liked_1`, the dislike folder). On the AI order in single mode they
**Like** a file or press **Next** past it, and every 15–20 skips they want every skipped file disliked in **one
confirmed action** that **one Ctrl+A** fully undoes. They also want to see when the AI order no longer
reflects their ratings, and re-sort in one click without losing their skip decisions.

| #   | Item                                     | Files                                                                                                                         | Source          |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Skip tracking + bulk "Dislike N skipped" | `like-or-skip.js` (new), `media-viewer.js` (`nextMedia`, `removeFileFromList`, new `dislikeSkippedFiles`, `handleCancel`, shortcuts), `index.html`, `styles.css`, `tests/` | 🔵 [2026-10-04] |
| 2   | Out-of-date hint + one-click re-sort     | `like-or-skip.js`, `media-viewer.js` (`handleSortByPrediction`, `applyPredictionSortResult`, `updateSortPredictionButton`), `index.html`, `styles.css`, `tests/` | 🔵 [2026-10-04] |

**Success** = ~20 like-or-skip decisions, then `F` (or the button) and Enter move every skipped file to the
dislike folder; one Ctrl+A puts them all back in their original order with the cursor where it was; the file
on screen, the counters and every per-file cache stay consistent throughout.

**Non-goals.**
- General multi-select, or a "Like N skipped" (🔵 [2026-08-28] multi-select entry stays open).
- Skip tracking outside the AI order (D1).
- Cancelling a batch part-way; a progress bar.
- Any change to compare-mode pairing (`computeAllComparePairs` stays the extremes pairing).
- Persisting the skipped set across app restarts — it is session-only, like `bulkRatedPairs`.
- Counting changes made outside the app (Explorer moves) toward the out-of-date hint.
- Fixing the four pre-existing defects found while designing (§ 12) — filed, not fixed.

---

## 2. Findings that shaped the design

Line numbers as read on 2026-10-12 (`main` @ `15cec8c`); re-locate by symbol before editing.

**F1 — In the user's flow, the skipped files are exactly the files behind the cursor.** `moveCurrentFile`
removes the rated file and leaves `currentIndex` on the slot the next file slides into (`media-viewer.js:~1774-1779`);
`nextMedia` advances by one (`:~1622`). So after a pass that starts at index 0 and only likes or skips, every
file before the cursor was skipped. A positional rule ("dislike everything above") breaks after Previous, a
wrap-around or a mid-list start, so tracking is by set (D1 rejected the positional option).

**F2 — `removeFileFromList` only clamps `currentIndex`; it never shifts it** (`:~1396-1398`). Removing a file
*before* the cursor therefore silently re-points the cursor at a different file. Correct for `moveCurrentFile`
(the removed file *is* at the cursor); wrong for a batch, which must recompute the cursor itself (§ 6 step 8).

**F3 — A sort resets the cursor and overwrites the original-order snapshot.** `applyPredictionSortResult`
sets `currentIndex = 0` (`:~7555`); `handleSortByPrediction` sets `originalMediaFiles = [...this.mediaFiles]`
on every sort (`:~8607`). A re-sort from a sorted state would capture the AI order as "original", breaking
Restore Order. The similarity sort already guards the same hazard (`forceResort` → `if (!wasAlreadySorted)`,
`:~6198-6202`).

**F4 — The AI-sort button is a toggle.** While sorted it reads "Restore Order" and its click restores the
folder order (`:~8464-8466`, `:~8496-8508`). A one-click re-sort therefore needs its own control (D4).

**F5 — The similarity sort never clears `isSortedByPrediction`** (it sets `isSortedBySimilarity = true` at
`:~6244`/`:~6422`; nothing in `handleSortBySimilarity` touches the prediction flag). After a similarity sort on
top of the AI order both flags read true and the AI button still reads "Restore Order". So
`isSortedByPrediction` alone cannot mean "the AI order is on screen" — the feature keeps its own token (§ 5).
Pre-existing; filed (§ 12).

**F6 — `removeFileFromList` fires an un-awaited `saveBulkRatedFile()` per bulk-rated file** (`:~1389-1391`),
and `writeBulkRatedFile` is a plain `fs.writeFile` (`main.js:~526-536`), not an atomic `.tmp` + rename. A batch
of N bulk-rated files would start N overlapping writes of one file. The batch defers and saves once (§ 6).
The general hazard (two overlapping saves from a compare-pair move today) is filed (§ 12).

**F7 — Undo of a single move drops bulk-rated membership and the prediction score.** `removeFileFromList`
deletes both; `restoreFeatureCachesFromHistory` (`:~1442-1465`) restores neither, and the single-mode undo
branch (`:~4605-4640`) re-inserts at `currentIndex` without them. Bulk-rated membership feeds the training-set
fingerprint, so the batch undo restores both (§ 7). The single-move gap is filed (§ 12).

**F8 — `move-file` is per-file, no-overwrite, and returns the real target path** (`main.js:~377-430`): it
suffixes ` (n)` on a collision and reports `targetPath`; undo follows it with `_followRestoredFile`
(`media-viewer.js:~1435-1440`). Sequential per-file calls are enough for a batch; there is no batch IPC and none
is needed — main authorizes every path itself (G1), so per-file calls add no new trust surface and no
`preload.js` change.

**F9 — The existing modal leaks its keydown listener.** `showFolderCreationDialog` (`:~825`) removes its
`document` keydown listener only on Escape (`:~876`); its click paths leave it registered. Harmless today
(the stale handler's `resolve` is a no-op), but the new dialog must not copy it. Filed (§ 12).

**F10 — Compare pairing is score-driven, not order-driven** (`computeAllComparePairs`, `:~3378-3391`, sorts
by `predictionScores`). The re-sort's list order (skips parked first) has no effect on compare pairs; restoring
prediction scores on undo matters more than restoring positions for compare mode.

---

## 3. Decisions (user rulings, 2026-10-12 brainstorm)

| #   | Question                                              | Ruling                                                                                                                      |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1  | When are skips tracked?                               | **Only while the AI order is on screen**, in single mode. Leaving the AI order ends tracking.                               |
| D2  | A re-sort with skips not yet disliked?                | **Keep them, parked behind the cursor**: skipped files first, then unjudged files in the new model order.                  |
| D3  | Which file is on screen after a re-sort?              | **The new best unjudged file** (the first file after the parked skips). Supersedes the BACKLOG's "keeps the current file in view". |
| D4  | Where do the hint and the re-sort live?               | **A separate chip** ("↻ Re-sort · 12 new") beside the AI-sort button; "Restore Order" is unchanged.                         |
| D5  | How is the bulk dislike triggered?                    | **A button in the single-mode bar + a default single-mode `F` hotkey** (mirrors compare's `F` = Both bad). Enter confirms, Escape cancels. |
| D6  | Architecture                                          | **A pure module + glue** (Approach A): pure `like-or-skip.js`; `MediaViewer` keeps the guarded IO, dialog, undo branch, UI. |

Also approved with the sections (no separate question): skips survive compare-mode excursions; a one-time
notice when Restore Order or a similarity sort discards un-disliked skips; failed files stay listed and skipped;
undo returns the cursor to the file on screen when the batch ran; the out-of-date mark is taken before training
(never undercounts).

---

## 4. Architecture

**`like-or-skip.js`** — new pure ES module, the `tournament-engine.js` pattern: no DOM, no IPC, no `this` of
`MediaViewer`; imported by `media-viewer.js` and directly by Vitest. Proposed surface (the plan may rename):

```js
export class SkipTracker {
    active;          // boolean — "the AI order is what's on screen" (D1)
    skipped;         // Set<string> of file paths
    activate({ keepSkips })   // fresh AI sort: keepSkips=false (emptied); chip re-sort: true
    deactivate()              // order left — returns the number of skips discarded (for the notice)
    recordSkip(path)          // no-op unless active
    forget(path)              // rated / removed
    restore(path)             // undo re-adds (no-op unless active)
    skippedIn(mediaFiles)     // → file objects, list order, intersection only (the count source)
}

export function planCursorAfterBatch(filesBefore, movedPaths, currentIndex) // → index into filesAfter
export function planUndoReinsertion(mediaFiles, restored, { orderUnchanged }) // → new array
export function parkSkippedOrder(sortedFiles, skippedSet)  // → { files, cursor }
export function computeStaleCount(history, mark)           // → number
export function reconcileMarkAfterUndo(mark, before, after) // → new mark
export function trainingWeight(historyEntry)               // like/dislike 1, bothGood/bothBad 2, skipBatch N, special 0
```

**`MediaViewer` glue** — `this.likeOrSkip = new SkipTracker()`; a single `_onOrderChanged(kind)` hook
(`'ai-fresh' | 'ai-resort' | 'other' | 'folder'`) that drives the tracker, bumps `this._orderGeneration`, takes the
out-of-date mark and fires the discard notice; `dislikeSkippedFiles()`; the `skipBatch` branch of
`handleCancel`; `showBulkDislikeConfirm()`; `updateDislikeSkippedButton()`; the chip; the `dislikeSkipped`
shortcut. Estimated +~150 lines in the renderer (Approach B was ~+350).

**Why one hook.** Every site that reassigns `mediaFiles` to a new *order* must end tracking (D1), bump the
order generation (§ 7) and, for the AI sort, take the mark (§ 8). Scattering three calls across seven sites is
how a site gets missed. Known order-changing sites to route through it: `applyPredictionSortResult` (fresh or
re-sort), the AI toggle-off (`:~8496`), `handleSortBySimilarity` apply and restore, `applyCachedSortOrder`,
`restoreOriginalOrderForTournament`, `loadFolder` (and the change-folder handler, which calls it). **Control, not
convention**: a unit test scans `media-viewer.js` for `this.mediaFiles =` assignments and fails when one appears
outside a known, reviewed list — so a future order-changing site forces a decision (memory "A convention is not
a control").

---

## 5. Skip tracking

- **Record** in `nextMedia()`'s single-mode branch, **after** its guards (`isLoading`,
  `mediaNavigationInProgress`, `_fileOpInFlight`) pass and before the cursor advances:
  `if (this.likeOrSkip.active && this.mediaFiles.length > 1) this.likeOrSkip.recordSkip(currentFile.path)`.
  A refused Next records nothing; a one-file Next goes nowhere and records nothing. Every Next path goes
  through `nextMedia` — the `S` key, the nav arrow and the mouse wheel (`:~2092`, `:~2591`, `:~10028`).
  `previousMedia()` never records.
- **Forget** in `removeFileFromList()` — the one cleanup point for every move (like, dislike, special,
  compare pair, failed-file removal, the batch itself). A skipped file revisited with Previous stays skipped
  until rated, so the file on screen *can* be in the set.
- **Count** = `skippedIn(mediaFiles)`, used by both the button label and the batch snapshot, so a stale path is
  never counted or moved. O(n) Set lookups — ~1 ms at 24k files.
- **Lifecycle** (via `_onOrderChanged`):

| Event                                                            | `active`   | Skipped set                                         |
| ---------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| Fresh AI sort applied (from an unsorted list)                    | on         | emptied                                             |
| Re-sort via the chip                                             | on         | **kept** (intersected with the list)                |
| Restore Order, similarity sort / cached similarity order, tournament entry | off | cleared — notice "Skipped list cleared (14 files)" if non-empty |
| Folder change                                                    | off        | cleared silently                                    |
| Compare mode while AI-sorted                                     | unchanged  | kept; compare Next records nothing; compare ratings still forget via `removeFileFromList` |

---

## 6. Bulk dislike — `dislikeSkippedFiles()`

Called by `#dislikeSkippedBtn`'s click and the `dislikeSkipped` action. **Must not call `moveCurrentFile`**
(a guarded method calling another is silently refused — CLAUDE.md § Async Patterns).

**Synchronous refusals, before the guard** (the order `moveCurrentFile` uses):
1. `_fileOpInFlight`, `isLoading`, not single mode (`isCompareMode`/`isTournamentMode`), or tracker inactive →
   return silently.
2. `skippedIn(mediaFiles)` empty → `info` notice "Nothing skipped yet" (the button is hidden at 0; `F` is not).
3. No dislike folder → the existing "Configure like/dislike folders in Settings (F1)" error notice.
4. `_refuseIfNeedsRegrant(['dislike'], 'move')`.

**One guarded block** — `this._fileOpInFlight = true; try { … } finally { this._fileOpInFlight = false; }`
around everything below:

1. `signalUserActivity()`; **snapshot** the batch (`skippedIn`, list order) and `onScreen =
   mediaFiles[currentIndex]`. Navigation and every other file action are refused while the guard is held, so
   the batch cannot change under the dialog.
2. **Confirm** — `await showBulkDislikeConfirm({ count, folderName, includesOnScreen })`: "Dislike 14 skipped
   files? They'll move to `Liked_1`. One Undo (Ctrl+A) brings them all back." plus "Includes the file on
   screen." when it does. Declined → return (nothing rendered, nothing in flight).
3. **Folder** — `checkFolderExists(dislike)`: `null` → `_refuseUngrantedFolder('dislike')` and return; `false` →
   `showFolderCreationDialog` → `createFolder` (declined → return; failure → error notice, return).
4. **Capture per file**: the file object (all fields, incl. `mtimeMs`), its index in the pre-batch list, its
   `mlFeatures` from the caches (`getCombinedFeatures` ‖ `featureCache` — no extraction, as
   `moveToSpecialFolder`), its prediction score, its bulk-rated bucket, its `prunedPairKeys`.
5. **Teardown** only if `onScreen` is in the batch and is a video: `forceVideoCleanup()` + the existing 500 ms
   wait. Images and JXL hold no file lock and are not torn down.
6. **Sequential `moveFile`**, each in its own `try`: success → record `{ ...captured, newPath: targetPath }`;
   `{success:false}` or a throw → record the failure and **continue**. Sequential keeps main's no-overwrite
   suffix probe free of races. If the batch is over ~50 files, one "Moving N files…" `info` notice first.
7. **Cleanup** — `removeFileFromList(path, { deferBulkSave: true })` per moved file, then **one** awaited
   `saveBulkRatedFile()` if any bulk-rated entry was dropped (F6). Push **one** history entry, only if ≥ 1 file
   moved: `{ skipBatch: true, actionType: 'dislike', files: [...], prevCurrentPath: onScreen.path,
   orderGeneration: this._orderGeneration }`.
8. **Cursor** — `planCursorAfterBatch(filesBefore, movedPaths, currentIndex)`: if `onScreen` survived, the
   cursor follows it by path (F2); if it moved, the cursor goes to the first surviving file after it in the
   pre-batch order, wrapping to 0 (`moveCurrentFile`'s wrap).
9. **Render** iff the on-screen media was torn down (step 5) — including when every rename failed, so the screen
   is never left blank — and before the `finally`, so the `isLoading` gates take over with no gap. Otherwise
   (file on screen survived and was never torn down): `updateFolderInfo()`, `updateNavigationInfo()`,
   `updateDislikeSkippedButton()`, `updateSortPredictionButton()` only — no reload of the file on screen.
10. **Notices** — all moved: "👎 Moved 14 files to Liked_1" (`dislike`, shown regardless of
    `showRatingConfirmations` — it is the largest move the app makes); partial: "Moved 12 of 14 — 2 failed:
    <first error>" (`error`). Failed files stay listed and skipped, so a second `F` retries them.

---

## 7. Undo — the `skipBatch` branch of `handleCancel`

Placed beside the `bothGood || bothBad` check, before the compare-pair branches; runs under `handleCancel`'s
existing `_fileOpInFlight` hold and its existing refusals. Mode-agnostic (single or compare). In tournament
mode Ctrl+A routes to `handleTournamentUndo` (unchanged); the entry waits in `moveHistory` until the user
leaves the tournament.

1. **Pop**; restore each sub-entry sequentially (`moveFile(newPath → baseFolderPath, fileName)`), each in its own
   `try`; `_followRestoredFile(sub, result)` per success, and rebuild the file object with the followed
   `path`/`name` (other fields as captured).
2. **Reinsert** — `planUndoReinsertion`: if `entry.orderGeneration === this._orderGeneration` (no reorder since
   the batch), each restored file goes back at its original index, ascending — the exact pre-batch order;
   otherwise (re-sort or Restore Order since) the restored files are parked at the front of the list
   (consistent with "skips live behind the cursor"). Indices are clamped. Accepted approximation: a
   non-history removal or insertion since the batch (a load-failure removal, new files detected) shifts the
   exact positions by that many slots.
3. **Per-file state** — `restoreFeatureCachesFromHistory(sub)` (feature caches + rated-pair keys); the
   prediction score; bulk-rated membership, then **one** `saveBulkRatedFile()` (F7); `likeOrSkip.restore(path)`
   if tracking is active.
4. **Cursor** — to `prevCurrentPath` (followed through a rename) if listed; else stay on whatever is on screen
   now.
5. **Render** iff the cursor's file differs from what was on screen before the undo, or the empty state is
   showing; in compare mode always `showMedia()`. Otherwise update info, button and chip only.
6. **Partial failure** — sub-entries that failed to restore are pushed back as a smaller `skipBatch` entry
   (same `prevCurrentPath`/`orderGeneration`), so the next Ctrl+A retries just those. Notices: "✅ Restored 14
   files" / "Restored 12 of 14 — 2 failed: <first error>".
7. The out-of-date mark is reconciled **once, in `handleCancel`'s `finally`** (single owner, every branch —
   single, compare-pair, bulk, `skipBatch`), from a shallow copy of `moveHistory` taken at entry (§ 8). No branch
   carries its own stale-count code.

---

## 8. Out-of-date hint and re-sort

**Count** = training-set changes since the AI order was computed — `computeStaleCount(moveHistory, mark)`.

| Action                         | Weight | Why                                          |
| ------------------------------ | ------ | -------------------------------------------- |
| Like / Dislike                 | 1      | the file enters a training folder            |
| Compare-pair move              | 2      | two history entries, 1 each                  |
| Both good / Both bad           | 2      | changes bulk-rated membership (fingerprint)  |
| Bulk dislike                   | N      | N files enter the dislike folder             |
| Special move, skip             | 0      | neither feeds training                       |

Undoing a change made **after** the mark takes it back off (its entry leaves history). Undoing one made
**before** the mark *adds* to the count (the model trained on something now gone). A failed undo that pushes its
entry back changes nothing. Mechanism (pure, over `moveHistory`): `mark = { historyLength, undoneBefore }`;
count = Σ weight(entries at index ≥ `mark.historyLength`) + `mark.undoneBefore`. After every undo,
`reconcileMarkAfterUndo(mark, before, after)` finds the length `p` of the common prefix (by reference) of the
pre-undo copy and the post-undo history; if `p < mark.historyLength`, it adds Σ weight(`before[p..mark.historyLength)`)
to `undoneBefore` and sets `historyLength = p`. A failed undo re-pushes the same object, so the prefix is
whole and nothing changes. No counter at the five push sites; no code in the individual undo branches.
Accepted overcount: a *partially* failed undo of a pre-mark `skipBatch` counts the residual entry's files twice
(once as undone, once as a post-mark entry) — the hint may overcount, never undercount.

**Mark timing** — taken just **before** `ensureTrainedModel` starts (not when the result applies) and committed
when the sort applies; a rating made mid-sort then counts as new even if training picked it up. Overcounts by at
most the ratings made during training; never undercounts. A cancelled or failed sort commits nothing. When
`applyPredictionSortResult` runs with no pending mark (called outside a sort run, as the E2E does), the mark is
the current history position.

**Chip** `#resortPredictionBtn` — "↻ Re-sort · 12 new" beside `#sortPredictionBtn`. Visible iff the AI order is
on screen (`likeOrSkip.active`), count > 0, `isMlEnabled`, `!isPredictionSorting`, `!isTournamentMode`, and a
folder is loaded. Shown in compare mode too (pairing uses the scores, F10). Title: "12 ratings since the last AI
sort — re-sort to include them (retrains the model)". Refreshed from `updateSortPredictionButton()`, which every
rating, undo and sort lifecycle change calls.

**Re-sort** — `handleSortByPrediction({ resort: true })`:
- skips the toggle-off branch;
- **keeps the existing `originalMediaFiles` snapshot** (F3), so Restore Order still returns the true folder order;
- runs the same phases — training (a full rebuild: the training set changed; G3 makes it cheaper), extraction,
  scoring — under the same card, lease and abort controller;
- on apply: `parkSkippedOrder(sorted, skipped)` → skipped files first in their current relative order, then every
  unjudged file in the new model order; cursor on the first unjudged file, or 0 if every remaining file is
  skipped (D2, D3); `_onOrderChanged('ai-resort')` (tracker stays active, skips kept, mark committed);
- cancel or failure: order, skips and count unchanged.

The existing fresh sort (from an unsorted list) calls `_onOrderChanged('ai-fresh')`: tracker on with an empty
set, mark committed.

---

## 9. UI and keyboard

- **`#dislikeSkippedBtn`** in `.controls` (single-mode bar), after `#dislikeBtn`: dislike styling, Lucide
  `thumbs-down` + count, label "Dislike 14 skipped"; hidden at count 0 or when tracking is inactive. Title
  derived: "Dislike all skipped files" + `_shortcutSuffix('single', 'dislikeSkipped')`. Owner:
  `updateDislikeSkippedButton()`, called from the render's navigation-info update, after a batch or undo, on
  every `_onOrderChanged`, and from `saveShortcut`/`resetShortcuts`. Hidden by `showDropZone()`.
- **`F`** — `DEFAULT_SHORTCUTS.single.dislikeSkipped = 'KeyF'` (additive: no `loadShortcuts` version bump;
  `_mergeModeShortcuts` leaves it unbound if a stored single-mode remap holds `F`), an `ACTION_LABELS` row
  ("Dislike all skipped"), an `executeAction` case gated on single mode (second line of defence, as
  `special`). Not in `REPEATABLE_ACTIONS` — a held `F` fires once. `_isTextEntryTarget` already applies.
- **Confirmation dialog** — `showBulkDislikeConfirm()`, reusing the `.folder-creation-modal` shell and styles
  with a danger confirm button. Static markup; count and folder name as `textContent` (G1 lint guard). The
  confirm button takes focus. While open it **owns the keyboard**: a capture-phase `keydown` listener on
  `document` (it runs before the app's bubble-phase handler at `:~2431`) handles Enter (confirm) and Escape
  (cancel) and stops every other key except Tab from reaching the shortcuts (Space play/pause, F1, Q…). The
  listener is removed on **every** close path (unlike F9).
- **Chip** `#resortPredictionBtn` — `sort-prediction-btn` styling, smaller, Lucide `refresh-cw`. Hidden by
  `showDropZone()` and `setSortControlsVisible(false)` with the other sort controls.
- **Visual evidence** (plan-level acceptance check): before/after screenshots of the dialog, the button with a
  count and the chip, generated by extending `tests/e2e/visual-evidence.test.js` and committed under
  `docs/superpowers/specs/assets/g2-like-or-skip-*.png` (the PR #70 location).

---

## 10. Edge cases

| #   | Case                                                                 | Behaviour                                                                                         |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| E1  | Held `F` (OS auto-repeat)                                            | `_isSuppressedRepeat` drops repeats; one dialog                                                   |
| E2  | `F` / Q / S pressed while the dialog is open                         | The dialog's capture listener swallows them; the guard would refuse them anyway                   |
| E3  | Ctrl+A while the dialog is open                                      | Swallowed by the dialog (otherwise `handleCancel`'s in-flight notice)                             |
| E4  | File on screen is in the batch (revisited with Previous, or wrapped) | Dialog says so; video torn down first; cursor to the next survivor; render                        |
| E5  | Every rename fails                                                   | No history entry; error notice; render only if the on-screen media was torn down                  |
| E6  | Batch empties the folder                                             | `showMedia()` → `showEmptyStateWithUndo()` (history non-empty); Ctrl+A restores                    |
| E7  | Restore collides with a new same-named file                          | Lands at `name (n).ext`; followed for the list, caches, skip set and cursor                       |
| E8  | Undo after a chip re-sort                                            | Order generation differs → restored files parked at the front; cursor to `prevCurrentPath`        |
| E9  | Undo pressed in compare mode                                         | Same branch; reinsertion as E8 or exact; `showMedia()` renders a pair from the restored scores    |
| E10 | Skipped file was bulk-rated (Both good earlier)                      | Bulk entry dropped with the move, one save; undo restores it, one save                            |
| E11 | AI sort running while the user likes/skips                           | Allowed (unchanged). Files moved mid-sort drop out of the result; mid-sort ratings count as new   |
| E12 | Similarity sort on top of the AI order                               | `_onOrderChanged('other')` → tracking off, discard notice, chip hidden (despite F5's stale flag)  |
| E13 | Dislike folder unreachable / needs re-confirming                     | Refused before the guard, with the existing notice; nothing torn down                             |
| E14 | One file left, Next                                                  | Records nothing                                                                                   |
| E15 | Tournament entry with skips pending                                  | Tracking off, notice; the batch entry (if any) waits in `moveHistory`                             |

---

## 11. Testing and acceptance

**TDD, RED first**: every test below must fail on `main` before its code exists (memory "A RED test that passes
is zero coverage").

**Unit — `tests/like-or-skip.test.js`** (direct ESM import):
- tracker lifecycle (fresh empties, re-sort keeps and intersects, deactivate returns the discard count, inactive
  `recordSkip`/`restore` are no-ops);
- `skippedIn`: list order, never an unlisted path;
- `planCursorAfterBatch`: survivor with moved files before and after it; on-screen file in the batch; batch
  reaching the end (wrap to 0); everything moved;
- `planUndoReinsertion`: exact order when unchanged; parked at the front when reordered; clamping;
- `parkSkippedOrder`: skips first in current relative order, unjudged in model order, cursor; all-skipped → 0;
- `computeStaleCount` + `trainingWeight` + `reconcileMarkAfterUndo`: weights; post-mark undo takes back;
  pre-mark undo adds; a failed undo that pushes back the same entry changes nothing; a partially failed
  pre-mark `skipBatch` undo overcounts, never undercounts.

**Unit — `MediaViewer` glue** (`extractMethod`/`extractAsyncMethod`):
- `nextMedia` records only when active, single mode, > 1 file and the guards pass;
- `removeFileFromList` forgets, and honours `deferBulkSave`;
- `dislikeSkippedFiles`: each refusal happens before the guard is taken; exactly one history entry; exactly one
  bulk-rated save; a failed rename does not stop the loop; render iff torn down; declined dialog renders nothing;
- `handleCancel` `skipBatch`: partial failure leaves a smaller entry; cursor back to `prevCurrentPath`; a
  renamed restore is followed; bulk membership and scores restored;
- `handleSortByPrediction({ resort: true })` keeps `originalMediaFiles`;
- the `this.mediaFiles =` source-scan control test (§ 4);
- shortcuts: `F` bound in single, not repeatable, a stored remap onto `F` leaves `dislikeSkipped` unbound; the
  pinned single-mode sets updated in `tests/keyboard-shortcuts.test.js`, `tests/media-viewer-utils.test.js` and
  `tests/e2e/keyboard-shortcuts.test.js`.

**E2E — `tests/e2e/like-or-skip.test.js`** (new). The AI order is entered through the production entry point
`applyPredictionSortResult(<crafted result>)` — not by forcing `isSortedByPrediction` — since the sort itself
is not under test:
- the flow: S×3, `F`, the dialog shows 3, Enter → three files on disk in the dislike folder, the list shorter,
  the file on screen unchanged; Ctrl+A → all three back on disk, original order, cursor back;
- held `F` (`repeat: true`) opens one dialog; Q while it is open moves nothing;
- `tiny.mp4` on screen and in the batch → moved (Windows file lock released);
- the chip appears after one Like on the AI order and is gone after Restore Order.
Re-sort parking is covered at unit level with a stubbed `runMlSort`; a warmed real worker adds cost, not
coverage, for an ordering rule that is pure.

**Acceptance**: all unit + E2E green (pre-commit runs unit; pre-push runs E2E); the screenshots committed (§ 9);
a manual run on the user's real folders optional (not a gate), recorded in the plan if done.

---

## 12. Pre-existing defects found — file to BACKLOG 🟤 at closeout (not fixed here)

1. **The similarity sort leaves `isSortedByPrediction` set** (F5) — the AI button reads "Restore Order" over a
   similarity order. Readers that test `isSortedBySimilarity || isSortedByPrediction`
   (`restoreOriginalOrderForTournament`) are unaffected; every reader of `isSortedByPrediction` alone — the
   button label, and gates such as the bulk-rate buttons' (CLAUDE.md § Cache Management) — still believes the
   AI order is applied. Audit each reader when filing.
2. **`writeBulkRatedFile` is not atomic, and `removeFileFromList` fires overlapping un-awaited saves** (F6) —
   a compare-pair move of two bulk-rated files starts two concurrent `fs.writeFile`s of one file today.
3. **Single-move undo drops bulk-rated membership and the prediction score** (F7).
4. **`showFolderCreationDialog` leaks its keydown listener on its click paths** (F9).

---

## 13. Sizing, model and risks

**Re-estimate: ~10 SP** (planned 8; 1.25× — inside the 2× abort line): pure module + tests 2; skip-tracking
glue + the order hook + its control test 1; bulk dislike + dialog + button + `F` 2; undo branch 1.5; out-of-date
count + chip + re-sort 2; E2E + visual evidence 1.5. **Overrun drop order** (WEEKLY): the out-of-date hint
(§ 8) goes first — the plan should keep it in its own task(s) after the bulk dislike, so it can ship as a
follow-up PR without unpicking anything.

**Execution model** (WORKFLOW § 1.0; first guess, the plan confirms): Opus · `medium` for the guarded IO —
`dislikeSkippedFiles`, the `skipBatch` undo, the re-sort's snapshot handling — where the `_fileOpInFlight`
handoff and cursor rules are easy to get subtly wrong; Sonnet · `medium` for the button, chip, dialog markup,
shortcut wiring and the visual-evidence capture the plan spells out step by step. Review deep (`max`): this is
the largest single file move the app makes.

**Risks.**
- **The order hook is missed at a future site** → tracking stays active on a non-AI order. Mitigated by the
  source-scan control test (§ 4).
- **`_fileOpInFlight` handoff** — a success branch that releases the guard without starting its render, or a
  render started where none is needed (a video restart). Mitigated by the "render iff torn down" rule and its
  unit test.
- **Undo after interleaved non-history list changes** lands restored files a few slots off (§ 7 step 2) —
  accepted; the files are restored on disk and in the list either way.
- **Large batches** (hundreds of files) block input for the duration of the renames (~ms each). Accepted; the
  up-front notice says why.
