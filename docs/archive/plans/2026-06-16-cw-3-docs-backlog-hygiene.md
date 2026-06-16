# Group CW-3: Docs & Backlog Hygiene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the planning data trustworthy — flip provably-resolved BACKLOG checkboxes (git-verified), clear accumulated doc drift, and remove repo-root cruft — on one docs-only branch.

**Architecture:** This is a **docs-and-config-only** change (no `*.js`/`index.html`/`styles.css`). There is no TDD loop; the rigor is **git verification** baked into this plan during planning. Every flip below cites a commit already confirmed an ancestor of `main`. The plan-writer pre-ran the archaeology, so execution is mechanical application + a confirming re-check.

**Tech Stack:** Markdown docs, `.gitignore`, git, PowerShell (for the Windows reserved-name `nul` deletion).

**Branch:** `cleanup/cw-3-docs-backlog-hygiene` (already created off `main` @ `52f2cbc`).
**Spec:** `docs/superpowers/specs/2026-06-16-cw-3-docs-backlog-hygiene-design.md`.
**Status: Complete** — executed inline 2026-06-16. Deviation: the `.gitignore` `nul` line was kept (verified load-bearing on Windows), not removed. See DONE.md 2026-06-16.

---

## Verified candidate table (Task 1) — every commit confirmed ON-MAIN

