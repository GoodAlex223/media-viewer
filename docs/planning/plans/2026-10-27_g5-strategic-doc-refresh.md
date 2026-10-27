# G5 Strategic-Doc Refresh - Implementation Plan

**Task Reference**: [WEEKLY.md](../WEEKLY.md) G5 (Oct 19–23 week, spilled) ← BACKLOG 🟡 [2026-10-18] "Refresh MILESTONES.md / ROADMAP.md / GOALS.md: last week's theme shipped off the board, and their 2-month bar falls on 2026-10-27"; [v2 spec](../../superpowers/specs/2026-10-22-v2-modules-design.md) § 19 item 1 (the board change), item 2 (BACKLOG intake), item 5 (README setup steps)
**Created**: 2026-10-27
**Status**: In Progress
**Last Updated**: 2026-10-27

---

## 1. Task Overview

**Goal**: bring the three strategic docs (`GOALS.md`, `ROADMAP.md`, `MILESTONES.md`) and `PROJECT.md`'s strategic lines to the state of `main` at `e0b2a16`, put v2 on the board in place of the v2.0 release (spec D1), and file the v2 spec's § 19 BACKLOG entries.

**Context**: the three docs were last refreshed on 2026-08-27 (`a843d36`), and their 2-month bar falls today. Since then:
- the whole Oct 12–23 run shipped outside the board;
- Objective 1's last 🔴 Key Result shipped (PR #85, PR #87);
- ZoomManager shipped (PR #90);
- the v2 spec was approved and merged (PR #88).

The board still shows v2.0 at "2 of 6 managers" and a ~9,400-line renderer. Cleanup Week #5 (Oct 26–30) has not been planned yet, and its planning pass reads these docs, so they are refreshed first.

**Success Criteria**:
- [ ] v2 replaces the v2.0 release on the board, the milestones and GOALS Objective 2 (spec § 19 item 1, D1); v2.0 is recorded as absorbed, naming what it extracted.
- [ ] Objective 1 is recorded as achieved (ruling 2).
- [ ] The off-board Oct 12–23 work is a dated drained note (ruling 3).
- [ ] The mission and vision name the fetch → rate → keep loop (ruling 4).
- [ ] Every renderer line count in strategic text is a dated measurement, and no derived count (test totals, "N of 6 managers", Health-Summary tallies) is restated.
- [ ] Each `Last Updated` reads 2026-10-27.
- [ ] The § 19 entries are filed once each, with `[possible-dup-of: …]` tags where an entry exists. D23's control is filed as the ruling chose it (ruling 1).
- [ ] The docs-index guard passes, and every new relative link resolves.

---

## 2. Analysis

### Problem Restatement

The strategic docs describe an August plan. Their status lines are stale, their main release has been superseded by an approved spec, and their line target cannot be reached on its own terms. They need to say what is true at `e0b2a16` and what v2 commits to, without inventing commitments the spec does not make.

### The user's rulings (2026-10-27, after skipping the question round)

1. **D23's control: a blocking ratchet.** A pre-push check fails when `media-viewer.js` is over a ceiling kept in a committed file, and each v2 phase lowers the ceiling to its new count. Raising the ceiling is an explicit edit that shows in the diff. Only the branch tip counts, so a branch may grow partway through. G5 files it; building it is its own task.
2. **Objective 1: mark it achieved** (2026-10-25). Speed at 24k carries on as a v2 rule: spec § 3 anti-goal "A slower core at 24k" and the user's smokes after P1b, P4b, P5 and P6b (§ 15). The graph-build phase stays a 🔵 BACKLOG entry, not a Key Result.
3. **The off-board work: a drained note**, like the 2026-08-27 tournament-polish note. Its follow-ups stay in BACKLOG as weekly picks beside v2.
4. **The mission: widen it** to "collecting, reviewing, rating and keeping".

### Already settled by the approved spec (applied, not re-asked)

- v2 absorbs v2.0 (D1). SortingManager becomes the `similarity` module (P1b), MLManager's sort half becomes `ai-sort` (P4b), and ZoomManager and CompareManager become core splits (P7; ZoomManager shipped early, in PR #90).
- The add-on theme moves onto the board as v2's phases (§ 19 item 1).
- GOALS Objective 2 is re-baselined to § 11.1:
  - net `wc -l media-viewer.js` ≤ 0 in every phase's PR;
  - the renderer plus `core/*.js` stay below 11,945 lines (`308d43c`);
  - `media-viewer.js` drops below 6,000 lines by the end of P7.
- "Must new subsystems land in their own modules?" is answered by G-1: "new features land in modules by default". Ruling 1 is its control.
- Schedule (§ 14): P1a in the week of Nov 2–6 at the earliest; the end of Q1 2027 as a soft target, Q2 more likely.

### Fact table (measured 2026-10-27 at `e0b2a16` unless stated)

| Fact | Value | Source |
|---|---|---|
| `media-viewer.js` lines | 11,529 | `wc -l` of `git show e0b2a16:media-viewer.js` |
| at the last refresh | 9,418 | `a843d36` |
| at the v2 baseline | 11,945 | `308d43c` (2026-10-25) |
| Objective 1 PR2 KR | shipped: PR #85 (`f668611`) and PR #87 (`f5ddfa3`). The real-folder smoke passed 2026-10-25: the cold hash phase took 580 s in the background, against 1,262 s frozen | WEEKLY G2, DONE.md |
| ZoomManager | shipped: PR #90 (`082e3b2`), 2026-10-26 | WEEKLY G3 |
| FeatureCacheStore | shipped: PR #86 (`654fb3e`) | CLAUDE.md § Architecture |
| v2 spec | approved 2026-10-22; merged: PR #88 (`e1c4e03`), 2026-10-25 | spec header |
| Off-board, Oct 12–23 | PR #78 (`e5cd3a8`) security findings; PR #79 (`96467f7`) like-or-skip; PR #80 (`bf6fcad`) retrain fix; PR #81 (`51af1ab`) recent folders; PR #84 (`4548269`) page-load confinement; PR #86 (`654fb3e`) feature-cache wipe fix | `git log --merges` |
| Off-board, Sep 2 – Oct 9 | PR #69–#71, #73–#75: rating and tournament UX and ML integrity, which came in through BACKLOG as the 2026-08-27 drained note says | `git log --merges` |

### Approaches Considered

| Approach | Pros | Cons |
|---|---|---|
| A. Rewrite the three docs from a template | clean | loses the history notes the planning pass reads; a larger diff to review |
| B. Edit in place, keeping each doc's structure (selected) | small, reviewable diff; history notes kept | old sections need explicit "absorbed" / "achieved" records |
| C. A spec, then a plan | matches the 2026-07-12 refresh | the decisions are already in an approved spec plus four rulings; a second spec would restate them |

### Selected Approach

B. No separate spec: the v2 spec and the four rulings are the design, and this plan carries the facts.

### Calls made in this plan (Claude's, for the user to check)

1. **A near milestone, "v2 pilot: module host + `similarity` module (P1a + P1b)", target mid-December 2026 (soft).** P1a (~11 SP) and P1b (~10 SP) at the ~1.9× slip, with a Cleanup Week due ~3 weeks after #5, give roughly 4–6 weeks from Nov 2. A milestone needs a date, and the spec gives only the end-of-v2 one.
2. **Principle 4, "the core stays small"**, added to ROADMAP § Principles. It quotes G-1 and the user's April note.
3. **GOALS Constraints** gains a "Public repository" row (spec § 15: nothing from the user's folders enters git). GOALS Non-Goals gains two v2 non-goals: third-party modules or a module store, and embedded remote content.
4. **The vision follows the mission** (ruling 4 covers the mission line; ROADMAP's vision states the same thing).
5. **Health Summary loses its Count column** (the derived-count convention; the 🟤 [2026-09-02] sweep names Health-Summary tallies as a carrier). The v1.1 line "513 unit + 55 E2E" becomes a pointer to PROJECT.md.
6. **BACKLOG routing:**
   - 🔵 under the existing `[2026-10-22] From: v2 modules brainstorm` section: the Fetch module and the shell redesign (the user widened the brainstorm to both), plus an in-place update to the compression entry.
   - 🟤 under a new `[2026-10-27] From: G5 strategic-doc refresh` section: the line ratchet, face-detection removal, the real-data check, A1, Group copies, the utility process with fp32, SigLIP 2 (parked), and the README setup steps. The ratchet goes to 🟤 because its source is the spec's recommendation, which the user ruled on.
   - The shell redesign is filed apart from the [2026-05-25] overhaul pair, tagged `possible-dup-of` them, because its side panel, jobs tray, F1 tabs and Modules page have no entry today.
7. **The 🟤 [2026-09-02] derived-count sweep stays open.** It is annotated with the carriers G5 removed. `docs/planning/README.md`'s example list is corrected to match.

### Edge Cases

| Edge Case | Handling |
|---|---|
| A count derived from a list elsewhere (test totals, managers extracted, phase counts) | Name the items, or point to the list; never restate a tally (`docs/planning/README.md` § Document Conventions) |
| A line count that will go stale | Write it as a dated measurement with its SHA |
| A user folder name in new text (the public repo) | Describe by property ("the real-folder smoke"), never by name |
| A `\|` inside a code span in a table cell | Avoid it in tables (GFM splits the cell) |
| A BACKLOG entry that already exists | Tag `[possible-dup-of: …]` by title; never merge silently |
| A link from `docs/planning/` to specs | `../superpowers/specs/…`, checked to resolve |
| A frozen document (an archived plan or a merged spec) | Not edited |

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A board text that commits to something the spec does not | Med | Every v2 commitment cites its spec section |
| A stale status left in a second carrier (PROJECT.md, planning README, the BACKLOG sweep entry) | Med | Live-surface grep for `2 of 6`, `9,400`, `v2.0` and `6,000` before commit |
| The 1.9× slip makes the pilot date fiction | Low | Marked soft, and listed as a call |

---

## 3. Implementation Plan

### Files Affected

| File | Action | Purpose |
|---|---|---|
| `docs/planning/GOALS.md` | Modify | Mission; Objective 1 → Achieved; Objective 2 → v2 (KRs = spec G-1…G-8); Non-Goals; Constraints; `Last Updated` |
| `docs/planning/ROADMAP.md` | Modify | Vision; Current Phase; theme board (Now/Next/Later from § 14); drained notes; v2.0 → absorbed; v2 release table; v1.1 count; Principle 4; `Last Updated` |
| `docs/planning/MILESTONES.md` | Modify | The v2 pilot and v2-complete milestones; v2.0 retired; 24k scope note; timeline, table, Health Summary; `Last Updated` |
| `PROJECT.md` | Modify | L96 extracted-module list; L147 Known Limitations line count and v2 |
| `docs/planning/BACKLOG.md` | Modify | § 19 intake (2 🔵 + 1 update, 8 🟤); annotate the 🟤 [2026-09-02] sweep; `Last Updated` line. Added after the plan (§ 4): the compression entry's local path removed, and a ninth 🟤 entry, the profile-path and folder-name sweep |
| `docs/planning/README.md` | Modify | The convention's example list ("2 of 6 managers" removed 2026-10-27) |
| `docs/planning/WEEKLY.md` | Modify | Next Steps item 5: the v2 share decision (side-agent note) and the ratchet's gate (PR #91 review #2). Added after the plan; the rest of WEEKLY waits for the closeout |
| this plan | Create | — |

**Live-surface preflight:** grep of `README.md`, `PROJECT.md`, `CLAUDE.md`, `docs/README.md`, `docs/PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/planning/README.md` and the three docs for `2 of 6`, `v2.0`, `9,400`, `6,000` (2026-10-27):
- PROJECT.md L96 and L147, and planning README L64: in the table.
- `CLAUDE.md`'s "v2.0 pattern" lines name the manager *pattern*, which v2 keeps (spec § 11.1): unchanged.
- `docs/README.md` rows describe frozen specs and plans: unchanged.
- `docs/ARCHITECTURE.md`: no hit. Its rewrite is P1a's job (§ 14 "Every phase also" 5).

### Dependencies

- None. G1–G3 have merged (G5's own precondition).

### Model and Effort

| | Choice | Why |
|---|---|---|
| SP | 3 → ~4 | The § 19 intake (11 BACKLOG items) was added to G5's scope at the v2 closeout |
| Execution | Opus, this session | The edits are judgment-laden prose about commitments, not mechanical swaps; one session keeps the rulings in context |
| Switch | none | — |
| Final review | separate chat, `high` (WEEKLY G5) | Counts, dates, links and duplicate entries are the risk |

### Implementation Steps

1. [x] GOALS.md
2. [x] ROADMAP.md
3. [x] MILESTONES.md
4. [x] PROJECT.md lines 96 and 147
5. [x] BACKLOG.md intake + sweep annotation + `Last Updated`; planning README example list
6. [x] Verify: links resolve; `node scripts/check-docs-index.js`; live-surface grep returns only the expected hits; Prettier is not involved (it ignores `docs/` and `*.md`)
7. [ ] Commit on `g5-strategic-doc-refresh`; ask before push; PR; review in a separate chat (memory: ask before an in-chat review)
8. [ ] After merge: closeout on `main` (§ 9)

---

## 4. Implementation Log

### 2026-10-27 — PHASE: Planning

- Branch `g5-strategic-doc-refresh` from `main` `e0b2a16`.
- The user skipped the brainstorm's question round. Four decisions were brought in one batch; all four took the recommended option (§ 2).
- Facts measured first-hand (§ 2 fact table). Existing BACKLOG entries checked before intake: the LICENSE entry, the platform-integration and links entries, the compression entry, the overhaul pair, the near-duplicate entry and the face-detection entry all exist; the research's four steps, the ratchet and the README steps do not.

### 2026-10-27 — PHASE: Implementation

- Steps 1–6 done in one pass. No deviation from § 2.
- **Found while checking facts**:
  - `FeatureCacheStore` (PR #86) took about 311 lines out of the renderer (`git diff --stat 654fb3e^1 654fb3e`), so it is listed with v2.0's extractions.
  - `README.md`'s clone URL names `media_viewer` while the repo slug is `media-viewer`, and its Requirements still list macOS. Both went into the README entry, not fixed here (out of G5's files).
  - The 🔵 [2026-05-30] compression entry carries a local path with the Windows user name. It is pre-existing and was left as it is; it is raised with the user at hand-off.
- **Dated "P0 done 2026-10-27"** (ROADMAP's v2 table, MILESTONES' v2-complete status) assumes the merge lands today. The closeout re-dates both if it does not.
- **Side-agent note after commit `a92204b`, checked against spec § 14 and accepted**: v2's end-of-Q1 date (and the pilot's mid-December one, call 1) assumes v2 takes the whole 🔵 share of a normal week, ~17 SP. Spec § 14 says so: "At ~17 user-flagged SP per normal week, that is about 8 normal weeks". Ruling 3 keeps the sorting follow-ups as 🔵 picks beside v2, so each pick moves the date. The docs had named only "v2 competes for weekly capacity". Now ROADMAP's v2 Target, GOALS Objective 2's Timeline and both MILESTONES risk lists state the assumption. **The share itself is the user's decision, not taken here**: it is carried in WEEKLY.md Next Steps item 5, for the Cleanup Week #5 planning or the Nov 2–6 planning at the latest. WEEKLY.md joins § 3's files for that one line.
- **After PR #91 opened (2026-10-27)**:
  - The user approved removing the compression entry's local path (`2753fd4`).
  - A whole-repo search then found the same class elsewhere: profile paths in 2 live BACKLOG entries and 6 frozen docs, and real folder names in 4 live planning docs and 11 frozen docs. The tests' profile paths are made-up names.
  - Claude offered an entry and the user approved filing it ("yes, file"). It went in as the ninth 🟤 [2026-10-27] entry, routed 🟤 because Claude surfaced it (the precedent for Claude-found, user-approved entries). It covers the live edits, a pre-commit check keyed on `os.userInfo().username`, and leaves the frozen docs and history to the user. It names no path or folder.
- **Verified**: 45 relative links in the changed docs resolve (a scratchpad script), plus the new BACKLOG links; `node scripts/check-docs-index.js` exits 0. The live-surface grep for `2 of 6`, `9,400` and the old v2.0 status leaves only the retired-milestone records and the planning README's dated note.

### 2026-10-27 — PHASE: Review round 1 (PR #91, at `95cf322`)

Seven findings, all checked first-hand against `95cf322` and accepted. One of them (#1) was accepted with a different fix:
1. **The ratchet does not cover merges** (PRs merge on GitHub; no hook runs there). Accepted. The suggested fix, "the lower of the tip's and `origin/main`'s ceiling against the tip's count", would refuse a stale branch that never touched the renderer, since its tip still carries the old, larger file. The entry now measures the merge instead: `origin/main`'s count plus the branch's net change since the merge base, against the lower ceiling.
2. **WEEKLY Next Steps lacked the ratchet's gate.** Added under item 5.
3. **No closeout row for the P0 re-date.** Added to § 9.
4. **The 🟤 Origin did not describe the ninth entry.** Added.
5. **"Entries 3–7" was a position range.** The entries are now named.
6. **"Counts in PROJECT.md" pointed at a file with no counts.** Fixed in all four carriers: ROADMAP (new in this PR), MILESTONES and GOALS (older, but in docs this PR refreshes; the review held the GOALS one back), and the sweep annotation.
7. **ROADMAP's Current Phase Timeline lacked the capacity assumption.** A pointer was added.

The review's held-back question, whether the ninth entry is 🔵 or 🟤, stays 🟤 by the precedent, and is raised with the user. The review hit its 10-candidate cap.

### 2026-10-27 — PHASE: Review round 2 (PR #91, at `2327230`)

- **Finding 1 accepted, with the reviewer's fix (walked through each case first-hand).** "The lower of the two ceilings" made the ruled raise impossible without `SKIP`. The ratchet entry now takes the ceiling the merge would carry: the branch's value if the branch changed the ceiling file, else `origin/main`'s, and it refuses when both sides changed it. Its tests gain the planted cases that tell the rules apart.
- **Held-back items**:
  - The over-count when both sides made the same change is now written in the entry as a known limit.
  - The two-branches case was already covered by the closeout push.
  - The files table's BACKLOG row now lists the later additions.
- **The user's rulings, 2026-10-27**: the ninth entry stays 🟤.
  - On the cap, the user told this session "already ran with --max-findings all".
  - But the round-2 comment says no capped pass ran, and the reviewer session's last message records "round 1 won't be re-run with a higher limit".
  - The discrepancy is raised with the user; it is not resolved here.

---

## 6. Future Improvements

### Enhancement Ideas

| Idea | Rationale | Effort | Priority |
|---|---|---|---|
| A staleness check for the three docs' `Last Updated` in a planning script | The 2-month bar is checked by hand at each planning pass. It fired late twice (July and now), both times while a slip moved the planning pass | L | L |
| Let each v2 phase's closeout flip its own row on the ROADMAP v2 table and the GOALS KR | The board drifted because shipped work never touched it. A closeout step keyed on the phase ID keeps it current without a refresh | L | M |

_(Filed to BACKLOG at closeout: Extract reads this table.)_

### Spawned Tasks

| Task | Origin | Priority | Added to TODO.md |
|---|---|---|---|
| Build the blocking renderer line ratchet | Ruling 1 | M | No: BACKLOG 🟤 (step 5) |

---

## 7. Testing

### Test Plan

- [ ] Every relative link added resolves (a script over the changed files)
- [ ] `node scripts/check-docs-index.js` passes
- [ ] The live-surface grep shows no stale `2 of 6` / `~9,400` / "v2.0 … In Progress" left in a live doc
- [ ] The pre-commit hook passes (the unit suite runs on every commit)

---

## 9. Closeout Artifacts

| Artifact | Done / N/A + reason |
|---|---|
| `BACKLOG.md`: improvements extracted (min 2, routed by source) | |
| `TODO.md`: actionable items, plus § Spawned Tasks rows for out-of-tree work | |
| `docs/archive/plans/`: plan moved here, original deleted | |
| `DONE.md`: entry with plan link, summary, key changes | |
| `WEEKLY.md`: Summary-Table Status an identifier, never a bare ✅; Daily-Schedule entry marked done; Next Steps item 2 | |
| `BACKLOG.md` / `TODO.md`: every entry this task closed checked off, in the closeout commit (🟡 [2026-10-18]) | |
| Deploy record | N/A: no deploy (Electron app, no Deploy Window) |
| ROADMAP v2 table P0 row and MILESTONES v2-complete status: "P0 done 2026-10-27" re-dated to the merge date if the merge lands after 2026-10-27 (PR #91 review #3) | |
| Live docs: every late finding corrected where a live doc asserts it | |
| `docs/README.md`: plan indexed | |
| Memory: durable decisions and patterns captured | |
