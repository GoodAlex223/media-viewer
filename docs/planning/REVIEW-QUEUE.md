# Review Queue

Cross-week state for the recurring **Weekly Reviews** batch (see WEEKLY.md → Recurring Weekly Reviews / Group WR). Each week, per category, use **hybrid sourcing**: fresh-check the live landscape (a `WebSearch` for the current best, excluding the Reviewed log) **and** consider the parked **Next-up** item, then review whichever is strongest — do not rote-pick the parked item. Use **lightweight inline research** (a few `WebSearch` + 2–3 `WebFetch`; never the deep-research harness for a routine review). Append a verdict row (`adopt | pass | defer`); park notable runners-up under **Next-up**. On an `adopt`, also file a 🟤 Auto-Generated entry in BACKLOG.md.

**Sections 1–3 are inbound** (external candidates reviewed for use here). **Section 4 is outbound/inbound propagation** and uses a different verdict vocab (`propagate | pass | defer`) with a different routing sink (`TODO.md` § Spawned Tasks) — its conventions are stated in that section.

**Created**: 2026-06-19 (first run scheduled June 22–26, 2026 week — empty Reviewed logs to start).
**Methodology**: see the **Methodology (canonical — current practice)** section of [`docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md`](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md) — the reusable "how we run Weekly Reviews" reference (hybrid sourcing, lightweight inline research, docs-only-PR handling, run-card path, verdict rubric).

---

## 1. Plugins

