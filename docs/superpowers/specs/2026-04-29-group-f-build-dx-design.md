# Group F: Build & DX — Design

**Date**: 2026-04-29
**Source**: `docs/planning/WEEKLY.md` (Week of 2026-04-13 → 2026-04-17, Friday slot)
**Branch**: `feature/group-f-build-dx`
**Total SP**: 2 (1 SP + 1 SP)

---

## Goal

Two independent tooling/config fixes deferred to the Friday "Build & DX" slot of the weekly plan. Neither is on a critical path; both reduce silent-breakage risk in shared developer infrastructure.

1. **Pin Lucide CDN to a specific version** (1 SP) — replace `@latest` floating tag with `@1.14.0` + SRI integrity hash to prevent silent upstream changes from breaking icon rendering.
2. **Update regression-checker agent for FullscreenManager** (1 SP) — Section 2 references symbols that were extracted into `fullscreen.js` in TASK-019; agent has been emitting outdated guidance ever since.

---

## Scope

**In scope:**
- `index.html` — single `<script>` tag for Lucide
- `.claude/agents/regression-checker.md` — Section 2 body, line-count reference, new Section 8 on modular subsystems

**Out of scope:**
- Migrating Lucide to bundled (npm-installed) icons — separate effort, larger surface
- Full audit of regression-checker against all 7 critical state systems — captured as BACKLOG follow-up if drift is suspected
- Extracting additional managers (ZoomManager / CompareManager / etc.) — already on the roadmap, separate work

---

## Task 1 — Pin Lucide CDN

### Current state

`index.html:8`

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
```

`@latest` resolves at request time to whatever unpkg considers the most recent npm `lucide` release. A breaking API change or build artifact change ships invisibly to users, with no version control trace.

### Target state

```html
<!-- Lucide pinned: bump version + regenerate SRI hash via curl|openssl (see PR for procedure) -->
<script
    src="https://unpkg.com/lucide@1.14.0/dist/umd/lucide.min.js"
    integrity="sha384-jB6ZXxyEV94yzTxgLMvrwwNbn/pTTqwrMDI+v8FV5o5FnId/yn3DJwSdrDujU9A7"
    crossorigin="anonymous"
></script>
```

(SRI hash computed from served bytes on 2026-04-29 via the procedure below; if the implementation date differs and unpkg has re-served the file, regenerate.)

- **Version**: `1.14.0` (current `latest` per `npm view lucide dist-tags` on 2026-04-29)
- **SRI**: SHA-384 hash of the served bytes; mismatch causes the browser to refuse execution
- **`crossorigin="anonymous"`**: required for SRI on cross-origin scripts
- **Inline comment**: documents the bump procedure inline so future maintainers don't need to dig

### SRI generation procedure

Run before commit (one-liner):

```bash
curl -sL https://unpkg.com/lucide@1.14.0/dist/umd/lucide.min.js \
  | openssl dgst -sha384 -binary \
  | openssl base64 -A
```

Paste the output (prefixed with `sha384-`) into the `integrity` attribute. Verify by reloading the app — if SRI fails, browser DevTools console shows the integrity error and `lucide` is `undefined` (the existing `if (typeof lucide !== 'undefined')` guard at `media-viewer.js:356` prevents a crash; icons silently disappear, which is the loud-failure mode we want during version bumps).

### Failure modes & mitigations

| Failure | Behavior | Mitigation |
|---|---|---|
| SRI hash wrong (typo) | All icons missing on load | Paste SRI output verbatim; verify locally before commit |
| unpkg serves different bytes (compromised CDN) | All icons missing | This is the protection — fail closed |
| Lucide releases breaking change | We stay on 1.14.0; no impact | Intentional; bump deliberately when ready |

### Verification

- Manual smoke test: `npm start` → confirm icons render in
  - Toolbar buttons (compare, folder open, shuffle, sparkles, help)
  - Drop zone (folder icon)
  - Playback controls (pause, play, volume, skip)
  - Overlay controls in compare mode (folder-heart, undo, thumbs up/down)
  - Settings panel close X
- E2E suite stubs `unpkg.com` (`page.route('**/unpkg.com/**')` → empty module per CLAUDE.md), so it does **not** exercise the real CDN. No new E2E test needed; pre-existing tests stay green.
- Pre-commit hook (ESLint + Prettier + Vitest) is unaffected — `index.html` is formatted by Prettier; lint config does not touch HTML attributes.

---

## Task 2 — Update regression-checker agent

### Current state — what's stale

`.claude/agents/regression-checker.md` was authored before TASK-019 extracted fullscreen handling into `fullscreen.js`. Stale references in Section 2 ("AbortController Cleanup"):

| Stale reference | Current symbol |
|---|---|
| `fullscreenAbortControllers` Map | `this.fullscreen.abortControllers` (private to `FullscreenManager`) |
| `cleanupFullscreen(wrapper)` | `this.fullscreen.cleanup(wrapper)` |
| `abortFullscreenController(wrapper)` | `this.fullscreen.abortController(wrapper)` (internal to `FullscreenManager`; not called from MediaViewer) |

Line-count reference also drifted: `6600+` → `~7400` (current `wc -l media-viewer.js` = 7468 on 2026-04-29). Note: CLAUDE.md also says `~6300+`; out of scope to fix here, captured as a follow-up.

### Target state

#### Change 1 — Section 2 rewrite

Replace lines 24-29 (heading + body) with:

```markdown
### 2. Fullscreen Lifecycle (FullscreenManager)
Fullscreen is managed by `FullscreenManager` (see `fullscreen.js`), instantiated as `this.fullscreen` in MediaViewer. All exit paths must route through `this.fullscreen.cleanup(wrapper)`:
- Click handler (registered inside `toggle()`), ESC key, Z/X keys, `toggleViewMode()`, `showCompareMedia()`
- Internal `abortController(wrapper)` is called from `cleanup()` to remove listeners — do not call directly from MediaViewer