| BACKLOG line | Entry (short) | Current | Action | Verified commit |
|---|---|---|---|---|
| L356 (🟤 PR#36) | abort-string `'Sort aborted'`→`'Sorting cancelled by user'` | `[x]` (flipped 2026-06-16) | **marker fix only** — cite real SHA | `52f2cbc` (NOT `853e1ee`, which is on dead branch `fix/pr-36-review-followups`) |
| L357 (🟤 PR#36) | spec stale 193/193 → Status: Complete + 195/195 | `[x]` (flipped 2026-06-16) | **verify-only** — confirmed correct on main | doc on `main` already `Status: Complete` + `195/195` |
| L124 (🔵 2026-05-03) | "extraction starting" toast | `[ ]` | **flip** | PR #45 `ad4e488` |
| L125 (🔵 2026-05-03) | toggle-on kickoff | `[ ]` | **flip** | PR #45 `ad4e488` |
| L178 (🟡 2026-03-23) | Pin Lucide CDN to a version | `[ ]` | **flip** | `2a5597a` (≠ L169 "migrate to bundled npm" — stays OPEN) |
| L479 (🟤 2026-04-08) | CLIP-based similarity sorting | `[ ]` | **flip** | `e0d07dc` (+ test export `91f87e6`), Group D |
| L480 (🟤 2026-04-08) | Unload CLIP model after extraction | `[ ]` | **flip** | `e7d84d0`, Group E (PR #31) |
| L528 (🟤 2026-03-26) | Double-init protection for logger.js | `[ ]` | **flip** | `b9f3b7e`, Group E |
| L612 (🟤 2026-03-21) | Update regression-checker.md for FullscreenManager | `[ ]` | **flip** | `1efbdc1`, Group F |

**Light-scan result (recorded):** a `grep -nE '^- \[ \].*(shipped|resolved|✅|merged in|implemented [0-9])'` over BACKLOG.md returned only entries that reference *prior* shipments as context for still-open follow-on work (L60, L240, L282, L350, etc.) — **no resolved-but-unchecked items beyond the table above.** Task 1 is fully bounded.

**Line numbers will shift as edits are applied.** Anchor each edit on the entry's **bold title text**, not the line number (the table's line numbers are as-of planning).

---

## Task 1: BACKLOG stale-checkbox sweep

**Files:**
- Modify: `docs/planning/BACKLOG.md`
- Modify: `docs/planning/WEEKLY.md` (🟤 recount in Notes)

- [x] **Step 1.1: Flip the 7 genuinely-unchecked entries**

For each row in the table marked **flip**, change its `- [ ]` to `- [x]` and prepend a resolution marker immediately after the `**Title**` —, preserving all original text. Use this exact marker shape (matches the existing resolved-entry style, e.g. L356/L367):

- L124 "Add UX-visible 'extraction starting' notification":
  `- [x] **Add UX-visible "extraction starting" notification** — ✅ Resolved 2026-06-10 (Group C, PR #45 \`ad4e488\`). <original text…>`
- L125 "Toggle-on kickoff for CLIP":
  `- [x] **Toggle-on kickoff for CLIP** (deferred from Group A spec) — ✅ Resolved 2026-06-10 (Group C, PR #45 \`ad4e488\`). <original text…>`
- L178 "Pin Lucide CDN to a specific version":
  `- [x] **Pin Lucide CDN to a specific version** — ✅ Resolved 2026-04-29 (Group F, \`2a5597a\` — pinned \`@1.14.0\` + SRI). <original text…>` *(do NOT touch L169 "Migrate Lucide … bundled npm" — bundling ≠ pinning, stays open)*
- L479 "CLIP-based similarity sorting":
  `- [x] **CLIP-based similarity sorting** — ✅ Resolved 2026-04-18 (Group D, \`e0d07dc\`). <original text…>`
- L480 "Unload CLIP model after extraction completes":
  `- [x] **Unload CLIP model after extraction completes** — ✅ Resolved 2026-04-21 (Group E, PR #31 \`e7d84d0\`). <original text…>`
- L528 "Double-init protection for logger.js":
  `- [x] **Double-init protection for logger.js** — ✅ Resolved 2026-04-21 (Group E, \`b9f3b7e\`). <original text…>`
- L612 "Update regression-checker.md for FullscreenManager":
  `- [x] **Update \`regression-checker.md\` for FullscreenManager** — ✅ Resolved 2026-04-29 (Group F, \`1efbdc1\`). <original text…>`

- [x] **Step 1.2: Fix the L356 marker SHA and confirm L357**

The L356 abort-string entry currently reads `- [x] ✅ 2026-06-16 (landed fresh on \`main\`; stale PR #37 closed) — **Abort error string inconsistency…**`. Append the real commit so the citation is git-true: change `(landed fresh on \`main\`; stale PR #37 closed)` → `(landed fresh on \`main\` in \`52f2cbc\`; stale PR #37 / \`853e1ee\` closed unmerged)`.
L357 (spec-count) is already correctly `[x]` and the doc on `main` is genuinely fixed — **leave it**, no change.

- [x] **Step 1.3: Correct the sweep's own driving intake note (L238 + L240)**

The `### [2026-06-11] Weekly-planning intake` note cites the wrong SHA. In both the **Origin** paragraph (L238) and the entry body (L240), replace `fixed in \`853e1ee\` per \`git show\`` / `PR #36 abort-string + spec-count items (\`853e1ee\`)` with `fixed on \`main\` in \`52f2cbc\` (the \`853e1ee\` commit cited here lives only on the unmerged \`fix/pr-36-review-followups\` branch — the PR #37 stale-SHA trap)`. Do **not** check off L240 yet — it is the CW-3 task itself, checked at closeout (Task 4).

- [x] **Step 1.4: Verify the flips against git (confirming re-check)**

Run:
```bash
for c in ad4e488 2a5597a e0d07dc e7d84d0 b9f3b7e 1efbdc1 52f2cbc; do \
  git merge-base --is-ancestor $c main && echo "$c ON-MAIN" || echo "$c NOT-ON-MAIN"; done
```
Expected: all 7 print `ON-MAIN`. (If any prints `NOT-ON-MAIN`, STOP — do not flip that entry; re-investigate.)

- [x] **Step 1.5: Recount 🟤 pending SP and record in WEEKLY.md**

Count remaining unchecked 🟤 items and sum their effort tags (XS≈0.25, S≈1, M≈2, L≈3 as a rough SP proxy — use the same scale the WEEKLY plan uses, or simply report the **count** of unchecked 🟤 entries if no clean SP sum exists). Run to get the unchecked-🟤 count:
```bash
awk '/^## 🟤 Auto-Generated/{f=1} /^## Rejected Ideas/{f=0} f && /^- \[ \]/{n++} END{print n" unchecked 🟤 items"}' docs/planning/BACKLOG.md
```
Then update `docs/planning/WEEKLY.md` Notes — the bullet beginning "**🟤 tail remains after this week**" — appending: `Post-CW-3 recount (2026-06-16): <N> unchecked 🟤 items remain after the sweep flipped 4 🟤 entries (CLIP sort, CLIP unload, logger double-init, regression-checker).` Also bump the BACKLOG.md `**Last Updated**` header line to note the CW-3 sweep.

- [x] **Step 1.6: Commit**

```bash
git add docs/planning/BACKLOG.md docs/planning/WEEKLY.md
git commit -m "docs(cw-3): stale-checkbox sweep — flip 7 git-verified resolved entries

Flip CLIP-extraction-UX toast + toggle-on (PR #45 ad4e488), Pin Lucide CDN
(Group F 2a5597a), CLIP similarity sorting (Group D e0d07dc), CLIP unload
(Group E e7d84d0), logger double-init (b9f3b7e), regression-checker
FullscreenManager (Group F 1efbdc1). Fix L356 abort-string marker to cite the
real on-main SHA 52f2cbc (853e1ee lives only on the dead PR #37 branch) and
correct the same mis-citation in the [2026-06-11] driving intake note. Recount
unchecked 🟤 items into WEEKLY.md Notes."
```

---

## Task 2: Doc one-liners bundle

**Files:**
- Modify: `CLAUDE.md`, `docs/planning/BACKLOG.md`, `docs/README.md`, and one spec under `docs/superpowers/specs/`.

- [x] **Step 2.1: Record the already-done no-ops (no edit)**

Confirmed during planning — make **no change** to these; they are already correct:
- CLAUDE.md `## Backlog Intake Rules` already wrapped `<!-- MANUAL -->` (L172) … `<!-- END MANUAL -->` (L200).
- CLAUDE.md test inventory (L80) already includes `backlog-structure`.
- CLAUDE.md L314 already states the unified `.sort_cache.json` key `'clip'` correctly (negates the wrong filename).
- docs/README.md already indexes CLIP-silent-failure, TASK-024, TASK-026 specs (Design Specs section).

- [x] **Step 2.2: Tournament hash swap in CLAUDE.md (UI-integration occurrences only)**

Verified: `acfc3b6` = UI integration (`#modeSelector`, Phases F-G); `6c73f9f` = IPC + TournamentManager (Phases D-E). Run `grep -n "6c73f9f" CLAUDE.md` and for each hit:
- If the surrounding text describes **UI integration / `#modeSelector` / "UI Integration"** → change `6c73f9f` → `acfc3b6`. Known sites: the Git Insights entry "Tournament Mode UI Integration (2026-05-25, commit `6c73f9f`)" and the gotcha at L335 "the tournament UI integration (6c73f9f)".
- If the text describes **IPC / TournamentManager / Phases D-E** → leave `6c73f9f` unchanged.

- [x] **Step 2.3: Kickoff test-count drift in CLAUDE.md (L137)**

First confirm the live case count:
```bash
grep -c "(7) cold-start CLIP\|(8) cache-reject\|(9) \|(10) " tests/media-viewer-utils.test.js  # smell check
node -e "const s=require('fs').readFileSync('tests/media-viewer-utils.test.js','utf8');const m=s.match(/describe\('kickoffBackgroundExtractionIfEnabled'[\s\S]*?\n\}\);/);console.log((m?m[0].match(/\bit\(|\btest\(/g)||[]:[]).length,'it/test blocks')"
```
Then update CLAUDE.md L137: change `(8 cases, ...)` to the verified count (expected **10** per BACKLOG L261), and append to that bullet the new context: the `makeCtx` defaults already listed are fine, but add mention of the **empty-folder guard** (`if (this.mediaFiles.length === 0) return;`) and the two new cases (9: empty-folder no-op; 10: toggle-on kickoff path) **using the actual case descriptions read from the test file** — do not invent them. If the live count is NOT 10, write whatever the file actually has.

- [x] **Step 2.4: docs/README.md orphan link-refs**

Both link-refs are defined but unused (confirmed). Add the missing table rows so the refs resolve:
- **Archived Plans** table — add a row for the Tournament Mode plan (link-ref `[Tournament Mode Plan]` is defined at L78 with no row):
  `| [Tournament Mode Plan][]                     | Swiss-style tournament engine + TournamentManager + 3-way mode selector (Groups E + F) |`
- **Design Specs** table — add a row for TASK-028 (link-ref `[TASK-028 CLIP Semantic Features]` is defined at L132 with no row):
  `| [TASK-028 CLIP Semantic Features][] | CLIP semantic embedding extraction via main-process IPC; 64→576-dim ML model |`
Place each new row in date order within its table. Verify no remaining orphan refs:
```bash
node -e "const s=require('fs').readFileSync('docs/README.md','utf8');const defs=[...s.matchAll(/^\[([^\]]+)\]:/gm)].map(m=>m[1]);const used=new Set([...s.matchAll(/\[([^\]]+)\]\[\]/g)].map(m=>m[1]));console.log('orphans:',defs.filter(d=>!used.has(d)))"
```
Expected after edit: `orphans: []` (or only intentional non-table refs).

- [x] **Step 2.5: BACKLOG `waitForTimeout` dup tag (L432)**

Add the retroactive tag to the kept entry. On the L432 entry "Replace E2E `waitForTimeout` magic numbers…", append at the end of its body: ` [possible-dup-of: Standardize E2E waitForTimeout durations]`.

- [x] **Step 2.6: Spec-file `.sort_cache_clip.json` correction**

Find any spec still using the wrong filename and fix it (CLAUDE.md is already correct, Step 2.1):
```bash
grep -rln "sort_cache_clip" docs/superpowers/specs/
```
For each hit (expected: `2026-04-16-clip-similarity-sorting-design.md`), correct `.sort_cache_clip.json` → "the unified `.sort_cache.json` under key `'clip'`" in context. If the grep returns nothing, skip and log "no spec drift".

- [x] **Step 2.7: Commit**

```bash
git add CLAUDE.md docs/README.md docs/planning/BACKLOG.md docs/superpowers/specs/
git commit -m "docs(cw-3): doc one-liners bundle — hash swap, kickoff drift, orphan refs, dup tag

CLAUDE.md tournament UI-integration hash 6c73f9f→acfc3b6 (6c73f9f is the
IPC/TournamentManager commit); kickoff test-count 8→actual + empty-folder guard
note. docs/README.md: add Archived-Plans row for Tournament Mode plan + Design-
Specs row for TASK-028 (resolve orphan link-refs). BACKLOG: retro
[possible-dup-of] tag on the kept waitForTimeout entry. Spec sort_cache_clip
filename correction where present. (MANUAL markers / backlog-structure inventory
/ CLAUDE L314 / 3 README spec rows were already correct — no-ops.)"
```

---

## Task 3: Repo-root cruft removal

**Files:**
- Delete: `Dockerfile`, `compose.yaml`, `.dockerignore`, `README.Docker.md`, working-tree `nul`
- Modify: `.gitignore` (remove L2 `nul`, remove duplicate `!.claude/agents/` at L139)

- [x] **Step 3.1: Reference-grep the docker scaffolding (gate)**

```bash
git grep -in "docker\|compose\.yaml\|dockerfile" -- ':!docs' ':!*.md' || echo "no code refs"
grep -nE "docker|compose" package.json || echo "no package.json refs"
```
Expected: no source/script references (only possible doc mentions). If a real reference exists, STOP and surface it.

- [x] **Step 3.2: Remove the four docker files**

```bash
git rm Dockerfile compose.yaml .dockerignore README.Docker.md
```

- [x] **Step 3.3: Remove the `nul` file and its `.gitignore` line 2**

The `nul` file is untracked (gitignored). Delete the reserved-name file via the Win32 device path, then remove the ignore line:
```powershell
Remove-Item -LiteralPath "\\?\$(Resolve-Path .)\nul" -Force -ErrorAction SilentlyContinue
```
If that fails, fallback in cmd: `cmd /c "del \\.\nul"`. Then edit `.gitignore`: delete line 2 (the bare `nul`). Verify:
```bash
test -e nul && echo "STILL PRESENT — retry deletion" || echo "nul gone"
```

- [x] **Step 3.4: Remove the duplicate `!.claude/agents/` (pulled from CW-4)**

`.gitignore` lines 138–139 are identical `!.claude/agents/`. Delete line 139 (keep one). Confirm exactly one remains:
```bash
grep -c '^!\.claude/agents/$' .gitignore   # expect: 1
```

- [x] **Step 3.5: Confirm clean tree + commit**

```bash
git status --short   # expect: only the intended deletions + .gitignore modify; NO stray 'nul'
git add .gitignore
git commit -m "chore(cw-3): remove repo-root cruft

git rm unused docker init scaffolding (Dockerfile, compose.yaml, .dockerignore,
README.Docker.md — no code/script references). Delete the stray reserved-name
nul file + its .gitignore line 2. Remove the duplicate !.claude/agents/ at
.gitignore L139 (pulled forward from CW-4 to avoid a second PR touching the same
file)."
```

---

## Task 4: Closeout bookkeeping

**Files:** `docs/planning/BACKLOG.md`, `docs/planning/WEEKLY.md`, `docs/planning/DONE.md`, `docs/planning/TODO.md`, `docs/README.md`, the archived plan copy.

- [x] **Step 4.1: Check off the BACKLOG entries that CW-3 itself resolved**

Flip these `- [ ]` → `- [x]` with a `✅ Resolved 2026-06-16 (Group CW-3)` marker (these are the entries the CW-3 *work* completed, distinct from the Task-1 sweep outputs):
- L240 (🟤) BACKLOG stale-checkbox verification sweep — **the sweep task itself**
- L246 (🟤) Remove Docker scaffolding cruft
- L247 (🟤) Remove stray `nul` entry from `.gitignore`
- L171 (🟡) Clean up duplicate `!.claude/agents/` line — done in Task 3
- L261 (🟤) CLAUDE.md doc drift from Group C: kickoff test inventory — done in Task 2.3
- L334 (🟤) `waitForTimeout` dup-collapse missing `[possible-dup-of]` tag — done in Task 2.5
- L268-equivalent for the README orphan rows / hash swap: these came from the WEEKLY doc-bundle, not standalone BACKLOG entries — note them in the DONE.md entry instead.

*(L331 MANUAL-markers and L333 backlog-structure-inventory were already-done no-ops — flip them too with a `✅ already present (no-op, confirmed 2026-06-16)` note so the BACKLOG reflects reality.)*

- [x] **Step 4.2: WEEKLY.md — mark CW-3 complete + CW-4 boundary note**

- In the Daily Schedule (Thursday) and Summary Table, mark CW-3 ✅ Complete with the commit refs and the 🟤 recount.
- Add a note under CW-4 (Friday) / its group block: **"`.gitignore` duplicate-line fix completed early in CW-3; CW-4 now owns only the pre-archive checklist template block and must NOT touch `.gitignore`."**

- [x] **Step 4.3: DONE.md entry**

Add a CW-3 entry following the house format: date, group, branch, what shipped (sweep: 7 flips + 2 marker/note corrections; doc-bundle: hash swap + kickoff drift + 2 README rows + dup tag + spec fix, several no-ops; cruft: 4 docker files + nul + gitignore dup), and **"E2E: skipped (no JS changes); 326/326 unit unchanged"** per the reporting convention.

- [x] **Step 4.4: TODO.md comment + docs/README.md index the new spec & plan**

- Add a `<!-- Group CW-3 Docs & backlog hygiene completed 2026-06-16, moved to DONE.md … -->` comment block to TODO.md (mirror the CW-2 block).
- Index the new spec and plan in docs/README.md: add `[CW-3 Docs & Backlog Hygiene]` rows to **Design Specs** (→ `superpowers/specs/2026-06-16-cw-3-docs-backlog-hygiene-design.md`) and **Archived Plans** (→ `archive/plans/2026-06-16-cw-3-docs-backlog-hygiene.md`).
- Copy this plan to `docs/archive/plans/2026-06-16-cw-3-docs-backlog-hygiene.md`, flip its checkboxes to `[x]`, add `**Status: Complete**`, then `git rm` the original from `docs/superpowers/plans/` (per the archive-plans convention).
- Bump docs/README.md `*Last Updated*`.

- [x] **Step 4.5: Final commit**

```bash
git add -A
git commit -m "docs(cw-3): close out Group CW-3 (docs & backlog hygiene)

Check off constituent BACKLOG entries (sweep task, docker cruft, nul line,
.gitignore dup, kickoff drift, waitForTimeout tag, no-op confirmations). WEEKLY
CW-3 → Complete + 🟤 recount + CW-4 boundary note (.gitignore done here). DONE.md
entry (E2E skipped — no JS). TODO.md comment. Index + archive the CW-3 spec/plan."
```

---

## Verification

- No production code touched → `npm test` stays **326/326** (run once to confirm the pre-commit hook is happy; it runs vitest on every commit).
- Prettier (pre-commit) ignores `docs/` + `*.md`, so the markdown is not reformatted; ESLint has no JS to lint.
- Manual diff review: no half-flipped checkboxes; every flip cites an on-main SHA; `git status` clean after Task 3 (no stray `nul`); README has zero orphan link-refs.
- Ship: docs-only → `/code-review` is a no-op (PR #46 learning). Branch → one PR with a manual review summary.

## Self-Review (done by plan author)

- **Spec coverage:** Task 1 ↔ sweep (with the git-truth gate + recount); Task 2 ↔ doc one-liners (verify-first, no-ops logged); Task 3 ↔ cruft (docker ×4 incl. README.Docker.md, nul file+line, gitignore dup from CW-4); Task 4 ↔ ship/closeout + CW-4 boundary. All spec sections mapped. ✓
- **Placeholder scan:** no TBD/TODO; the only `<original text…>` markers denote "keep the existing entry body verbatim" (an instruction, not a gap); `<N>` is the recount output. ✓
- **Type/identity consistency:** all 7 flip SHAs match the verified ON-MAIN table; `acfc3b6`/`6c73f9f` roles are stated identically in Step 2.2 and the findings; `52f2cbc` (real) vs `853e1ee` (dead-branch) used consistently in Steps 1.2/1.3. ✓
