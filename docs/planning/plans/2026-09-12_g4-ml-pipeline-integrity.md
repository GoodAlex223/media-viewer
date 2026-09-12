# G4. ML Pipeline Integrity - Implementation Plan

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G4 (🟤, 5 SP, Mon–Tue); BACKLOG `### [2026-09-02] From: G5 closeout` items 1–3
**Created**: 2026-09-12
**Status**: In Progress
**Last Updated**: 2026-09-12

---

## 1. Task Overview

**Goal**: Close the last reachable door that lets a prediction sort train on zero-CLIP vector
halves; retire a worker abort protocol that cannot fire; and extend the `ml-worker.js` test
harness to pin the message contract G1 changed. Plus the 0-SP housekeeping flip of the five
PR #65 BACKLOG entries G2 shipped.

**Context**: G5 (`0d3fed5`) fixed the _training_ entry point by awaiting `initClipModel()`. Its
closeout filed three residuals. G1 (`bfcc881`, merged 2026-09-09) then moved two of the three
premises, so this group is re-scoped against the code as it stands today, not as filed.

**Success Criteria**:

- [ ] A pending `clipUnloadTimer` cannot flip `clipWorkerReady` false during a prediction sort,
      in **both** arming orders (armed before the sort; armed by an extraction that finishes
      during the sort)
- [ ] `ml-worker.js` carries no unreachable abort machinery, and no stale reference to it
      survives anywhere in the repo (code, tests, comments, docs)
- [ ] `tests/ml-worker.test.js` pins all four `updateProgress` sites and every reply shape
      (`scoreComplete`, `sortComplete`, `modelState`, `resetComplete`, unknown-type error)
- [ ] `npm test` green; pre-commit hook green
- [ ] BACKLOG `[2026-09-02]` items 1–3 resolved with evidence; `[2026-07-21]` items flipped
      with evidence

---

## 2. Analysis

### Problem Restatement

Three separate things, one theme — the ML pipeline's integrity is asserted but not enforced:

1. **The unload timer outlives its guard.** `CLIP_UNLOAD_DELAY_MS = 30000` is armed at the tail
   of `startBackgroundFeatureExtraction` and cleared in exactly two places: the settings toggle
   (`media-viewer.js:~2043`) and that same function's head (`~8831`). `initClipModel()` never
   clears it. G1 made `handleSortByPrediction` await `initClipModel()` on **every** sort, which
   fixes `clipWorkerReady` at the instant the sort starts; it does nothing about a timer that
   fires 30 s later, mid-training-loop, and flips the flag back to false.
2. **A protocol with no sender.** `ml-worker.js` has `case 'abort'`, an `abortFlag`, four
   `abortFlag = false` resets and a check inside `scoreFiles`' loop. No caller ever sends it.
3. **A harness that exists but stops short.** `tests/ml-worker.test.js` was created by G1 and
   already solves the hard part (the `importScripts` shim). It pins `trainHistorical` and
   `initComplete` only.

### Premise corrections (measured 2026-09-12 against `68a7a91`)

| WEEKLY / BACKLOG claim                                                     | Measured today                                                                                                                                                                                                                                                                                                   | Consequence                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "new `tests/ml-worker.test.js`"                                            | **Exists**: 125 lines, 11 cases, `importScripts` shim + `globalThis` hoist + `self` stub already working, no CJS export needed                                                                                                                                                                                    | Task 3 is _extend_, not _create_; the "conditional CJS export if unavoidable" contingency is moot   |
| "pin the abort-flag protocol"                                              | The protocol **cannot fire**: no `{type:'abort'}` sender exists (all five `mlWorker.postMessage` sites are `init`/`reset`/`trainHistorical`/`getSortedOrder`/`scoreAll`), and `scoreFiles`' loop is synchronous, so a queued `abort` could not be processed mid-loop even if sent. Every work case also resets the flag at its head | Cannot be pinned; must be deleted or wired. **Decision: delete**                                    |
| "`handleSortByPrediction` skips Phase 1 when `clipWorkerReady` is already true" | **No longer true** — G1 made the `initClipModel()` await unconditional under `enableClipFeatures`                                                                                                                                                                                                                 | The start-of-sort half of door (a) is already closed; the mid-sort half is not                     |
| door (b): extraction caches CLIP-less entries                              | G1 added a coverage gate (`ml-training.js:849`): `cacheable` is false when `enableClipFeatures && clipMissing > 0`, the user is notified, and neither the session tier nor the on-disk model cache commits                                                                                                         | The _training_ consequence is already closed; only the self-healing cache-entry residual remains. **Decision: record as accepted** |
| "G2 shipped five PR #65 entries"                                           | **Four shipped, one qualified** — see § 3 Phase 1                                                                                                                                                                                                                                                                 | Flip four plainly, the fifth with its measurement                                                  |

