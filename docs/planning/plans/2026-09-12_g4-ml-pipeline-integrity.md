# G4. ML Pipeline Integrity - Implementation Plan

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G4 (🟤, 5 SP, Mon–Tue); BACKLOG `### [2026-09-02] From: G5 closeout` items 1–3
**Created**: 2026-09-12
**Status**: Complete
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

- [x] A pending `clipUnloadTimer` cannot flip `clipWorkerReady` false during a prediction sort,
      in **both** arming orders (armed before the sort; armed by an extraction that finishes
      during the sort)
- [x] `ml-worker.js` carries no unreachable abort machinery, and no stale reference to it
      survives anywhere in the repo (code, tests, comments, docs)
- [x] `tests/ml-worker.test.js` pins all four `updateProgress` sites and every reply shape
      (`scoreComplete`, `sortComplete`, `modelState`, `resetComplete`, unknown-type error)
- [x] `npm test` green; pre-commit hook green
- [x] BACKLOG `[2026-09-02]` items 1–3 resolved with evidence; `[2026-07-21]` items flipped
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
- ~~`_handleClipUnloadTimer` re-arming under a held lease is correct~~ — **revised during
  implementation**: the re-arm is redundant and was dropped. `_releaseClipLease()` opens a fresh
  window when the last lease goes, so the model is reclaimed regardless; re-arming would only burn
  a timer every 30 s for the length of the operation, and it guards a leaked lease no better than
  dropping does (a leak keeps re-arming and returning forever either way).

### Edge cases

| Edge case                                                | Handling                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sort throws / is cancelled mid-flight                    | Release lives in the existing `finally`; the counter returns to 0 and `_scheduleClipUnload()` arms                   |
| Extraction completes _during_ a sort and arms a timer    | `_scheduleClipUnload()` refuses to arm while `clipLeases > 0`; the sort's release arms it instead                    |
| Timer already pending when a sort starts                 | `_acquireClipLease()` clears it, and so does `initClipModel()`                                                       |
| Lease held longer than one 30 s window                   | `_handleClipUnloadTimer` drops the timer; `_releaseClipLease()` opens a fresh window when the last lease goes, so the model is deferred, never leaked |
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

- [x] RED: unit tests that fail against current code
- [x] GREEN: implement the five-site change
- [x] `npm test`

#### Phase 3: ml-worker abort deletion + harness extension (commit 3)

- [x] Whole-repo grep for `abortFlag` and for `'abort'` against `mlWorker`
- [x] Delete `case 'abort'`, `abortFlag`, its four resets, the `scoreFiles` check
- [x] Extend `tests/ml-worker.test.js`
- [x] `npm test`

#### Phase 4: Docs + closeout (commit 4)

- [x] BACKLOG `[2026-09-02]` items 1–3 checked off with rulings
- [x] CLAUDE.md zero-CLIP gotcha updated
- [ ] Plan log completed; review; E2E on push

---

## 4. Implementation Log

### [2026-09-12] — PHASE: Review rounds 3 & final (PR #69)

- Verdict: **no issues found.** Every response bullet from rounds 1–2 was ruled on with evidence;
  the reviewer reproduced both probes independently (the ordering predicate and the `afterEach`
  registry, same 14/2 split) and re-ran the full E2E suite rather than trusting the pre-push gate.
- One item re-raised, non-blocking and correct: **the backlog cross-reference pointed one way
  only.** Item 3 (the acquire-contract residual) referenced item 1 twice, item 1 referenced item 3
  zero times — and because item 3 folds its effort into item 1, item 1 is the unit of work someone
  will actually pick up. Whoever pushes the lease down into `extractClipEmbedding` would have read
  an entry saying nothing about the contract a per-call lease has to preserve.
- **Fixed in the closeout as asked.** Item 1 now opens its remedy paragraph with the contract and
  points at item 3 by position. Verified bidirectional by line-scoped grep, not by reading.