Review **two independent tops** each week: the best not-yet-reviewed plugin from the **official Claude plugin store**, and, separately, the best from the **wider internet**. Log each with its `source:`.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | pr-review-toolkit (official) | store: [docs](https://code.claude.com/docs/en/discover-plugins) · `pr-review-toolkit@claude-plugins-official` | **adopt** | Official Anthropic plugin with specialized PR-review agents (tests, silent-failure-hunter, type-design, code-quality, simplification); not yet used here and complements the existing `/code-review`. Verdict rests on official primary sources — harness adversarial-verification was rate/session-limited. |
| 2026-06-26 | test-writer-fixer (community, via awesome-claude-plugins) | wider: [repo](https://github.com/ComposioHQ/awesome-claude-plugins) | defer | Vitest support fits this repo's 381-test unit suite, but it's unvetted third-party, and the community Playwright skills surveyed have an Electron-support gap (this repo's E2E target is Electron). Eval before adopt. |
| 2026-07-05 | typescript-lsp (official) | store: [docs](https://code.claude.com/docs/en/discover-plugins#code-intelligence) · `typescript-lsp@claude-plugins-official` | **adopt** | Official code-intelligence LSP (TS **and** JS via `typescript-language-server`): automatic post-edit diagnostics (type/syntax/missing-import, same turn) + precise symbol navigation (go-to-def, find-refs, call hierarchy) on the ~8400-line renderer — hits the CLAUDE.md "renderer file is large" pain and the no-CI "errors surface late" gap. Untyped-JS reduces type-checking value (navigation + basic JS diagnostics still apply) and large-project LSP memory use are the trial eval points, not blockers → 🟤 filed. |
| 2026-07-05 | Electron Developer Agent (community, awesome-claude-code-toolkit) | wider: [repo](https://github.com/rohitg00/awesome-claude-code-toolkit) · `agents/core-development/electron-developer.md` | pass | A single generic senior-Electron **persona file** (not a plugin); its mandated defaults (`contextIsolation:true` + `sandbox:true` on every window, cross-platform macOS/Win/Linux testing) conflict with this project's intentional sandbox-disabled, Windows-only design, and its guidance is already exceeded by the repo's CLAUDE.md Electron gotchas. Not better than current practice. |
| 2026-08-27 | security-guidance (official) | store: [docs](https://code.claude.com/docs/en/security-guidance) · `security-guidance@claude-plugins-official` | **adopt** | **Reverses its own 2026-07-05 "low fit" parking** — the parked note reasoned "no CI + a solo dev already gated by ESLint + the pre-commit secret guard", but the primary doc's own defense-in-depth table shows the plugin occupies the **in-session** stage that neither ESLint nor the secret guard covers, and *no CI* is an argument **for** it (there is no later net) rather than against. Three layers: a free deterministic per-edit pattern match (no model call), a background end-of-turn diff review, and an agentic review on each commit/push Claude makes. Three concrete hooks into this repo's actual surface: built-in DOM-injection patterns (`.innerHTML =`, `document.write`) land on the ~8400-line renderer; `child_process.exec` lands on the ffprobe/ffmpeg main-process calls; and `.claude/security-patterns.yaml` `paths` globs can finally make CLAUDE.md's advisory **"changes to preload.js require security review"** deterministic, with `.claude/claude-security-guidance.md` carrying the Electron threat model (`sandbox:false`, contextIsolation, the IPC bridge, file move/delete ops). Trial-eval points, not blockers: needs **Python 3.10+ on `PATH`** plus a first-run venv at `~/.claude/security/` (pip + network) — unverified on this Windows/Node box; model-backed layers cost ~1 review per file-changing turn + 1 per commit on Opus 4.7 by default (`SECURITY_REVIEW_MODEL`/`SG_AGENTIC_MODEL` to downgrade); and the commit layer sees only commits **Claude** makes via Bash, not the user's own shell commits. → 🟤 filed. |
| 2026-08-27 | dead-rules-audit (community, `karanb192/claude-code-hooks`) | wider: [repo](https://github.com/karanb192/claude-code-hooks) — **arrived via the inbound propagation channel** (see §4) | **adopt** | A CLAUDE.md **compliance scorecard**: parses rules at `SessionStart`, scores every `Edit`/`Write` against them in `PostToolUse`, and at `SessionEnd` renders a worst-first scorecard flagging chronically-ignored rules `⚠ promote→hook` (also on demand via `/dead-rules-audit:scorecard`). MIT, **488★**, **Node ≥18 with no npm dependencies**, platform-agnostic — no win32 blocker. Adopted because the fit was **measured, not assumed**: the sibling repo ran the plugin's own parser against this repo and got **36 rules / 10 judgeable** from `CLAUDE.md`, parsing whole atomic rules (`"Prettier: tabWidth=4, useTabs=false, singleQuote…"`), where its own hard-wrapped prose yielded 5 rules / 2 mid-sentence fragments — a structural mismatch there and a clean fit here. It targets this repo's best-documented chronic failure: advisory CLAUDE.md rules that keep being ignored (the doc-drift class recurring across PR #51→#52→#63 and still open as G4's 🟤; the "grep the repo for the symbol" rule whose breach caused the PR #56 follow-ups). The repo already performs that promotion **by hand** (pre-commit secret guard, pre-push E2E gate) with no signal for *which* rule to promote next. Trial-eval points: only 10 of 36 rules are judgeable (prohibition-shaped), so the scorecard is a partial view; scoring is token-presence heuristics, not semantic compliance, so "violations" need reading, not obeying; and it adds hook overhead on every edit. → 🟤 filed. |

### Next-up (parked runners-up)

- **commit-commands** (official) — git commit/push/PR-creation workflows; marginal (already done by hand). Source: code.claude.com/docs/en/discover-plugins
- **Playwright plugin** (Microsoft, official) — browser-automation MCP; web-oriented, low Electron fit. Source: claude.com/plugins/playwright
- **yusuftayman/playwright-cli-agents** (community) — Playwright E2E generation/debug (Page Object Model); Electron-support gap. Source: github.com/yusuftayman/playwright-cli-agents
- **Dev Browser** (Sawyer Hood, community) — drives a browser to self-verify work (Playwright API + DOM computer-use); **web-browser oriented → same Electron gap** as the picks above (this repo's E2E target is Electron). Source: firecrawl.dev/blog/best-claude-code-plugins
- **plugin-dev / agent-sdk-dev** (official) — toolkits for authoring plugins and Agent-SDK apps; no current need (this repo consumes plugins, it does not publish them). Source: code.claude.com/docs/en/discover-plugins
- **`explanatory-output-style` / `learning-output-style`** (official) — output-style plugins; presentation-only, no workflow gap here. Source: code.claude.com/docs/en/discover-plugins
- _Sourcing note (2026-08-27): "best plugins" searches return aggregator roundups, and one asserted an Anthropic **"Frontend Design"** plugin as the most-installed official plugin (~277k). That name appears **nowhere** in the official marketplace roster on `code.claude.com/docs/en/discover-plugins`, whose categories are code-intelligence LSPs, external integrations, `security-guidance`, development workflows, and output styles. Verdicts rest on the primary doc; the roundup claim is recorded as unverified, not carried._
- _Already reviewed (excluded — see log above): pr-review-toolkit (adopt), test-writer-fixer (defer), Electron Developer Agent (pass), security-guidance (adopt), dead-rules-audit (adopt)._
- _Already in use here (excluded as already-adopted): Superpowers, Code Review, feature-dev, Context7, Playwright MCP._

---

## 2. Claude best-practices

Top not-yet-reviewed practice/experience for Claude, Claude Code, Claude Design, Claude Cowork, etc.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | TDD Guard (hook-enforced TDD) | [steering blog](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) | defer | Hook-based automatic TDD enforcement fits the project's TDD discipline (currently by-convention via superpowers). Surfaced in the unverified tier (session limit cut adversarial verification) and adds a hook dependency — eval before adopt. |
| 2026-07-05 | Autonomous end-to-end / visual verification before "done" | [best-practices](https://code.claude.com/docs/en/best-practices) | **adopt** | "Give Claude a way to verify its work" — drive the running app + show visual/behavioral evidence (screenshot / computed-visibility), not just a green unit/hook run, before claiming a UI change done. Targets this repo's recurring "passes tests yet invisible/broken" class (the test-actual-visibility incident; the "green hook ≠ green E2E" Continue-resume regression that shipped silently since PR #55). Partially covered by the verify/run skills + E2E; the routine visual-evidence step is the increment → 🟤 filed (possible-dup-of CW-P's E2E-gate item). |
| 2026-08-27 | Route instructions by primitive: enforce → hooks, contextual knowledge → skills, **path-conditional → path-scoped rules**, always-on → a short CLAUDE.md | [steering blog](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) | **adopt** | The primary source states two rules verbatim: *"'Every time X, always do Y' in CLAUDE.md — if the behavior should happen reliably … use a hook in `settings.json` instead"*, and *"Keep CLAUDE.md under 200 lines, give it an owner, and review changes to it like code"*, with the explicit escalation that **as the file grows, conventions migrate to path-scoped rules and procedures to skills, where they load only when needed**. Adopted for the **path-scoped-rules half only** — the other halves are already practiced (the hook-promotion rule has shipped twice, as the pre-commit secret guard and the pre-push E2E gate; skills are in daily use). Measured, not assumed: `CLAUDE.md` is **205 lines** (over the doc's own 200-line bar, and matching the already-filed 🟤 [2026-07-03] soft-cap overshoot), and **`.claude/rules/` does not exist** — so every path-conditional block is launch-loaded into every session regardless of relevance. Concrete candidates to migrate: the Vitest/Playwright testing conventions (`tests/**`), the E2E Electron-wrapper gotchas (`tests/e2e/**`), the worker conventions (`*-worker.js`), the preload security note (`preload.js`). The sibling `claude-code-universal-config` shipped exactly this migration for itself (branch `feat/g2-path-scoped-rules-and-claude-md-sizing`), so the pattern is proven in-house. → 🟤 filed. |

### Next-up (parked runners-up)

- **Work on one feature at a time / incremental progress** (verified 3-0) — already practiced here via per-task plans. Source: anthropic.com/engineering/effective-harnesses-for-long-running-agents
- **`/clear` between unrelated tasks** for context hygiene (context fills fast, performance degrades) — confirmed recommended by the best-practices doc, but largely already practiced here (each dev task starts a fresh session per the REMEMBER→PLAN cycle). Source: code.claude.com/docs/en/best-practices
- **Expertise findings: the human should own ~70% of planning decisions** — Anthropic's own usage research finds expert sessions run 2× longer action chains carrying 5× the output, recover from failure at 80–81% vs 60% for novices, and that success correlates with *command of the domain* rather than coding ability. Read as validation of this project's spec-first / brainstorm→plan→execute discipline rather than a new practice; parked in case a future run finds an actionable increment. Source: anthropic.com/research/claude-code-expertise
- _Reviewed 2026-07-05 (removed from Next-up): "Autonomous end-to-end verification" → adopt (see log above)._

---

## 3. Non-Claude AI best-practices

Same, for AI models/tools other than Claude.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | Local-model code review (Continue.dev + Qwen3-Coder-Next via Ollama) | [guide](https://overchat.ai/ai-hub/best-local-llm-for-coding) | defer | Free/private second-opinion review pass complementing Claude `/code-review`; blocked on a capable local GPU (~24 GB) — a real hardware dependency for a solo dev. |
| 2026-07-05 | Addy Osmani's incremental LLM coding workflow (2026) | [blog](https://addyosmani.com/blog/ai-coding-workflow/) | pass | Validates current practice rather than extending it — spec-first, iterative chunking, CLAUDE.md rules files, granular commits, mandatory human verification, CI/lint quality gates are all already core to this project's superpowers flow. His most-distinctive technique (frequent commit "save-points") is already practiced (per-task commits) and now also covered by Claude Code checkpoints / `/rewind`. Only non-practiced element (swap LLMs when one stalls) is low-fit for a Claude-centric solo workflow. Nothing new to adopt. |
| 2026-08-27 | **Harness engineering** — the provider-neutral 2026 successor to context engineering (`Agent = Model + Harness`) | [Martin Fowler](https://martinfowler.com/articles/harness-engineering.html) · secondary: [faros.ai](https://www.faros.ai/blog/harness-engineering) · [arXiv 2602.14690](https://arxiv.org/pdf/2602.14690) | pass | The clear cross-tool theme of 2026 and explicitly provider-neutral, with a real supporting datum (LangChain moved a coding agent 52.8% → 66.5% on Terminal-Bench 2.0 by changing the *harness*, not the model). Passed because its prescriptions map onto machinery this repo **already runs**. Fowler's taxonomy is *guides* (feedforward) + *sensors* (feedback): guides = linters/type-checkers/structural tests, an AGENTS.md-style doc, architecture guidelines, how-to skills → here ESLint + Prettier, `CLAUDE.md`/`PROJECT.md`/`docs/`, superpowers skills; sensors = static analysis on agent output, AI-assisted review, coverage → here the pre-commit chain (secret scan → lint-staged → 513 unit tests), the pre-push E2E gate, `/code-review`. Its headline principle, *"shift feedback left — cheap deterministic checks pre-commit rather than post-integration"*, is precisely what PR #63 built. Fowler is also candid about the limits: **no quantitative evidence** for the benefit claims, computational sensors "catch style violations reliably" while neither sensor class reliably catches misdiagnosis or misunderstood requirements, and the behavioral-harness category "remains largely unsolved". Same shape as the 2026-07-05 Addy Osmani `pass` — validates current practice rather than extending it. One genuinely unpracticed layer parked below. |

### Next-up (parked runners-up)

- **Spec-Driven Development / GitHub Spec Kit** (90k★, v0.11.0 Jun 2026; human-refined specs cut LLM code errors up to ~50%) — *already practiced here* via the superpowers brainstorm→writing-plans→executing-plans flow, so no new tool needed (validates current workflow). Source: github.com/github/spec-kit
- **Harness *observability*** — the one layer of the five-layer harness model (tool orchestration · verification loops · context & memory · guardrails · **observability**) this project does not implement: no measurement of *where* the agent actually fails, so rule-promotion and process fixes are chosen from recollection rather than data. Deliberately not adopted this run — the 2026-08-27 `dead-rules-audit` adopt is a narrow, concrete instance of exactly this idea (measure which rules get ignored), so trial that first and revisit the general layer only if it earns its keep. Source: martinfowler.com/articles/harness-engineering.html · faros.ai/blog/harness-engineering
- _Reviewed 2026-07-05 (removed from Next-up): "Addy Osmani's incremental LLM workflow" → pass (see log above)._

---

## 4. Cross-project propagation

**Added 2026-08-27** (WEEKLY.md G5). Unlike sections 1–3, this section's candidates are **not external
web hits** — they are learnings crossing a repo boundary. The conventions below are **imported** from
the sibling repo `claude-code-universal-config` (its `docs/planning/REVIEW-QUEUE.md`; a sibling checkout,
deliberately not linked — a relative path would resolve above this repo root and 404 in any clone),
which has run an equivalent section four times (2026-07-03, -07-16, -07-21, -07-27), rather than
invented here — one convention, two directions.

### Conventions

- **Verdict vocab is `propagate | pass | defer`** (not `adopt`).
- **Row (outbound)**: `YYYY-MM-DD — <learning/origin> — verdict: … — note`.
- **Row (inbound)**: `YYYY-MM-DD — <origin repo / source> — <per-item status> — note`. An inbound
  sweep covers several items at once, so the status is stated **per item** inside the row rather than as a
  single trailing verdict.
- **`propagate` → file a row in [`TODO.md`](TODO.md) § Spawned Tasks** — the outbound analog of
  `adopt` → 🟤 BACKLOG. `pass`/`defer` stay in this file.
- **Verify against the target; never assume.** Confirm a learning is absent from the destination by
  grepping the specific strings there. Diffing trees is meaningless — they are scrubbed and drift by
  design.
- **Direction (D1, this repo's deviation).** WEEKLY.md defines only the outbound half. This section is
  **bidirectional**, because the sibling repo already carried unactioned rows addressed to
  media_viewer that a one-way channel would have dropped permanently.
  - **Outbound** — what shipped *here* since the last run that belongs elsewhere.
  - **Inbound** — what another repo has already routed *at* this one. An inbound item is actioned only
    once its **origin repo's own review is complete**; until then it is recorded and parked, not filed
    as work.
- **Target scope (D2)**: `~/.claude` via `claude-code-universal-config` is the one **confirmed**
  standing target. `wallpaper_sorter`, `media_compression`, `media_parser` are **TBD** — not yet
  established as propagation partners; decide before treating them as targets.
- **Scan window** = since the previous run's date, not "this week".

### Reviewed log — outbound

<!-- newest last: YYYY-MM-DD — <learning/origin> — verdict: propagate | pass | defer — note -->

2026-08-27 — This window's shipped work (PRs #63 CW-P / #64 G1 / #65 G2 / #66 G3, since the 2026-07-05 run) — verdict: **propagate** — scanned and **verified against the targets by grep, not assumed**. The propagated learning is the **code-review rating axis: score by *realness*, not by severity or frequency.** It is the most-recurring process finding this repo has produced — it fired on **four consecutive PRs** (#59, #64, #65, #66) — and it has one measured cost: the sub-threshold lifecycle finding deferred on PR #64 went on to destroy a **23,559-entry / 126 MB** feature cache of real user data. Two clauses: (1) a confirmed defect must not be dropped because it is hard to hit, cheap to fix, or comment-only — frequency and recoverability are *not* realness; and (2) a shared-state/lifecycle race that pre-exists a PR becomes that PR's finding when the PR adds a **new consumer** whose correctness depends on the broken invariant. Both currently live only in this project's per-project memory files (`feedback_defer_lifecycle_findings.md`, `feedback_review_threshold_comment_findings.md`), which reach no other project by any route. **Absence at the target was tested, not assumed**: `realness` / `severity axis` / `confirmed bug` return **0 hits** in both `~/.claude/POLICIES/code-review.md` and the synced source `home-claude/POLICIES/code-review.md`. The single adjacent hit — global `POLICIES/code-review.md` L266, *"anything the reviewer raised below its own reporting threshold and passed on informally rather than posting"* — is **complementary, not redundant**: it governs *bookkeeping* (a sub-threshold remark still gets a bullet in the response record), whereas this learning is upstream of it (*don't let the filter drop a confirmed bug in the first place*). Routing note: the target is the **synced product**, so the follow-up is a two-trees edit (`home-claude/` + live `~/.claude/`), which § Spawned Tasks explicitly anticipates. Spawned → [TODO.md](TODO.md) § Spawned Tasks. One runner-up parked below. Nothing else in the window propagates: G1's incremental-cache-load, G2's unified undo stack and G3's deferred-refresh protocol are all media-viewer-specific implementation, and their generic residue (*"a green suite hid both of the design's core assumptions"*, *"the E2E passed for the wrong reason"*) is already covered globally by the existing verification policy.

### Reviewed log — inbound

<!-- newest last: YYYY-MM-DD — <origin repo / source> — <per-item status> — note -->

2026-08-27 — `claude-code-universal-config` § Spawned Tasks → **4 rows reaching media_viewer**, none of which had ever arrived in this repo's planning docs. Precisely: **3 are media_viewer-dedicated** and the 4th (`dead-rules-audit`) is a **shared row targeting four projects** (`social_stats`, media_viewer, `goodalex223`, `rating_bot`) on which media_viewer is named the strongest fit — which is why its adopt rests on this repo's own 36-rules/10-judgeable measurement rather than on the row itself. This is the first inbound sweep, and it is the reason D1 made the section bidirectional. Status per row: (1) **`dead-rules-audit`** — upstream-confirmed 2026-07-27 with a measurement against *this* repo's `CLAUDE.md` (36 rules / 10 judgeable) → **consumed by this run's §1 Plugins `adopt`**; deliberately **not** double-filed as a separate propagation task. (2) **`/wayfinder` planning skill** (Matt Pocock, video `F3lL98Pj90o`), (3) **Jenkins automation server** — routed here explicitly for *"CI/CD, scheduled jobs"*, which lands on this repo's known and documented **no-CI** gap, and (4) **design-themed Claude video sub-batch** (`NWDuC-w1lwA`, `7FU98O0JLHs`, `K2_qHRcbNtU`, `Pe-ubc8ypis`, Chase AI). Rows 2–4 all carry an upstream marker that *the origin repo's own REVIEW-QUEUE review is still pending* (🔵 [2026-08-24] there) — so per the inbound rule they are **recorded and parked, not filed as work**; importing an unvetted recommendation would launder the origin's uncertainty into this repo's backlog. Re-check them once the origin's verdicts land.

### Next-up (parked)

<!-- outbound candidates spotted but not yet propagated; inbound items awaiting their origin's verdict -->

- _Outbound_ — **The pre-push E2E gate as a general no-CI pattern** (PR #63: `scripts/check-e2e-needed.js` + `.husky/pre-push`, with a code-aware docs-only skip). Verified absent at the target: `pre-push` returns **0 hits** across global `CLAUDE.md`, `WORKFLOW.md` and `POLICIES/`, and across the synced `home-claude/` product (its only hits are session transcripts under `projects/`/`file-history/`, not policy); global `WORKFLOW.md` has **0** mentions of E2E at all. Held back this run because its audience is narrower than the propagated item — it presupposes a project with an E2E suite *and* no CI — and because a second propagation in one window would exceed the sibling repo's established one-per-run cadence. Promote next run if it still fits.
- _Inbound_ — **`/wayfinder` planning skill**, **Jenkins (CI/CD for the no-CI gap)**, **design-video sub-batch** — all three awaiting `claude-code-universal-config`'s own REVIEW-QUEUE verdicts (🔵 [2026-08-24] there). Re-check on the next run; do not action earlier.
- _Consumed 2026-08-27 (removed rather than struck through): `dead-rules-audit` → §1 Plugins `adopt`._