### Approaches considered — door (a)

| Approach                                                | Pros                                                                                                                                                                                              | Cons                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Clear `clipUnloadTimer` in `initClipModel()` (as filed) | 3 lines; closes the armed-before-sort case                                                                                                                                                        | Partial — a guard that holds at one instant and not across the awaits that follow                                                                            |
| B. **Lease + clear** (selected)                         | Total: covers both arming orders; one helper replaces two open-coded arming sites; the release has exactly one home (`handleSortByPrediction`'s existing single-owner `finally`)                   | One counter of new state; a leak would pin ~200–400 MB, so the release path must be `finally`-guarded and the timer must re-arm rather than drop             |
| C. Delete the unload timer entirely                     | No race at all                                                                                                                                                                                    | Gives back the ~200–400 MB reclaim the timer exists for; far beyond a 2-SP item                                                                              |

### Selected approach

**B.** A lease counter gates both arming and firing. The clear in `initClipModel()` is kept — it
is cheap, and `initClipModel()` is the one place that unambiguously means "the model is wanted".

### Assumptions

- `handleSortByPrediction`'s `finally` runs on every exit path (it is the documented single owner
  of sort-card teardown).
- A lease held across a sort is bounded by that sort; no other code path takes one today.
- `_handleClipUnloadTimer` re-arming under a held lease is correct, not a leak: the release path
  arms too, so the model is reclaimed either way; the re-arm only covers a lease that outlives one
  full grace window.

### Edge cases

| Edge case                                                | Handling                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sort throws / is cancelled mid-flight                    | Release lives in the existing `finally`; the counter returns to 0 and `_scheduleClipUnload()` arms                   |
| Extraction completes _during_ a sort and arms a timer    | `_scheduleClipUnload()` refuses to arm while `clipLeases > 0`; the sort's release arms it instead                    |
| Timer already pending when a sort starts                 | `_acquireClipLease()` clears it, and so does `initClipModel()`                                                       |
| Lease held longer than one 30 s window                   | `_handleClipUnloadTimer` re-arms for another window instead of unloading — the model is deferred, never leaked       |
| `enableClipFeatures` toggled off mid-sort                | `_scheduleClipUnload()` and `_handleClipUnloadTimer` both re-read the flag, as today; the settings toggle's own `clearTimeout` is unchanged |
| Two overlapping CLIP consumers                           | Counter, not boolean — a release from one does not disarm the other's protection                                    |
| `resetMlModel()` / folder change during a sort           | Untouched by this change; the lease is released by the sort's `finally` regardless                                   |

### Risks