- Worth recording: this is the **third** instance in one PR of *"the rationale exists, in a place
  nobody executing the work will read it"* — the acquire contract (round 1), the lease-pairing
  promise in the test mocks (round 2), and now the backlog entry. Same defect class, three
  surfaces, all mine.

### [2026-09-12] — PHASE: Review round 2 (PR #69)

- Verdict: **no blocking issues.** The round-1 pushback was accepted, and the reviewer verified the
  new ordering test independently (replicated the `methodSource` predicate against a mutated
  in-memory copy) rather than taking it.
- The second below-threshold candidate — which round 1 counted but did not state — was written out
  on request: the lease scaffolding in the `handleSortByPrediction lifecycle` `makeCtx` carried the
  rationale *"so the lifecycle tests can assert the release happens on every exit path"*, and no
  test in that block ever read `ctx.clipLeases`. Correct, and the same
  **a convention is not a control** shape as the contract fixed in round 1: a promise written in a
  comment that nothing executes.
- **Fixed, and more broadly than proposed.** Rather than adding `expect(ctx.clipLeases).toBe(0)` to
  the four bail-path tests, the block now drains a registry of every ctx `makeCtx()` hands out and
  asserts the invariant in one `afterEach` — so a future exit path is covered by whatever test
  exercises it, with no opt-in to forget.
- **The check needed checking.** The first version asserted before clearing the registry, so a
  throw left the leaked ctx in the array and failed every later test's `afterEach` — one leak
  reported as sixteen failures naming the wrong tests. Drained first, the probe (release deleted
  from the `finally`) fails exactly 14 of 16 and passes the two whose early return sits above the
  acquire, which independently confirms round 1's "every early return sits above the acquire."

### [2026-09-12] — PHASE: Review round 1 (PR #69)

- Verdict: **no issues found**; one below-threshold observation recorded as non-blocking. No
  blocking finding, so the branch did not change shape.
- The observation: `_handleClipUnloadTimer()` reads the lease only *before* its `await`, so a lease
  acquired during the `unloadClipModel()` round trip still gets `clipWorkerReady = false` written
  when the reply lands. Confirmed as a real state inconsistency and confirmed unreachable today —
  `handleSortByPrediction` is the only taker and is parked in `await initClipModel()` at that
  instant, the unload IPC is issued first, and its main-process handler is synchronous, so the stale
  write always lands before the init resolves and sets the flag back.
- **Pushed back on the implied remedy.** A post-await re-check that *suppresses* the write would be
  wrong: a `{success:true}` reply means main has already nulled `clipProcessor`/`clipVisionModel`, so
  `false` is the truthful mirror of real state, and `kickoffBackgroundExtractionIfEnabled`'s
  `if (!this.clipWorkerReady) await this.initClipModel()` — the PR #34 guard — is gated on exactly
  this flag, so suppressing it would make that site skip its load await.
- **Fixed differently**, at the acquire end: the contract *acquire does not ensure — a taker must
  `await initClipModel()` after acquiring* is now stated on `_acquireClipLease()`, the deliberate
  post-await write is explained at its site so the next reviewer does not re-file it, and the
  ordering is **pinned by a test** (mutation-verified: moving the acquire below the init await fails
  it). What the reviewer correctly called "a property of the single taker, not of the guard" is now
  a property enforced mechanically.
- Residual filed as a third 🟤 in `### [2026-09-12] From: G4 closeout`, cross-referenced from the
  existing "lease has exactly one taker" item, which must carry the contract when it lands.

### [2026-09-12] — PHASE: Complete

- Final approach: as designed. Four commits — `ddd8340` (housekeeping flip), `c7e93ff` (CLIP lease),
  `edcbf23` (abort deletion + harness extension), plus this closeout.
- Tests passing: yes. Unit 761 → **792** (+15 lease, +16 worker). Lint clean (one pre-existing
  `no-shadow` warning, confirmed present on `main`). Prettier clean. E2E runs on push.
- One design revision during implementation: `_handleClipUnloadTimer` drops the timer under a lease
  instead of re-arming it (see Assumptions).