Check: Does the change add a fullscreen entry/exit path that bypasses `this.fullscreen.toggle()` / `this.fullscreen.cleanup()`? Does it stash listeners on the wrapper without using FullscreenManager's AbortController?
```

#### Change 2 — line count

Line 8: replace `6600+` with `~7400`.

#### Change 3 — new Section 8 (insert before "## Output Format")

```markdown
### 8. v2.0 Modular Subsystems
MediaViewer is being incrementally extracted into focused manager classes. Extracted today: `FullscreenManager` (`fullscreen.js`). Planned: `ZoomManager`, `CompareManager`, `SortingManager`, `MLManager`.

Pattern: stateful manager class + constructor-injected callbacks for host dependencies (e.g., FullscreenManager receives `isZoomed`, `pauseOtherVideos`).

Check: When changes touch an extracted manager —
- Are callback contracts preserved? (e.g., does `isZoomed(wrapper)` still return a boolean for any wrapper, including detached ones?)
- Are new MediaViewer→manager dependencies passed via constructor options, not via `manager.viewer = this` back-references?
- Does the manager still own its own cleanup (AbortControllers, timers, refs)? MediaViewer should not reach into manager internals.
```

### Verification

- Dispatch the agent against a recent fullscreen-touching commit:
  ```bash
  git log --oneline -- fullscreen.js media-viewer.js | head
  ```
  Pick the most recent and run the agent. Confirm:
  - Output references `this.fullscreen.cleanup` (not `cleanupFullscreen`)
  - No false-positive flag claiming `fullscreenAbortControllers` is missing
  - Section 8 fires only when a manager file (`fullscreen.js` etc.) is in the diff
- Visual diff review: agent file is plain markdown, so the only failure mode is wording drift — review carefully for typos.

---

## Architecture / data flow

Both changes are static-file edits. No runtime data flow, no IPC, no state.

```
index.html  (1 line edit + SRI hash + comment)
    ↓
Browser loads pinned Lucide UMD bundle from unpkg
    ↓
SRI check passes → window.lucide defined → existing guard at media-viewer.js:356 calls lucide.createIcons()
```

```
.claude/agents/regression-checker.md  (Section 2 rewrite + line count + new Section 8)
    ↓
Future agent invocations dispatch with up-to-date symbol references
    ↓
Reduces false-positive "missing cleanupFullscreen" flags
```

---

## Testing strategy

| Layer | Coverage | Action |
|---|---|---|
| Unit (Vitest) | None — neither file is JS code | No changes |
| E2E (Playwright) | Lucide CDN already stubbed | No new tests |
| Pre-commit hook | ESLint + Prettier + Vitest | Will run automatically; no expected impact |
| Manual smoke | Icon rendering across all UI surfaces | **Required** for Lucide change |
| Agent dispatch | Run regression-checker on real commit | **Required** for agent update |

---

## Rollout / commit structure

Single PR off `feature/group-f-build-dx`, two commits:

1. `chore(html): pin Lucide CDN to 1.14.0 with SRI hash` — `index.html` only
2. `docs(agents): update regression-checker for FullscreenManager extraction` — `.claude/agents/regression-checker.md` only

Atomic commits enable granular revert if either change misbehaves.

---

## Success criteria

- [ ] `index.html` Lucide `<script>` references `lucide@1.14.0` (no `@latest`)
- [ ] `index.html` Lucide `<script>` has valid `integrity` and `crossorigin="anonymous"` attributes
- [ ] App starts with `npm start`; all icons render correctly
- [ ] `.claude/agents/regression-checker.md` Section 2 references `this.fullscreen.cleanup()` (no `cleanupFullscreen`)
- [ ] `.claude/agents/regression-checker.md` line 8 reads `~7400` (not `6600+`)
- [ ] `.claude/agents/regression-checker.md` Section 8 ("v2.0 Modular Subsystems") added before Output Format
- [ ] regression-checker dispatched against a real commit produces output with new symbol names
- [ ] Pre-commit hook passes (ESLint + Prettier + Vitest)
- [ ] PR opened, reviewed, merged

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SRI hash typo silently breaks icons | Low | Low | Manual smoke test before PR |
| Lucide 1.14.0 has a regression vs. older versions | Low | Low | If found, pin to a known-good older version + regenerate SRI |
| Section 8 is too prescriptive for future managers | Low | Low | Lightweight wording; can be revised when ZoomManager lands |
| Agent rewrite introduces a new false-negative (misses real bug) | Low | Medium | Verify on a real fullscreen-touching commit before merging |

---

## Open questions / follow-ups for BACKLOG

- Full audit of regression-checker against all 7 (now 8) critical state systems — only Section 2 was demonstrably stale; rest assumed current. If audit finds drift, capture as separate task.
- Migrate Lucide to bundled (npm-installed) icons — eliminates CDN dependency entirely. Larger scope; not in v1.1 polish milestone.
- Consider similar pinning for any other CDN-loaded resources (none identified currently in `index.html`).
- Update `CLAUDE.md` line-count reference (currently `~6300+`, actual is 7468) — separate small doc fix.