| Risk                                                                    | Impact | Mitigation                                                                                                                 |
| ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Lease leak pins the CLIP model in memory                                | Med    | Release in `finally` only; unit test asserts the counter returns to 0 and the timer arms after release                     |
| Deleting `abortFlag` breaks a caller I did not find                     | Med    | Whole-repo grep across code, tests, E2E, comments and docs before committing (the PR #56 rule in CLAUDE.md)                |
| `updateProgress` assertions pin a label a future change legitimately renames | Low    | Exact-string assertions are the point — a rename should have to update the test that documents the contract               |

---

## 3. Implementation Plan

### Files affected

| File                                                            | Action | Purpose                                                                                                                                    |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [BACKLOG.md](../BACKLOG.md)                                      | Modify | Phase 1 flips; Phase 4 rulings                                                                                                             |
| [media-viewer.js](../../../media-viewer.js)                      | Modify | CLIP lease: `_scheduleClipUnload`, `_acquireClipLease`, `_releaseClipLease`, `initClipModel`, `_handleClipUnloadTimer`, extraction tail, `handleSortByPrediction` |
| [tests/media-viewer-utils.test.js](../../../tests/media-viewer-utils.test.js) | Modify | Lease unit tests (fake timers)                                                                                                             |
| [ml-worker.js](../../../ml-worker.js)                            | Modify | Delete the abort protocol                                                                                                                  |
| [tests/ml-worker.test.js](../../../tests/ml-worker.test.js)      | Modify | Extend: progress sites + every reply shape                                                                                                 |
| [CLAUDE.md](../../../CLAUDE.md)                                  | Modify | Zero-CLIP gotcha line: the `clipUnloadTimer` residual is closed                                                                            |

### Phases

#### Phase 1: Housekeeping flip (commit 1, 0 SP)

- [x] Flip BACKLOG `[2026-07-21]` items, each with its own evidence:
    - [x] `reconcileWithFiles` untracked prune → `tournament.js:128` `engine.clearHistory()`
    - [x] Failed special-restore wedge → `media-viewer.js:5075-5076` `dropEntry()` + `clearHistory()`
    - [x] `exitTournamentMode` invariant documented → `media-viewer.js:4560-4572` KNOWN HOLES block
    - [x] Empty-state keydown guard → `media-viewer.js:2169` `moveHistory.length > 0 || (isTournamentMode && peekUndoKind() != null)`
    - [x] CLAUDE.md L191 bullet — **qualified flip**: the bullet measured 964 chars at `937084c`
          and is 595 chars today (`3eff3eb`/`b352360` rewrote it); it is no longer the file's
          longest. The _successor_ condition is live and already tracked at BACKLOG line 530
          (path-scoped-rules migration): the longest bullet is now 1501 chars and the file is
          211 lines against a 205 soft cap. Flip with that measurement and the pointer — do not
          claim the split happened.

#### Phase 2: CLIP lease (commit 2)

- [ ] RED: unit tests that fail against current code
- [ ] GREEN: implement the five-site change
- [ ] `npm test`

#### Phase 3: ml-worker abort deletion + harness extension (commit 3)

- [ ] Whole-repo grep for `abortFlag` and for `'abort'` against `mlWorker`
- [ ] Delete `case 'abort'`, `abortFlag`, its four resets, the `scoreFiles` check
- [ ] Extend `tests/ml-worker.test.js`
- [ ] `npm test`

#### Phase 4: Docs + closeout (commit 4)

- [ ] BACKLOG `[2026-09-02]` items 1–3 checked off with rulings
- [ ] CLAUDE.md zero-CLIP gotcha updated
- [ ] Plan log completed; review; E2E on push

---

## 4. Implementation Log

### [2026-09-12] — PHASE: Planning

- Brainstormed as a **bounded** task; three user decisions taken: lease + clear, delete the abort
  protocol, record door (b) as accepted.
- Four premises re-measured against `68a7a91`; three had moved since the entries were filed.

---

## 5. Key Discoveries

<!-- Filled after completion -->

---

## 6. Future Improvements

### Enhancement ideas

| Idea                                        | Rationale                                                                                                                                              | Effort | Priority |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Generalize the lease to every CLIP consumer | Today only `handleSortByPrediction` takes one; a future CLIP-similarity-sort path would need its own                                                    | L      | M        |
| Make `scoreFiles` genuinely cancellable     | Deleting the dead abort leaves a real gap: a 24k-file scoring pass cannot be interrupted at all. A chunked/yielding loop would make an abort deliverable | M      | M        |

### Technical debt

| Item                                                                | Why it exists                                                                                                            | Impact | Remediation                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Extraction still writes 64-dim-only entries on a CLIP load failure | Accepted 2026-09-12: self-healing via the `!hasClip` filter, and G1's coverage gate blocks the training consequence         | L      | None planned; re-open only if the self-heal is shown to fail |

### Spawned tasks

| Task                      | Origin | Priority | Added to TODO.md |
| ------------------------- | ------ | -------- | ---------------- |
| _(filled at closeout)_    |        |          |                  |

---

## 7. Testing

### Test plan

- [ ] Unit: lease blocks the unload in both arming orders; release re-arms; `initClipModel()` clears
- [ ] Unit: `ml-worker.js` progress sites + every reply shape
- [ ] No new E2E (the lease is deterministic under fake timers)
- [ ] Full `npm test` + pre-push E2E

### Test results

<!-- Filled during implementation -->

---

## 8. Review

### Self-review checklist

- [ ] Code follows project conventions
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] No security concerns
- [ ] Performance considered

### Review status

- [ ] Self-review complete
- [ ] Peer review requested
- [ ] Review comments addressed
- [ ] Approved