- Documentation updated: CLAUDE.md (zero-CLIP gotcha now describes the lease; the worker-abort
  testing bullet scoped to `sorting-worker.js`), BACKLOG (5 flips + 3 rulings + 2 new 🟤),
  WEEKLY (housekeeping item corrected in place).
- Improvements documented: 2, both filed as 🟤 `### [2026-09-12] From: G4 closeout`.

### [2026-09-12] — PHASE: Planning

- Brainstormed as a **bounded** task; three user decisions taken: lease + clear, delete the abort
  protocol, record door (b) as accepted.
- Four premises re-measured against `68a7a91`; three had moved since the entries were filed.

---

## 5. Key Discoveries

**Technical insights**:

- **A guard that holds at one instant is not a guard across awaits.** G5's `await initClipModel()`
  was correct and still left the defect reachable, because the hazard is a timer, not a state. The
  filed remedy (clear the timer at the demand site) inherited the same shape. Only the lease —
  state that spans the operation — closes both arming orders.
- **`ml-worker.js`'s abort protocol could not fire from either end.** No sender existed, every work
  case reset the flag at its head, and `scoreFiles`' synchronous loop could not observe a mid-run
  change regardless. A task that says "pin the abort protocol" cannot be executed as written; the
  honest options were delete or wire, and wiring buys nothing without chunking the loop.
- **Three of the group's four premises had moved since it was scoped** (2026-09-03 → 2026-09-12,
  with PR #68 in between). The harness already existed; the Phase-1 `clipWorkerReady` skip was gone;
  door (b)'s training consequence was already closed by G1's coverage gate. Re-measuring cost about
  fifteen minutes and changed what two of the three tasks actually were.
- **A verification probe that matches nothing looks exactly like a passing test.** The first attempt
  to prove `initClipModel()`'s clear was load-bearing used a `str.replace` that silently matched
  nothing; the test passed and briefly read as "this guard is redundant." Re-run with an
  `assert old in s` sentinel, it failed as designed. Every later probe carried a sentinel.

**Architectural decisions**:

- **Counter, not boolean, for the lease** — so two overlapping CLIP consumers cannot have one's
  release disarm the other's protection. There is only one taker today; the counter costs nothing
  and removes a class of future bug.
- **`_scheduleClipUnload()` as the sole arming site** — the lease check lives in one place rather
  than being repeated at the extraction tail and the release path, where one of the two would
  eventually be missed.
- **Drop rather than re-arm under a held lease** — see the revised assumption above.
- **Delete the abort protocol rather than document it** — a comment saying "this cannot fire" next
  to code that looks like it can is an invitation to re-add the sender and believe it works.

**Anti-patterns avoided**:

- Shipping the filed fix because it was filed. The BACKLOG entry named a candidate fix; executing it
  verbatim would have left the surviving arming order open and closed the entry.
- Writing a second `methodSource` helper in the test file when a better one (with a brace-balance
  guard) already existed twenty screens up — caught by `no-shadow`, not by reading.

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

| Task                                                 | Origin  | Priority | Added to TODO.md                                    |
| ---------------------------------------------------- | ------- | -------- | --------------------------------------------------- |
| Push the CLIP lease down into `extractClipEmbedding` | Phase 2 | M        | [ ] No — BACKLOG 🟤 `### [2026-09-12] G4 closeout` |
| Chunk `scoreFiles` so scoring is really cancellable  | Phase 3 | M        | [ ] No — BACKLOG 🟤 `### [2026-09-12] G4 closeout` |

---

## 7. Testing

### Test plan

- [x] Unit: lease blocks the unload in both arming orders; release re-arms; `initClipModel()` clears
- [x] Unit: `ml-worker.js` progress sites + every reply shape
- [x] No new E2E (the lease is deterministic under fake timers)
- [ ] Full `npm test` + pre-push E2E

### Test results

