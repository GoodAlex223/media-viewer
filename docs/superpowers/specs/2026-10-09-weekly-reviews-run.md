# Group G5 — Weekly Reviews (2026-10-09 run): Run-card

**Date**: 2026-10-09 (Friday), the WEEKLY.md slot itself (Oct 5–9 plan, Cleanup Week #4). Verdict rows are
dated `2026-10-09`.
**Branch**: `g5-weekly-reviews`, cut from `main` at `4e568f0` (G4 closeout; `main` equal to `origin/main`).
**Source**: ⚪ Overhead — WEEKLY.md Group G5 (5 SP, exempt from the source-quota denominator).
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md)
§ _Methodology (canonical — current practice)_.
Previous run-card: [`2026-09-24-weekly-reviews-run.md`](2026-09-24-weekly-reviews-run.md).

---

## Why a run-card (not a full spec)

Methodology rule **#6**: a codified-repeat ⚪-overhead task needs only brainstorm → a short run-card →
execute, and approving the run-card satisfies the brainstorming design gate. The brainstorm was held
with the user in-session on 2026-10-09 and produced three rulings, recorded in D2–D4. This note records
only what is _specific to this run_.

## What is different about this run

Every figure names its probe; none is carried forward from an earlier run.

1. **Window: 15 days** (2026-09-24 → 2026-10-09). Shipped inside it: PR #72's close-out `57b37ad`, the
   2026-10-04 intake `a1f2b03`, and this week's G1 `0bdcdb3` (PR #74), G2 `83c6df0` (PR #73), G3 `482a3c8`
   (PR #75) and G4 `44c282b` (PR #76).
2. **Trial queue: 2 outstanding, so one trial-`adopt` slot is free.** G4's `claude-security` leg-1 `keep`
   gave its row an outcome, which by § 5's own definition ("filed, no outcome row") removes it from the
   count. Still pending: `typescript-lsp` (since 2026-07-05) and evidence-gating (since 2026-09-02). Both
   were vehicled to "Cleanup Week #4", which is this week. Neither ran: WEEKLY G4 parked `typescript-lsp`
   by user decision, and the evidence-gating gate was not built.
3. **The catalog grew 311 → 315, and the Aug-29 snapshot is gone.**
   `~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json` lists **315**
   plugins (file mtime 2026-10-08). The `claude-plugins-official.bak/` directory that gave the 09-24 run
   its diff no longer exists, and the local clone is not a git repository. §1a therefore recovers the
   additions from the upstream repository's commit history (`gh api`). If that fails, it falls back to
   sourcing from the whole catalog's development / security / testing categories, as 09-24 did.
4. **§4 inbound: 14 sibling rows now name media_viewer, and 3 are new to rule.**
   `grep -n -i "media.viewer"` over `claude-code-universal-config/docs/planning/TODO.md` at HEAD
   `68aa342` (2026-10-08), dated with `git blame`:
   - `/claude-api prompt-audit` (09-24, `c0ebbee`).
   - Design short `mdiSnFLzQaI` (09-24, `c0ebbee`), its origin review still pending.
   - **`typescript-lsp`** (10-04, `fb9312c`). This one has passed its origin's review and states a
     concrete procedure: install `typescript-language-server` and `typescript` on the host, enable the
     plugin at project scope, and confirm it runs from a `diagnostics` attachment record in a session
     transcript. It also measures this repo's payoff: navigation for certain, and type diagnostics only
     where JSDoc or `@ts-check` exists (13 JSDoc-typed files, no `jsconfig.json`).
   `which typescript-language-server` returns nothing on this host, confirming the row's "absent from
   `PATH` today".
5. **§4 outbound: all three parked candidates are still absent from live `~/.claude`.** `grep -rliE`
   over `CLAUDE.md`, `WORKFLOW.md`, `POLICIES/`, `rules/` and `TEMPLATES/`:
   - `worktree remove` 0; `junction` 1 (`TEMPLATES/database-documentation.md`, the known
     "Junction Table" false positive, which also serves as the positive control).
   - `stated mechanism` 0; `hypothesis` 1 (the bug-report template).
   - `pre-push` 0.
   24 memory files changed since 2026-09-24, including the new generic lessons on guard scope
   (`feedback_partial_guards`, `feedback_guard_scope_by_own_rationale`) and RED-first tests.

## Decisions

**D1 — Run order.** § 5 has nothing due: the plugin read-out ran in G4 on 2026-10-08. So the order is
§§1–3 → § 4 sweep → checkpoint → live `~/.claude` edit → docs → commit → PR. One trial `adopt` at most
(note 2).

**D2 — § 4 outbound: propagate the Windows-junction hazard** (user ruling 2026-10-09). The lesson:
_`git worktree remove --force` follows a Windows junction (or symlink) inside the worktree and deletes
the target's contents_. G2 junctioned `node_modules` into a scratch worktree and lost 1.3 GB of the real
checkout. The remedy is to copy rather than link, or to remove the link before removing the worktree.
Source: per-project memory `feedback_worktree_remove_follows_junctions.md`.
- **Target**: the live file whose scope covers worktrees. This run picks between `POLICIES/git.md` and
  `WORKFLOW.md` after reading both, and the exact diff is shown to the user **before any write**.
- **Absence**: re-verified at the chosen target with a wider pattern set (`junction`, `symlink`,
  `worktree remove`, `mklink`) and a positive control.
- **Outcome**: logged in the § 4 outcome log with the post-edit `grep -c`. Live-first, no sibling-repo
  edit. The other two parked outbound candidates stay parked with today's grep evidence. The guard-scope
  lesson is added to Next-up.

**D3 — § 4 inbound `typescript-lsp`: re-vehicle the pending trial, don't run it** (user ruling
2026-10-09).
- The sibling row is ruled **consumed** by § 5's pending `typescript-lsp` row. That row gets a dated
  addendum (its frozen text is not rewritten), and the addendum makes two changes:
  - **New vehicle**: the first group of the next normal week that edits `media-viewer.js` or a worker,
    run under the sibling's procedure (install, project-scope enable, `diagnostics` attachment check).
    This replaces the stale "next Cleanup Week".
  - **Narrowed read-out question**: does it surface a diagnostic or a navigation answer that the session
    would otherwise have grepped for? A run with zero `diagnostics` records reads `inconclusive`, never
    `keep`.
