# Review Queue

Cross-week state for the recurring **Weekly Reviews** batch (see WEEKLY.md → Recurring Weekly Reviews / Group WR). Each week, per category, use **hybrid sourcing**: fresh-check the live landscape (a `WebSearch` for the current best, excluding the Reviewed log) **and** consider the parked **Next-up** item, then review whichever is strongest — do not rote-pick the parked item. Use **lightweight inline research** (a few `WebSearch` + 2–3 `WebFetch`; never the deep-research harness for a routine review). Append a verdict row (`adopt | pass | defer`); park notable runners-up under **Next-up**. On an `adopt`, also file a 🟤 Auto-Generated entry in BACKLOG.md.

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

### Next-up (parked runners-up)

- **commit-commands** (official) — git commit/push/PR-creation workflows; marginal (already done by hand). Source: code.claude.com/docs/en/discover-plugins
- **security-guidance** (official) — reviews each change for common vulnerabilities and fixes in-session; low fit given no CI + a solo dev already gated by ESLint + the pre-commit secret guard, but a candidate. Source: code.claude.com/docs/en/security-guidance
- **Playwright plugin** (Microsoft, official) — browser-automation MCP; web-oriented, low Electron fit. Source: claude.com/plugins/playwright
- **yusuftayman/playwright-cli-agents** (community) — Playwright E2E generation/debug (Page Object Model); Electron-support gap. Source: github.com/yusuftayman/playwright-cli-agents
- **Dev Browser** (Sawyer Hood, community) — drives a browser to self-verify work (Playwright API + DOM computer-use); **web-browser oriented → same Electron gap** as the picks above (this repo's E2E target is Electron). Source: firecrawl.dev/blog/best-claude-code-plugins
- _Already reviewed (excluded — see log above): pr-review-toolkit (adopt), test-writer-fixer (defer), Electron Developer Agent (pass)._
- _Already in use here (excluded as already-adopted): Superpowers, Code Review, feature-dev, Context7._

---

## 2. Claude best-practices

Top not-yet-reviewed practice/experience for Claude, Claude Code, Claude Design, Claude Cowork, etc.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | TDD Guard (hook-enforced TDD) | [steering blog](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) | defer | Hook-based automatic TDD enforcement fits the project's TDD discipline (currently by-convention via superpowers). Surfaced in the unverified tier (session limit cut adversarial verification) and adds a hook dependency — eval before adopt. |
| 2026-07-05 | Autonomous end-to-end / visual verification before "done" | [best-practices](https://code.claude.com/docs/en/best-practices) | **adopt** | "Give Claude a way to verify its work" — drive the running app + show visual/behavioral evidence (screenshot / computed-visibility), not just a green unit/hook run, before claiming a UI change done. Targets this repo's recurring "passes tests yet invisible/broken" class (the test-actual-visibility incident; the "green hook ≠ green E2E" Continue-resume regression that shipped silently since PR #55). Partially covered by the verify/run skills + E2E; the routine visual-evidence step is the increment → 🟤 filed (possible-dup-of CW-P's E2E-gate item). |

### Next-up (parked runners-up)

- **Work on one feature at a time / incremental progress** (verified 3-0) — already practiced here via per-task plans. Source: anthropic.com/engineering/effective-harnesses-for-long-running-agents
- **`/clear` between unrelated tasks** for context hygiene (context fills fast, performance degrades) — confirmed recommended by the best-practices doc, but largely already practiced here (each dev task starts a fresh session per the REMEMBER→PLAN cycle). Source: code.claude.com/docs/en/best-practices
- _Reviewed 2026-07-05 (removed from Next-up): "Autonomous end-to-end verification" → adopt (see log above)._

---

## 3. Non-Claude AI best-practices

Same, for AI models/tools other than Claude.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | Local-model code review (Continue.dev + Qwen3-Coder-Next via Ollama) | [guide](https://overchat.ai/ai-hub/best-local-llm-for-coding) | defer | Free/private second-opinion review pass complementing Claude `/code-review`; blocked on a capable local GPU (~24 GB) — a real hardware dependency for a solo dev. |
| 2026-07-05 | Addy Osmani's incremental LLM coding workflow (2026) | [blog](https://addyosmani.com/blog/ai-coding-workflow/) | pass | Validates current practice rather than extending it — spec-first, iterative chunking, CLAUDE.md rules files, granular commits, mandatory human verification, CI/lint quality gates are all already core to this project's superpowers flow. His most-distinctive technique (frequent commit "save-points") is already practiced (per-task commits) and now also covered by Claude Code checkpoints / `/rewind`. Only non-practiced element (swap LLMs when one stalls) is low-fit for a Claude-centric solo workflow. Nothing new to adopt. |

### Next-up (parked runners-up)

- **Spec-Driven Development / GitHub Spec Kit** (90k★, v0.11.0 Jun 2026; human-refined specs cut LLM code errors up to ~50%) — *already practiced here* via the superpowers brainstorm→writing-plans→executing-plans flow, so no new tool needed (validates current workflow). Source: github.com/github/spec-kit
- _Reviewed 2026-07-05 (removed from Next-up): "Addy Osmani's incremental LLM workflow" → pass (see log above)._
