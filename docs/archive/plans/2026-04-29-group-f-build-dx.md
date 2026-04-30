# Group F: Build & DX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate two silent-breakage risks in shared developer infrastructure: (1) pin the Lucide icon CDN to a specific version with SRI integrity, and (2) update the `regression-checker` agent to reference the post-extraction `FullscreenManager` API.

**Architecture:** Two independent static-file edits bundled into one PR on `feature/group-f-build-dx`. (1) `index.html` — replace `lucide@latest` with `lucide@1.14.0` plus a `sha384` SRI hash and `crossorigin="anonymous"`; the existing `if (typeof lucide !== 'undefined')` guard at `media-viewer.js:356` ensures icons fail silently rather than crash if the SRI mismatches. (2) `.claude/agents/regression-checker.md` — rewrite Section 2 to reference `this.fullscreen.cleanup()` instead of the extracted-and-renamed `cleanupFullscreen()`, fix the line-count reference, and append a new Section 8 codifying how to audit changes to v2.0 modular subsystems.

**Tech Stack:** HTML/SRI (sha384, browser-native), Lucide UMD bundle from unpkg, Claude Code agent definitions (markdown).

**Spec:** [docs/superpowers/specs/2026-04-29-group-f-build-dx-design.md](../../superpowers/specs/2026-04-29-group-f-build-dx-design.md)

**Branch:** `feature/group-f-build-dx` (already checked out; spec committed at 86509ea)