- No install in this run, and the queue stays at 2. The parked `serena` stays parked behind it.

**D4 — § 4 inbound `/claude-api prompt-audit`: fold into the quarterly `CLAUDE.md` audit** (user ruling
2026-10-09). The row is consumed by annotating 🟡 `[2026-09-21]`: prompt-audit runs as one pass of that
audit. **Precondition, checked this run**: confirm that `prompt-audit` actually exists in the `claude-api`
skill. If it doesn't, rule the row N/A with that evidence instead of annotating.

**D5 — Remaining inbound rows.** `mdiSnFLzQaI` joins the parked design-video batch (event-driven, origin
review pending). The 11 rows ruled 2026-09-24 are re-checked only for status changes at the origin's
HEAD; `mattpocock/skills` and the design batch stay event-driven.

**D6 — Ride-along status flip.** G1 (`bfcc881`, PR #68) extracted `MlTrainingManager`, the **training half**
of MLManager.
- GOALS.md L48 (KR "MLManager extracted", Current "Not started") → "In progress — training half
  (`MlTrainingManager`, PR #68)".
- MILESTONES.md L24 → "2 of 6 managers extracted; a third (MLManager) partly". L31's checkbox stays
  unchecked, since only half is done.
- No other strategic-doc edit; the restated "~9,400 lines" figure belongs to 🟤 `[2026-09-02]`.

**D7 — One docs-only branch and a PR**, as on 09-24. Methodology rules #3 and #4 apply. Push and PR only on
explicit approval. The single out-of-repo change (D2) is recorded in this run-card's Outcome.

## Categories & starting points

Excluded from every category: anything already in a Reviewed log, and everything the 2026-10-08 § 5
table shows as installed here.

| #   | Category                    | Parked _Next-up_                                                                              | Fresh-check                                                                              |
| --- | --------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1a  | Plugins — official catalog  | `semgrep`/`sonarqube` (parked behind `claude-security`, which has now read out) · `commit-commands` · `serena` (stays behind `typescript-lsp`) | The 4 catalog additions since 09-24 (note 3), then the dev/security/testing categories |
| 1b  | Plugins — wider internet    | `claude-mem` · TestDino skill pack · `playwright-cli-agents` / Dev Browser (Electron gap)      | Top community plugin of a 15-day window                                                   |
| 2   | Claude best-practice        | `/skill-doctor` + `/plugin` Stats tab (unused skills)                                          | Top current Anthropic / Claude Code practice                                              |
| 3   | Non-Claude AI best-practice | `/sandbox` (Windows-gated) · harness observability (needs a validation proposal) · Spec Kit   | Top current cross-tool AI-coding practice                                                 |
| 4   | Cross-project propagation   | outbound: D2 · inbound: D3–D5                                                                  | Local only — **no web**                                                                    |

`semgrep` / `sonarqube` are re-eligible this run. They were parked "behind" the `claude-security` trial
so as not to confound it, and that trial's leg 1 has now read out. They compete on their merits; they
are not promoted by default.

## Scope guards (YAGNI)

- **Exactly four** verdict rows in §§1–3 (1a, 1b, 2, 3), plus one outbound row, one outcome-log row and
  one inbound row in § 4.
- **At most one** new trial `adopt`, and it must name its vehicle at filing time. Reviews install
  nothing.
- **Web**: 8–12 calls of lightweight inline research. No deep-research harness, no parallel fan-out.
  § 4 is local only.
- **Out-of-repo writes**: only the D2 live `~/.claude` edit, approved before it runs. No sibling-repo
  edits, no plugin configuration changes.
- **Frozen Reviewed-log and Trial-log rows are never rewritten**; corrections and addenda are appended
  and dated.
- A category with nothing worth adopting gets a `pass`, never a forced `adopt`.
- **`CLAUDE.md` is untouched.** Its audit, now carrying prompt-audit (D4), belongs to 🟡 `[2026-09-21]`.

## Checkpoint (user-in-the-loop)

1. **After §§1–3 and the § 4 sweep**: the four verdicts, the inbound rulings for D4's precondition and
   D5, and the exact D2 diff, all approved before any `~/.claude` write.

## Outputs

**In-repo**

- **REVIEW-QUEUE.md**:
  - §§1–3: four verdict rows dated `2026-10-09`, with each Next-up refreshed.
  - § 4: one outbound row, one outcome-log row and one inbound row (per-item status for the 3 new rows,
    plus any status changes among the 11).
  - § 5: a stocktake update and the `typescript-lsp` addendum (D3).
- **BACKLOG.md**:
  - A `### [2026-10-09] From: Weekly Reviews (2026-10-09 run)` section, with no `(N items)` count,
    holding the trial `adopt` (if any) and any defect the run surfaces.
  - The 🟡 `[2026-09-21]` annotation (D4).
  - The re-vehicle note on the `typescript-lsp` 🟤 entry (D3).
- **TODO.md** § Spawned Tasks: the D2 propagation row, added already checked with its grep evidence.
- **GOALS.md, MILESTONES.md**: the D6 status flip.
- **WEEKLY.md**:
  - G5's boxes and its Friday schedule row.
  - The Summary-Table row reads `◐ Branch complete, unmerged` in-branch, and becomes `✅ PR #N` in the
    closeout commit on `main` after the merge.
- **DONE.md**: the transition entry, at closeout.
- **docs/README.md**: this run-card indexed (hook-enforced).
- **This run-card**: an appended **Outcome** section, including the out-of-repo change log.

**Out-of-repo**: live `~/.claude/<D2 target>`, a single insertion.

## Verification

Docs only. Verification means **evidence for each written claim**, not a test run.

- Every figure names its probe. Every grep sweep carries a **positive control**.
- Claims about a plugin are verified against Claude Code's CLI or the plugin's own source, never its
  README. Claims about the sibling repo are verified at a named HEAD.
- Before shipping, grep this run's own prose for self-attestations ("verified", "confirmed", "as
  planned", "per the …") and prove each one (09-24 lesson, PR #72).
- Sweep for the **fact**, not the phrase, when correcting any count (`feedback_sweep_the_fact_not_the_phrase`).
- Run a column-count check over every Markdown table touched. The pre-commit hook must pass
  (`check-secrets.js`, `check-docs-index.js`, the unit suite).
