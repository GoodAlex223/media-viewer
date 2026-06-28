# Review Queue

Cross-week state for the recurring **Weekly Reviews** batch (see WEEKLY.md → Recurring Weekly Reviews / Group WR). Each week, per category: pick the top **not-yet-reviewed** candidate (a parked **Next-up** item first, else the current live top hit via web search, excluding the Reviewed log); do a short review; append a verdict row (`adopt | pass | defer`); park notable runners-up under **Next-up**. On an `adopt`, also file a 🟤 Auto-Generated entry in BACKLOG.md.

**Created**: 2026-06-19 (first run scheduled June 22–26, 2026 week — empty Reviewed logs to start).
**Methodology**: see [`docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md`](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md) — the reusable "how we run Weekly Reviews" reference (hybrid relevance lens, depth, verdict rubric).

---

## 1. Plugins

Review **two independent tops** each week: the best not-yet-reviewed plugin from the **official Claude plugin store**, and, separately, the best from the **wider internet**. Log each with its `source:`.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | pr-review-toolkit (official) | store: [docs](https://code.claude.com/docs/en/discover-plugins) · `pr-review-toolkit@claude-plugins-official` | **adopt** | Official Anthropic plugin with specialized PR-review agents (tests, silent-failure-hunter, type-design, code-quality, simplification); not yet used here and complements the existing `/code-review`. Verdict rests on official primary sources — harness adversarial-verification was rate/session-limited. |
| 2026-06-26 | test-writer-fixer (community, via awesome-claude-plugins) | wider: [repo](https://github.com/ComposioHQ/awesome-claude-plugins) | defer | Vitest support fits this repo's 381-test unit suite, but it's unvetted third-party, and the community Playwright skills surveyed have an Electron-support gap (this repo's E2E target is Electron). Eval before adopt. |

### Next-up (parked runners-up)

- **commit-commands** (official) — git commit/push/PR-creation workflows; marginal (already done by hand). Source: code.claude.com/docs/en/discover-plugins
- **Playwright plugin** (Microsoft, official) — browser-automation MCP; web-oriented, low Electron fit. Source: claude.com/plugins/playwright
- **yusuftayman/playwright-cli-agents** (community) — Playwright E2E generation/debug (Page Object Model); Electron-support gap. Source: github.com/yusuftayman/playwright-cli-agents
- _Already in use here (excluded as already-adopted): Superpowers, Code Review, feature-dev, Context7._

---

## 2. Claude best-practices

Top not-yet-reviewed practice/experience for Claude, Claude Code, Claude Design, Claude Cowork, etc.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | TDD Guard (hook-enforced TDD) | [steering blog](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) | defer | Hook-based automatic TDD enforcement fits the project's TDD discipline (currently by-convention via superpowers). Surfaced in the unverified tier (session limit cut adversarial verification) and adds a hook dependency — eval before adopt. |

### Next-up (parked runners-up)

- **Work on one feature at a time / incremental progress** (verified 3-0) — already practiced here via per-task plans. Source: anthropic.com/engineering/effective-harnesses-for-long-running-agents
- **Autonomous end-to-end verification** — explicitly have the agent verify features by driving the app/browser "as a human user would" before claiming done (verified 3-0); partially covered by the `verify`/`run` skills + E2E. Source: anthropic.com/engineering/effective-harnesses-for-long-running-agents
- **`/clear` between unrelated tasks** for context hygiene (context fills fast, performance degrades). Source: code.claude.com/docs/en/best-practices

---

## 3. Non-Claude AI best-practices

Same, for AI models/tools other than Claude.

### Reviewed log

| Date | Item | Source | Verdict | Notes |
|------|------|--------|---------|-------|
| 2026-06-26 | Local-model code review (Continue.dev + Qwen3-Coder-Next via Ollama) | [guide](https://overchat.ai/ai-hub/best-local-llm-for-coding) | defer | Free/private second-opinion review pass complementing Claude `/code-review`; blocked on a capable local GPU (~24 GB) — a real hardware dependency for a solo dev. |

### Next-up (parked runners-up)

- **Spec-Driven Development / GitHub Spec Kit** (90k★, v0.11.0 Jun 2026; human-refined specs cut LLM code errors up to ~50%) — *already practiced here* via the superpowers brainstorm→writing-plans→executing-plans flow, so no new tool needed (validates current workflow). Source: github.com/github/spec-kit
- **Addy Osmani's incremental LLM workflow** — split problems into small pieces, understand before merging, ask for simpler rewrites. Source: addyosmani.com/blog/ai-coding-workflow