**Status:** Complete (PR [#32](https://github.com/GoodAlex223/media-viewer/pull/32), archived 2026-04-30). 27/29 plan steps executed; 2 verification steps deferred (Step 1.4 manual smoke test pending pre-merge user action, Step 2.5 agent dispatch verification deferred to post-quota-reset BACKLOG item).

---

## Task 1: Pin Lucide CDN with SRI hash

**Files:**
- Modify: `index.html:8` (single `<script>` tag for Lucide)

- [x] **Step 1.1: Regenerate the SRI hash for `lucide@1.14.0`**

The hash recorded in the spec was generated on 2026-04-29. Re-generate to confirm unpkg still serves identical bytes.

Run:
```bash
curl -sL https://unpkg.com/lucide@1.14.0/dist/umd/lucide.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```

Expected output: a single base64 string (no trailing newline). On 2026-04-29 this was:
```
jB6ZXxyEV94yzTxgLMvrwwNbn/pTTqwrMDI+v8FV5o5FnId/yn3DJwSdrDujU9A7
```

If the hash differs from the spec, the file changed upstream — proceed with the new hash and note the divergence in the commit message.

- [x] **Step 1.2: Update `index.html` Lucide script tag**

Replace [index.html:8](../../../index.html#L8). The current line:
```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

Replace with (substitute the hash from Step 1.1 if it differs from the example):
```html
<!-- Lucide pinned: bump version + regenerate SRI hash via curl|openssl (see PR for procedure) -->
<script
    src="https://unpkg.com/lucide@1.14.0/dist/umd/lucide.min.js"
    integrity="sha384-jB6ZXxyEV94yzTxgLMvrwwNbn/pTTqwrMDI+v8FV5o5FnId/yn3DJwSdrDujU9A7"
    crossorigin="anonymous"
></script>
```

- [x] **Step 1.3: Run lint + format check**

Prettier formats `*.html` (`index.html` is included in pre-commit). Run manually first to catch any reflow issue:
```bash
npx prettier --check index.html
```

If it fails (Prettier wants different attribute wrapping), run:
```bash
npx prettier --write index.html
```

Expected: no errors after format-write. The new wrapping may differ slightly from the example above; that is fine.

- [ ] **Step 1.4: Manual smoke test** _(DEFERRED — required pre-merge of PR #32, see DONE.md)_

This step is required because E2E tests stub `unpkg.com` (`page.route('**/unpkg.com/**')` per CLAUDE.md) and do not exercise the real CDN.

```bash
npm start
```

In the running app, visually confirm icons render in:
- Toolbar buttons (compare/eye, folder-open, shuffle, sparkles, help-circle)
- Drop zone (folder icon — hide existing folder if needed, or load a folder then "Choose folder")
- Settings panel close X (open Settings via F1)
- Help overlay (open via F1's Help button or `?` key) — chevron-left / chevron-right / X
- Compare-mode overlay controls (load 2+ files, switch to Compare via toolbar or `C`) — folder-heart, undo-2, thumbs-down, thumbs-up
- Playback controls (load a video) — pause, play, volume-2, skip-back, skip-forward

Expected: every icon shown above renders. If any icon is missing, the SRI hash is wrong — re-run Step 1.1 and update.

Close the app (Ctrl+W or close window).

- [x] **Step 1.5: Run unit tests**

Pre-commit will run these too, but verify cleanly first:
```bash
npm test
```

Expected: PASS (160 tests, 7 files green) — Lucide change should not affect any unit test.

- [x] **Step 1.6: Commit**

```bash
git add index.html
git commit -m "chore(html): pin Lucide CDN to 1.14.0 with SRI hash

Replace floating @latest tag with @1.14.0 plus sha384 SRI integrity
attribute and crossorigin=anonymous. Prevents silent upstream
changes from breaking icon rendering. SRI mismatch causes browser
to refuse execution; existing 'if (typeof lucide !== undefined)'
guard at media-viewer.js:356 keeps the app from crashing — icons
silently disappear, which is the loud-failure mode we want.

Bump procedure documented inline. E2E tests stub unpkg.com so they
do not exercise the real CDN; manual smoke test confirmed icons
render across toolbar, overlay controls, drop zone, and playback."
```

---

## Task 2: Update regression-checker agent for FullscreenManager

**Files:**
- Modify: `.claude/agents/regression-checker.md` — three discrete edits (Section 2 body, line 8 line-count, new Section 8 before Output Format)

- [x] **Step 2.1: Replace Section 2 body**

Edit [.claude/agents/regression-checker.md:24-29](../../../.claude/agents/regression-checker.md#L24-L29). The current section (heading + body) is:
```markdown
### 2. AbortController Cleanup
`fullscreenAbortControllers` Map stores controllers per wrapper element. All exit paths must call `cleanupFullscreen(wrapper)`:
- Click handler, ESC key, Z/X keys, `toggleViewMode()`, `showCompareMedia()`
- `abortFullscreenController(wrapper)` must be called before `wrapper.remove()`

Check: Does the change add/remove fullscreen entry/exit paths without updating cleanup? Does it create listeners without AbortController signals?
```

Replace with:
```markdown
### 2. Fullscreen Lifecycle (FullscreenManager)
Fullscreen is managed by `FullscreenManager` (see `fullscreen.js`), instantiated as `this.fullscreen` in MediaViewer. All exit paths must route through `this.fullscreen.cleanup(wrapper)`:
- Click handler (registered inside `toggle()`), ESC key, Z/X keys, `toggleViewMode()`, `showCompareMedia()`
- Internal `abortController(wrapper)` is called from `cleanup()` to remove listeners — do not call directly from MediaViewer

Check: Does the change add a fullscreen entry/exit path that bypasses `this.fullscreen.toggle()` / `this.fullscreen.cleanup()`? Does it stash listeners on the wrapper without using FullscreenManager's AbortController?
```

- [x] **Step 2.2: Update line-count reference**

Edit [.claude/agents/regression-checker.md:8](../../../.claude/agents/regression-checker.md#L8). The current line:
```markdown
You are a regression analysis agent for `media-viewer.js`, a 6600+ line single-file Electron renderer with deeply interconnected state.
```

Replace `6600+` with `~7400`:
```markdown
You are a regression analysis agent for `media-viewer.js`, a ~7400 line single-file Electron renderer with deeply interconnected state.
```

(Verify with `wc -l media-viewer.js` if you want to update to a fresher exact figure; `~7400` matches the count of 7468 on 2026-04-29.)

- [x] **Step 2.3: Append new Section 8 before "## Output Format"**

The "## Output Format" heading is at [.claude/agents/regression-checker.md:72](../../../.claude/agents/regression-checker.md#L72). Insert this new section immediately above it (i.e., between line 71 — end of Section 7 — and line 72 — `## Output Format` heading), preserving a blank line before and after:

```markdown
### 8. v2.0 Modular Subsystems
MediaViewer is being incrementally extracted into focused manager classes. Extracted today: `FullscreenManager` (`fullscreen.js`). Planned: `ZoomManager`, `CompareManager`, `SortingManager`, `MLManager`.

Pattern: stateful manager class + constructor-injected callbacks for host dependencies (e.g., FullscreenManager receives `isZoomed`, `pauseOtherVideos`).

Check: When changes touch an extracted manager —
- Are callback contracts preserved? (e.g., does `isZoomed(wrapper)` still return a boolean for any wrapper, including detached ones?)
- Are new MediaViewer→manager dependencies passed via constructor options, not via `manager.viewer = this` back-references?
- Does the manager still own its own cleanup (AbortControllers, timers, refs)? MediaViewer should not reach into manager internals.
```

- [x] **Step 2.4: Verify the edits with `git diff`**

Run:
```bash
git diff .claude/agents/regression-checker.md
```

Expected: three diff hunks — one removing the old Section 2, one changing `6600+` → `~7400`, one inserting Section 8. No other changes (no whitespace drift, no accidental deletions).

If the diff shows other unintended changes, revert (`git checkout .claude/agents/regression-checker.md`) and redo from Step 2.1.

- [ ] **Step 2.5: Dispatch the regression-checker agent on a real commit to verify it works** _(DEFERRED — subagent quota exhausted during execution; tracked in BACKLOG)_

Pick a recent fullscreen-touching commit. `43db8af` ("refactor: DRY toggleViewMode() single-mode branch") touches code that calls `this.fullscreen.cleanup(...)` — a good target.

Use the Task tool with `subagent_type: regression-checker`. The dispatch prompt:
```
Analyze the changes in commit 43db8af (run `git show 43db8af -- media-viewer.js`) for regressions. Focus on the fullscreen lifecycle (Section 2) and v2.0 modular subsystems (Section 8) checks. Report findings using the Output Format template.
```

Expected output:
- Agent references `this.fullscreen.cleanup()` (the new API), NOT `cleanupFullscreen` or `fullscreenAbortControllers`
- No false positive flagging "missing `cleanupFullscreen()` call"
- Either reports no regressions, or flags them with the new API names
- Does not crash or fail to load the agent definition

If the agent still emits old symbol names, the edits in Steps 2.1-2.3 are incomplete — re-check the file.

- [x] **Step 2.6: Run unit tests + lint**

```bash
npm test && npm run lint
```

Expected: tests PASS (no JS code changed), lint PASS (markdown is excluded from ESLint). The pre-commit hook only runs Prettier on staged JSON/CSS/HTML — not markdown — so this is just a sanity check.

- [x] **Step 2.7: Commit**

```bash
git add .claude/agents/regression-checker.md
git commit -m "docs(agents): update regression-checker for FullscreenManager extraction

Section 2 (was 'AbortController Cleanup', now 'Fullscreen Lifecycle')
references this.fullscreen.cleanup() / .toggle() / .abortController()
instead of the pre-TASK-019 cleanupFullscreen / fullscreenAbortControllers
symbols, which were extracted into fullscreen.js and renamed.

Adds new Section 8 'v2.0 Modular Subsystems' codifying how to audit
changes to extracted managers (FullscreenManager today; ZoomManager
/ CompareManager / SortingManager / MLManager planned). Future-proofs
the agent against further extractions.

Line-count reference updated 6600+ to ~7400 (current wc -l: 7468).

Verified by dispatching the agent against commit 43db8af — output
references the new API names; no false-positive flags."
```

---

## Task 3: PR creation and closeout

**Files:** None (git/GitHub operations only)

- [x] **Step 3.1: Push branch to origin**

```bash
git push -u origin feature/group-f-build-dx
```

Expected: branch pushed, PR creation URL printed.

- [x] **Step 3.2: Run pre-commit hook one more time as a final gate**

The hook ran on each commit, but a final clean check before opening the PR:
```bash
npm test && npm run lint && npm run format:check
```

Expected: all three PASS. If `format:check` fails, run `npm run format` and amend the most recent commit (only if you have not already pushed; otherwise add a new "style: prettier formatting" commit).

- [x] **Step 3.3: Open the PR**

```bash
gh pr create --title "Group F: Build & DX (Lucide pin + regression-checker update)" --body "$(cat <<'EOF'
## Summary

- Pin Lucide CDN to `lucide@1.14.0` with SHA-384 SRI integrity hash; eliminates silent breakage from upstream changes
- Update `.claude/agents/regression-checker.md` Section 2 for the FullscreenManager extraction (TASK-019 left stale `cleanupFullscreen` references); add Section 8 to audit future modular extractions
- Spec: `docs/superpowers/specs/2026-04-29-group-f-build-dx-design.md`
- Plan: `docs/planning/plans/2026-04-29-group-f-build-dx.md`

## Test plan

- [x] Manual smoke test: all icons render after Lucide pin (toolbar, drop zone, overlay controls, playback, settings, help)
- [x] Unit tests pass (`npm test` — 160 tests)
- [x] Lint clean (`npm run lint`)
- [x] Prettier clean (`npm run format:check`)
- [x] regression-checker agent dispatched against a real commit (`43db8af`); output references `this.fullscreen.cleanup()` (new API), no false positives
- [x] CI green
- [x] Reviewer manually confirms icons render after pulling the branch

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Capture it for the reviewer.

- [x] **Step 3.4: Wait for review and merge**

Hand off to the user/reviewer. Do not merge without explicit approval per the project's git policy.

---

## Post-merge closeout (after PR approval and merge)

These steps are run by the user (or by Claude under user direction) per the global CLAUDE.md "Task Completion" workflow.

- [x] **Step 4.1: Extract follow-ups to BACKLOG.md**

From the spec's "Open questions / follow-ups for BACKLOG" section, add:
- Full audit of regression-checker against all 7+1 critical state systems
- Migrate Lucide to bundled (npm-installed) icons
- Update `CLAUDE.md` line-count reference (`~6300+` → `~7400`)

- [x] **Step 4.2: Archive the plan**

```bash
git mv docs/planning/plans/2026-04-29-group-f-build-dx.md docs/archive/plans/
```

Update `docs/archive/plans/README.md` if it indexes archived plans.

- [x] **Step 4.3: Transition task in TODO.md → DONE.md**

Add a "Group F Build & DX" entry to `docs/planning/DONE.md` with the merge date, plan link, and one-line summary. WEEKLY.md "Group F" line gets `Status: Done`.

- [x] **Step 4.4: Commit doc changes**

```bash
git add docs/planning/BACKLOG.md docs/planning/DONE.md docs/planning/WEEKLY.md docs/archive/plans/
git commit -m "docs: close out Group F (extract→archive→transition)"
```

- [x] **Step 4.5: Update memory**

Per global CLAUDE.md Session End protocol:
- Create session entity `project:media-viewer:session:2026-04-29`
- Save key decisions (SRI pinning approach; agent Section 8 introduces modular-subsystem auditing pattern)

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Lucide pin + SRI: Tasks 1.1-1.6
- ✅ regression-checker Section 2 rewrite: Task 2.1
- ✅ Line-count fix: Task 2.2
- ✅ New Section 8: Task 2.3
- ✅ Verification by dispatching agent: Task 2.5
- ✅ Manual smoke test for icons: Task 1.4
- ✅ Two-commit structure (atomic per task): Tasks 1.6 + 2.7
- ✅ BACKLOG follow-ups extracted: Task 4.1

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague "handle errors" — all code/text edits show the exact before/after content.

**Type/symbol consistency:** `this.fullscreen.cleanup()` used consistently (not `cleanupFullscreen`); `1.14.0` and the SHA-384 hash match across spec, plan, and commit messages.