| Test                                                     | Result | Notes                                                                                     |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `_scheduleClipUnload` refuses to arm under a lease       | Pass   | Fails with the `clipLeases` check alone removed (sentinel-verified probe)                  |
| `_handleClipUnloadTimer` refuses to unload under a lease | Pass   | Fails with that check alone removed                                                        |
| `initClipModel()` clears a pending unload                | Pass   | Fails with the clear block alone removed — the first probe matched nothing and proved nothing |
| Both end-to-end arming orders                            | Pass   | Armed-before and armed-during, over three grace windows of fake time                       |
| Production wiring (source assertions)                    | Pass   | Both call sites use the lease; the release is inside the `finally`                         |
| `ml-worker` progress sites / reply shapes                | Pass   | 8 → 24 cases                                                                              |
| `abort` now answers unknown-type                         | Pass   | Fails with the deleted `case 'abort'` restored                                             |
| Acquire precedes the awaited `initClipModel()`           | Pass   | Added in review round 1; fails when the acquire is moved below the await (sentinel probe)  |
| Lease nets to zero on every lifecycle exit path          | Pass   | Added in round 2 as an `afterEach` invariant; deleting the `finally` release fails 14 of 16, the 2 survivors being the early returns above the acquire |
| Full unit suite                                          | Pass   | 793 passed, 20 files                                                                       |

---

## 7b. Closeout artifacts

Derived from the global `CLAUDE.md` § Task Completion rule (Extract → Archive → Transition →
Commit → Capture learnings), **not** from this plan's own section list — per
[plans/README.md](README.md), a hand-written Outputs list gets executed instead of the rule it
implements, and its omissions read as completeness.

| Artifact | Done / N/A + reason |
| --- | --- |
| `BACKLOG.md` — improvements extracted (min 2, routed by source) | **Done** — 2 filed as 🟤 `### [2026-09-12] From: G4 closeout`; plus 5 flips (`[2026-07-21]`) and 3 rulings (`[2026-09-02]`) |
| `TODO.md` — actionable items / § Spawned Tasks rows | **N/A** — both improvements are speculative-until-triggered (one waits on the next CLIP consumer, one on large-folder sort work), so BACKLOG is the correct home; nothing out-of-tree was produced |
| `DONE.md` — entry with plan link, summary, key changes | **Pending merge** — written in the post-merge commit, with the merge identifier, so it is not falsified the way `[2026-08-31]` item 2 describes |
| `WEEKLY.md` — Summary-Table Status **and** the Daily-Schedule entry | **Partly done** — both G4 task checkboxes flipped, and the housekeeping item corrected in place; the Status/Daily identifiers wait for the merge SHA (never a bare ✅) |
| `docs/README.md` — plan under Archived Plans | **Pending archive** — this plan is still active; `scripts/check-docs-index.js` only guards `docs/archive/plans/` + `docs/superpowers/specs/`, so the index row lands with the move |
| `docs/superpowers/specs/` — spec under Design Specs | **N/A** — bounded task, no spec written (brainstorming classified it bounded; design presented in chat and recorded in § 2 here) |
| `docs/archive/plans/` — plan moved, original deleted | **Pending** — after review sign-off and merge |
| Cited commit SHAs verified as ancestors of `main` | **Pending merge** — `ddd8340` / `c7e93ff` / `edcbf23` are branch-local until then; the SHAs cited as *evidence* (`6305a7a`, `762714a`, `3eff3eb`, `b352360`, `19e6762`, `bfcc881`, `0d3fed5`) are all on `main` |
| Capture learnings → memory files | **Pending** — at session close |

---

## 8. Review

### Self-review checklist

- [x] Code follows project conventions
- [x] Tests written and passing
- [x] Documentation updated
- [x] No security concerns
- [x] Performance considered

### Review status

- [x] Self-review complete
- [x] Peer review requested — `/code-review` on PR #69, 2026-09-12
- [x] Review comments addressed — no blocking findings; the one non-blocking observation is
      answered in § 4 (remedy pushed back on, underlying fragility fixed differently, residual filed)
- [ ] Approved
