# G2: the blocking renderer line ratchet, and the tournament flake that blocks pushes

**Status**: Approved by the user, 2026-10-30 ("looks right"). Agreed in chat section by section. A builder check raised one question, which I settled (§ 9, call 11) and folded into § 4 and § 7 before approval.
**Branch**: `g2-pre-push-gate`, cut from `main` at `4054d11`.
**Scheduled**: [WEEKLY.md](../../planning/WEEKLY.md) G2 (Oct 26–30, Cleanup Week #5): "the gate P1a waits on".
**Origin**: BACKLOG 🟤 [2026-10-27] "Build the blocking renderer line ratchet: a pre-push check that fails when `media-viewer.js` is over a committed ceiling" (the user's ruling on [v2 spec](2026-10-22-v2-modules-design.md) D23, with PR #91's review on merges); TODO 🟠 "Fix the flaky tournament E2E 'Ctrl+A undo restores the previous pair after a pick'" (← BACKLOG 🟤 [2026-10-11]); WEEKLY G2's ↳ note of 2026-10-30 on G1's hook test.

---

## 1. Intent

v2 has an anti-goal, "the renderer growing during v2" (v2 spec § 3), and a rule for every phase: net `wc -l media-viewer.js` ≤ 0 (§ 11.1). On 2026-10-27 the user ruled that the rule gets a control that blocks, not a warning. The week before showed why: in a week planned to stop the renderer's growth, it went 11,451 → 11,945 → 11,529 lines.

This change adds that control: a pre-push check that refuses a push when the renderer the push would bring to `main` is longer than a committed ceiling. It must be in place before v2 P1a's PR merges, so that P1a is its first measured phase.

The same group fixes the E2E test that has failed the pre-push run twice for a reason unrelated to the code pushed (§ 7). A gate that fails at random teaches its user to re-run it until it passes, and this change adds a second gate to the same push.

**Success** is all of:
- a push whose merge into `origin/main` would carry a renderer over the ceiling is refused, in seconds, before the E2E decision;
- each planted case in § 6.2 fails against the wrong rule it exists to catch, and passes against the built check;
- a push to `main` is refused while the ceiling is above the count;
- the E2E gate still receives git's ref lines after the ratchet has run, proved by the hook test (§ 6.3);
- the flake is reproduced on demand before its fix, and the fixed tests pass on repeat;
- the unit and E2E suites pass.

## 2. Decisions

The user's rulings:

| #  | Question | Ruling |
| -- | -------- | ------ |
| D1 | Warning or control? (2026-10-27, G5, on v2 spec D23) | A blocking pre-push check. The ceiling lives in a committed file. The check measures the pushed tip, so a branch may grow partway through and only its tip counts. Each v2 phase's PR lowers the ceiling to its new count. Raising it is an explicit edit of that file, visible in the diff. |
| D2 | How is the merge measured? (2026-10-30, this chat) | With git's own merge. `git merge-tree --write-tree` merges the pushed tip into `origin/main` in memory, and the check counts the merged renderer and reads the merged ceiling. This replaces the BACKLOG entry's arithmetic (`origin/main`'s count plus the branch's net change since the merge base; the ceiling from whichever side changed it). |
| D3 | Is the lowering enforced? (2026-10-30) | Yes, at `main`: a push to `main` is refused while the ceiling is above the count. A push to any other branch passes, with a reminder line. |
| D4 | The rest of the chat playback (2026-10-30) | Agreed ("looks right"): the check runs before the E2E decision; the hook reads git's ref lines once and gives each check its own copy; a failed fetch or merge refuses; deletes and tags are not checked; the flaky test drops `tiny.mp4`. |

What D2 changes from the BACKLOG entry:
- **Every input comes from the merge.** PR #91's review went wrong twice on a rule that took the count from one place and the ceiling from another. The merged tree holds both.
- **The entry's first known limit goes.** A renderer change made on both sides is counted once, as git applies it, not twice.
- **Conflicts refuse.** If the renderer or the ceiling file would conflict, the check refuses with "merge `origin/main` first". GitHub would refuse that merge too.
- **One deliberate difference from the entry's wording.** Both sides setting the ceiling to the *same* value merges cleanly, so it is not refused.
- **The entry's second known limit stays.** Two branches that each pass alone can go over together, since the GitHub merge runs no check. The next push to `main`, normally the closeout push, measures the merged `main` and refuses.

My calls are listed in § 9, for the user to check while reading.

## 3. Goals, non-goals, anti-goals

**Goals**: § 1's success list.

**Non-goals**:
- A server-side check. There is no CI (GOALS § Constraints, "No CI service"), and the GitHub merge runs no hook. The push to `main` is the backstop (D3).
- A ceiling for any other file, such as GOALS G-7's "the renderer plus `core/*.js`" target. The ruling names `media-viewer.js`.
- Changing the E2E gate's own rules. BACKLOG 🟤 [2026-10-30] "Name the path that forced RUN in the pre-push gate's stderr note" stays separate.
- Editing the ceiling automatically. The check never writes the file; it says what to write.

**Anti-goals** (it would be a failure even if it technically works):
- **The ratchet turns the E2E run off.** Git gives the hook its ref lines on stdin once. A ratchet that reads them first leaves the E2E gate an empty stdin, and the gate prints `SKIP` for an empty stdin (`scripts/check-e2e-needed.js:128-130`). Every push would skip E2E silently (§ 5.1).
- **It passes when it could not measure.** Every failure to fetch, merge, read or parse refuses the push.
- **A refused push costs minutes.** It runs before the E2E decision and takes seconds.
- **A test runs a real fetch from GitHub, or the real E2E suite.** The unit suite runs inside the pre-commit hook.
- **The ruled raise needs `SKIP`.** An edit of the ceiling file is enough, on a branch and on `main`.

## 4. Constraints

- **Git 2.38.0.windows.1** on this machine, the first release with `merge-tree --write-tree`. Probed in a scratch repo on 2026-10-30 with `git merge-tree --write-tree --name-only --no-messages <a> <b>`:
  - a clean merge exits 0, and the first stdout line is the merged tree's OID;
  - a conflict exits 1 and prints the tree OID, then the conflicted paths. The tree still holds each conflicted file, with conflict markers in it, so a conflicted renderer must never be counted;
  - an unresolvable ref ("not something we can merge") **also exits 1**, with no tree on stdout. The exit code alone cannot tell an error from a conflict, so the check resolves both commits first and requires a tree OID on the first line;
  - a fast-forward (a tip that descends from `origin/main`, as a push to `main` does) exits 0 with the tip's own tree.
- **Not yet measured**: `git fetch` run inside a push that is in progress (the push later updates `refs/remotes/origin/<branch>`). `origin` is `https://github.com/GoodAlex223/media-viewer.git`, a public repo, so the fetch needs no credentials. The plan measures the fetch on the branch's first real push before relying on it. If that push shows a structural failure, the plan stops and asks the user rather than choosing a fallback.
- Husky runs `.husky/pre-push` as `sh -e` (`.husky/_/h:17`), under Git Bash on Windows, with `node_modules/.bin` first on `PATH`. The remote's name and URL arrive as `$1` and `$2`, and the ref lines (`<local ref> <local sha> <remote ref> <remote sha>`) on stdin. The hook must be correct under `-e`. Today's hook test runs plain `sh`; it runs `sh -e` from now on.
- The `scripts/` pattern: CommonJS, pure exported functions plus a CLI under `require.main === module`.
- Tests that build temp repos scrub the git environment a hook exports (`GIT_DIR`, `GIT_INDEX_FILE`), as `tests/check-e2e-needed.test.js`'s `gitEnv()` does. Their `origin` is a local bare repo.
- The count is `wc -l`'s, as v2 § 11.1 states it: the number of `\n` bytes, so a last line with no newline is not counted. It is taken from committed blobs, never the working tree (`.gitattributes` enforces LF).
- `CLAUDE.md` is 67,227 bytes against `BYTE_TRIGGER` 69,000 (measured 2026-10-30, after G1), and G5 re-sets the trigger after this group. Keep its edit short.

## 5. The check

### 5.1 The hook

Today `.husky/pre-push` sources `skip.sh`, checks the `e2e` token, and runs the gate, which reads stdin itself.

The new order:
1. `check_skip_tokens "ratchet e2e"`.
2. Read git's ref lines once.
3. Unless `SKIP=ratchet`: give the ratchet its own copy. A non-zero exit stops the push, after the ratchet's message. An exit of 127 means the command is missing ("run npm install"), as `check_failed` already handles. `check_failed`'s hint says `git commit` (`.husky/skip.sh:35`); in pre-push it must say `git push`.
4. Give the E2E gate its own copy. Its rule is unchanged: run E2E unless the gate printed exactly `SKIP`.

### 5.2 What it measures

1. Parse the ref lines. Select each update whose remote ref is under `refs/heads/` and whose local sha is not all zeros. Deletes and tags pass unchecked. If nothing is selected, pass without fetching.
2. Fetch `main` from `origin` once, quietly. A failure refuses.
3. For each selected update, merge the tip into `origin/main` with no ref, index or working-tree change (`merge-tree` does write the merged objects to the object store; § 4's probe: resolve both commits first, and require a tree OID on the first line).
   - The renderer or the ceiling file among the conflicted paths → refuse with "merge `origin/main` first".
   - `media-viewer.js` missing from the merged tree → refuse. If v2 ever moves the renderer, that PR updates the check.
   - The ceiling file missing or unparseable in the merged tree → refuse.
   - Count the merged renderer's newlines.
4. Decide:

   | Merged count against ceiling | Push to `main` (remote ref `refs/heads/main`) | Push to any other branch |
   | ---------------------------- | --------------------------------------------- | ------------------------ |
   | count > ceiling | refuse | refuse |
   | count < ceiling | refuse: "lower the ceiling to <count>" | pass, with the reminder |
   | count = ceiling | pass | pass |

5. Any refusal fails the whole push, as git's pre-push contract does.

A closeout push (`git push origin main`, or `git push origin HEAD:main` from a worktree session) has remote ref `refs/heads/main`. Its tip descends from `origin/main`, so the merge is a fast-forward and the check measures the pushed `main` itself.

The check always measures against `origin`'s `main`, whatever remote `$1` names. The repo has only `origin`.

### 5.3 The ceiling file

`scripts/renderer-line-ceiling.txt`. Lines starting with `#` are comments, and blank lines are ignored. Exactly one other line, holding a positive integer in digits only. Anything else is unparseable and refuses.

Starting value: the count on `main` when G2's PR merges. That is 11,529 today (`git show HEAD:media-viewer.js | wc -l` at `4054d11`, 2026-10-30; unchanged since `e0b2a16`). If G3 merges first and changes the count, G2's own pushes measure the new count, and D3 makes the file match it exactly.

### 5.4 Messages

One line per checked update to stderr: the count, the ceiling and the verdict. A refusal names the ways out:
- shrink the renderer;
- raise the ceiling by editing the file (the ruled raise path, visible in the diff);
- `SKIP=ratchet git push` for one push.

The `main` refusal for a ceiling above the count names the exact number to write. The wording is the builder's.

## 6. Tests

### 6.1 Pure functions

- The count: an empty blob, a trailing newline, no trailing newline.
- The ceiling parse: comments, blank lines, garbage, two numbers, zero, a sign or a decimal point.
- The decision table in § 5.2, including the `main` column.
- Ref selection: a delete, a tag, `HEAD:main`, several refs in one push.

### 6.2 The planted cases

Real git, in temp repos with a local bare `origin`, run through the CLI. **Written first**, failing before the script exists. Each is **shown able to fail**: run against the wrong rule in its row (a mutant of the built check), with the result recorded in the plan.

Cases 2 and 3 need a stale branch whose base carries slack (a ceiling above the count), as `main` does between a GitHub merge and its closeout push. Without slack at the base, case 3's wrong rule and the built one agree. For example: the base holds 100 lines under a ceiling of 105, then `main` shrinks to 90 and lowers the ceiling to 90.

| # | Case | Expected | The wrong rule it catches |
| - | ---- | -------- | ------------------------- |
| 1 | A branch over the ceiling | refused | a check that never refuses |
| 2 | A stale branch that did not touch the renderer | passes | counting the tip's own renderer (100 against `main`'s 90) |
| 3 | A stale branch that grew the renderer by 3 | refused | reading the tip's own, stale ceiling (103 against 105 passes) |
| 4 | A branch that raises the ceiling and grows to it | passes | the lower of the two ceilings, or `origin/main`'s always |
| 5 | The ceiling changed on both sides to different values | refused, "merge `origin/main` first" | taking one side's ceiling without checking for a conflict |
| 6 | The ceiling above the count: pushed to `main`, then to a branch | `main` refused; the branch passes with the reminder | no check of the gap; or the gap refused everywhere |
| 7 | The renderer conflicts | refused, "merge `origin/main` first" | counting a conflicted blob (its markers change the count) |
| 8 | The same renderer change on both sides | counted once, passes at the ceiling | the entry's arithmetic, which counts it twice |
| 9 | `origin` unreachable; an unresolvable tip; the ceiling file missing from the merged tree | each refused | any fail-open |

The over-ceiling case alone fails under every candidate rule, so it cannot show which rule was built (BACKLOG entry, PR #91 review round 2).

### 6.3 The hook test

The ↳ note in WEEKLY G2 (2026-10-30, measured): `tests/check-e2e-needed.test.js`'s hook test puts a stub `node` first on `PATH`, and the stub answers *every* `node` call with the gate's canned token, reading stdin on its first call. A ratchet line placed before the gate made the gate's call print `STDIN-LOST`; the hook then ran E2E and the SKIP control failed. Today's hook passes.

- The stub answers `scripts/check-e2e-needed.js` as now, and `scripts/check-line-ratchet.js` with a canned exit code and a `STUB-RATCHET` stderr marker printed only when it received the ref lines. Any other call goes to the real `node` (for example `exec "$(PATH=${PATH#*:} command -v node)" "$@"`). The ratchet is stubbed, not run: in the real repo it would fetch from GitHub inside the unit suite.
- Keep the SKIP control's `STUB-GATE` marker and the `beforeAll` check that `sh` resolves both stubs first. Do not weaken the test.
- New rows:
  - the ratchet passes → both markers print, so the gate received the ref lines after the ratchet had them (the stdin proof);
  - the ratchet refuses → the hook exits non-zero, and neither the gate nor E2E runs;
  - `SKIP=ratchet` → no `STUB-RATCHET`, the skip warning prints, and the gate still receives the ref lines.
- Show the stdin row able to fail: against a hook that pipes git's stdin straight into the ratchet (the ↳ note's shape), the row fails.

## 7. The flaky tournament tests

**Mechanism** (BACKLOG 🟤 [2026-10-11], from both failing diffs): `tiny.mp4`, a 32-byte stub that never decodes, is dealt into the first pair. Its decode-failure skip (`_skipFailedTournamentFile`, a system `prune`) lands after the test captured "before", so the pair changes underneath the test.

**Two siblings with the same mechanism**, neither seen failing yet, both fixed here too:
- "mouse wheel does not navigate pairs in tournament mode" (`tests/e2e/tournament-mode.test.js:417`) captures the pair before a wheel and compares it after. A skip landing between the two fails it the same way.
- "leave-prompt Save persists state; re-enter Continue resumes" (`:350`) ends by reading the raw `engine.history.length` and expecting 0 (`:393-394`), not the prune-filtered count `waitForUserHistory` uses. Found by the builder check. If `tiny.mp4` is still in the saved state, it can be dealt after Continue. Its skip then pushes a tracked `prune` entry. The wait before the read (`!isLoading`) can pass before or after that entry lands. It needs two timing coincidences, so it is rarer than the Ctrl+A flake.

The other `tiny.mp4` tests in that block (`:397`, `:452`) wait on the user's undo history or the chrome's state, so by my reading they are unaffected. The builder confirms.

**Fix**: drop `tiny.mp4` from the three tests' fixtures. None of them is about a failed file. Undo past a skipped file has its own test, "G3 E7" (`:683`), which seeds the deal so it knows where `tiny.mp4` sits.

**A side effect, accepted**: with three files, the Ctrl+A test's first pick always ends round 1, so its undo is always the `snapshot` kind; today it is sometimes the `delta` kind (`tournament-engine.js:408-413`). E7 still covers a `delta` undo end to end.

**Acceptance**:
1. Phase 0, on the unfixed fixtures: hold the skip back until after "before" is captured (instrumentation inside the test, released by the test), and show the Ctrl+A test fails. Record it in the plan. The probe is not committed. The two siblings share the mechanism and get no reproduction of their own.
2. The fix.
3. The three tests pass on `--repeat-each` (the count is the plan's; the earlier runs used 6 and 8).

## 8. Docs

- `CLAUDE.md`: the pre-push description gains the ratchet, run before the E2E decision, and the per-check bypass list gains the pre-push token `ratchet`. Short (§ 4).
- `docs/planning/GOALS.md`: the § Constraints "No CI service" row's pre-push description, and G-7's status cell ("the ratchet is filed, not built").
- `docs/README.md`: this spec's row (the pre-commit docs-index check requires it).
- At the closeout: check off the BACKLOG ratchet entry (noting that D2 replaced its arithmetic), BACKLOG 🟤 [2026-10-11]'s flaky-test entry, the TODO 🟠 flaky-test item, and WEEKLY G2.

## 9. My calls

Made by me, not ruled by the user:
1. The ceiling file is `scripts/renderer-line-ceiling.txt`. Under `scripts/`, a push that changes only the ceiling skips E2E. `#` comment lines are allowed.
2. The script is `scripts/check-line-ratchet.js` (the name the ↳ note measured with), and the `SKIP` token is `ratchet`.
3. Only updates to remote refs under `refs/heads/` are checked. Deletes and tags are not.
4. The check measures against `origin`'s `main` whatever remote is pushed to.
5. A failure to fetch, merge, read or parse refuses. A push needs the network anyway.
6. A renderer missing from the merged tree refuses.
7. The hook test stubs the ratchet, so the unit suite never fetches.
8. The mouse-wheel test gets the same fix as the flaky test.
9. The fix drops `tiny.mp4` rather than waiting for its skip to settle.
10. Case 8 is added, to pin D2's gain over the arithmetic.
11. The leave-prompt test (`:350`) gets the same fix, without a reproduction of its own (the builder check's question).
12. The hook test runs the hook as `sh -e`, as Husky does.

## 10. Left to the builder

- How the hook keeps the ref lines and hands them to each check, as long as each check receives the same lines git sent.
- The function split, the messages' wording, the mutants' mechanics for § 6.2, the reproduction's instrumentation, and the repeat count.
- The E2E gate needs no change. After the ratchet's fetch it reads a fresher `origin/main`, which is harmless.

## 11. Size

Re-estimated at ~4–4.5 SP against WEEKLY's 4: the ratchet ~3–3.5 (the script, the temp-repo cases with their mutants, the hook and its test, the docs), and the flaky tests ~1. The execution model and the review depth follow WEEKLY G2's model line; the plan confirms or revises them.

## 12. Amendments after review round 1 (PR #94, 2026-10-30)

The review's findings were checked first-hand. What changed the design, and what stays as ruled:

- **D3 stands; its limit is recorded (finding 1).** A shrinking PR that leaves the ceiling above the count gets only the reminder on a branch, so the next PR can use up the slack with no ceiling edit. The user kept D3 (2026-10-30). The push to `main` still refuses while the ceiling is above the count.
- **A main that is itself over its ceiling (finding 2).** When a merge is over, the check reads `origin/main`'s own count and ceiling. A branch push that adds no lines to such a main passes with a note naming main's overage. A branch push that adds lines refuses, and says main is over too. Any push to `main` itself refuses while main is over (review round 2): the push to `main` is D3's backstop, and its pusher is the one landing on main, so refusing there blames nobody else.
- **A main with no ceiling file passes, saying so (finding 11).** A merge that lacks the file while main has it still refuses.
- **The fetch goes to `refs/ratchet/origin-main` (finding 3).** `--refmap=` and `--no-write-fetch-head` leave the user's `origin/main` (the lease of a later `--force-with-lease`) and `FETCH_HEAD` alone. This supersedes § 10's reading that a fresher `origin/main` is harmless.
- **Ref lines split from the right on ASCII spaces (finding 7).** A local ref can be an expression with spaces (`HEAD^{/fix the bug}`), and a ref name can hold a no-break space.
- **The ways out are per refusal (finding 8).** § 5.4's three bullets apply to an over-ceiling refusal only. A `main` refusal names `lower the ceiling to N` alone, a conflict says `merge origin/main first`, and the SKIP token is named once, by the hook.
- **`merge-tree` takes `--allow-unrelated-histories`, and its first stderr line is shown (finding 10).** The check needs git 2.38 or newer, and CLAUDE.md says so.
- **The renderer and the ceiling file must be regular files (finding 12).**
- **Not changed here:** finding 4 (a force push to `main` is measured on the merge, not on what lands) goes to BACKLOG, since it needs a forced push, against policy.
