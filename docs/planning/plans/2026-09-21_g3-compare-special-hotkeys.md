# G3. Compare-Mode Special Hotkeys + Tooltips — Implementation Plan

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G3 (🔵, 3 SP); BACKLOG 🔵 `### [2026-08-28]` batch 2 (tooltips entry) + batch 3 (compare `1`/`2` entry)
**Spec**: None — bounded task, design approved in chat (brainstorming § Bounded path)
**Created**: 2026-09-21
**Status**: Implemented — PR #71 review round 1 addressed
**Last Updated**: 2026-09-21
**Branch**: `g3-compare-special-hotkeys`

**Goal:** Bind `1`/`2` to the special-folder move in compare mode (mirroring tournament), and make every special-button tooltip show the key that is actually bound, derived from `this.shortcuts` rather than hardcoded.

**Architecture:** Two additive keys in `DEFAULT_SHORTCUTS.compare` plus a compare branch in `executeAction`'s existing `leftSpecial`/`rightSpecial` handlers — dispatch isolation comes from the mode-keyed reverse map, per CLAUDE.md. One new pure helper, `_specialShortcutSuffix(mode, action)`, is the single source of the ` (1)` suffix for all three tooltip surfaces.

**Tech Stack:** Vanilla ES2022 renderer (no bundler), Vitest (node env, hand-rolled DOM stubs — **no jsdom**).

---

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`.
- **ESLint**: unused variables prefixed `_`; `eqeqeq`, `curly`, `prefer-const`, `no-var` enforced.
- **Vitest environment is node.** No `document`. Every DOM-touching unit test stubs `globalThis.document` in `beforeEach` and restores it in `afterEach`.
- Shortcut methods use **global `localStorage`** directly — tests mock `globalThis.localStorage`.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Pre-push runs E2E for any non-docs change.
- **Grep rule (CLAUDE.md)**: when relocating a named symbol, grep the whole repo across tests *and comments*, and re-read every comment attached to changed code even when it names no symbol.

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `media-viewer.js` | Modify | `DEFAULT_SHORTCUTS.compare` gains `leftSpecial`/`rightSpecial`; `executeAction` routes them per mode; new `_specialShortcutSuffix()`; `updateSpecialButtonsState()` + `addMediaOverlayControls()` derive their suffix; `saveShortcut`/`resetShortcuts` refresh the static tooltips |
| `tests/keyboard-shortcuts.test.js` | Modify | Bindings, reverse-map isolation, per-mode dispatch, conflict detection, suffix helper |
| `tests/media-viewer-utils.test.js` | Modify | `updateSpecialButtonsState()` tooltip derivation |
| `tests/e2e/compare-mode.test.js` | Modify | Real-keydown coverage for `1`/`2` + the derived tooltip (added during execution, not in the original table) |
| `CLAUDE.md` | Modify | L185 rephrased: migration exists at v2; bump for *changed* defaults only |
| `index.html` | **Not touched** | Static titles stay the bare pre-JS fallback — `updateSpecialButtonsState()` overwrites them at init in both branches, so a derived value cannot live in markup. A comment names the setter as owner. |

---

## Premise Corrections Made at Planning

1. **No migration needed.** Both the BACKLOG entry and CLAUDE.md L185 claim this "requires the versioned shortcut-localStorage migration". The v1→v2 migration already exists (`loadShortcuts`, ~L9345) and its own comment states the rule that makes it unnecessary: keys never stored "simply fall through to defaults" via `Object.assign({}, DEFAULT_SHORTCUTS.compare, custom.compare)`. Additive keys need no bump. Confirmed by reading the code, not the entry.
2. **The plan's tooltip file list was incomplete.** WEEKLY names `index.html` + `addMediaOverlayControls`. It misses `updateSpecialButtonsState()` (`media-viewer.js:474-493`), which is the authoritative runtime writer for all three static special-button titles and would clobber any `index.html` edit.
3. **More is free than filed.** `renderShortcutRows` and `checkShortcutConflict` both iterate `Object.entries(this.shortcuts[mode])`, so the F1 rows and conflict detection pick up the new actions with no edit. `ACTION_LABELS` already carries `leftSpecial`/`rightSpecial`.

---

## Task Ordering

Task 1 (bindings + dispatch) first — it turns an existing exact-`toEqual` assertion RED, which is the honest starting signal. Task 2 (tooltips) builds on the bindings it needs to read. Task 3 is docs.

---

## Task 1: Compare-mode `Digit1` / `Digit2` bindings + dispatch

- [x] **RED** — extend `tests/keyboard-shortcuts.test.js`:
  - update the existing exact `toEqual` on `shortcuts.compare` (L52) to include the two new keys
  - `buildReverseMap()` maps `Digit1`→`leftSpecial` in **compare and tournament only**, not single
  - `executeAction('leftSpecial')` → `moveToSpecialFolder('left')` in compare; → `handleTournamentSpecial('left')` in tournament; → no-op in single (same for `rightSpecial`)
  - `checkShortcutConflict('compare', 'leftLike', 'Digit1')` returns `'leftSpecial'`
  - `Digit1`/`Digit2` collide with nothing else in `DEFAULT_SHORTCUTS.compare`
- [x] **Verify RED** — record the actual failure count and reason in the Progress Log. A test that passes here is zero coverage; find out why before proceeding.
- [x] **GREEN** — add the two keys; give `executeAction`'s two handlers an `else if (this.isCompareMode)` branch calling `moveToSpecialFolder(side)`.
- [x] **Verify GREEN** — `npx vitest run tests/keyboard-shortcuts.test.js`, then the full unit suite.

## Task 2: Derived tooltips on all three special surfaces

- [x] **RED** — `tests/keyboard-shortcuts.test.js` (helper) + `tests/media-viewer-utils.test.js` (setter):
  - `_specialShortcutSuffix('compare', 'leftSpecial')` → `' (1)'`; after a remap to `Digit9` → `' (9)'`; `('single', 'special')` → `''` (no such action)
  - `updateSpecialButtonsState()` with a folder configured writes `'Move left to special folder (1)'` / `'Move right to special folder (2)'`, and leaves `#specialBtn` bare at `'Move to special folder'`
  - with **no** folder configured, all three get the Settings message and **no** suffix
  - `saveShortcut('compare', 'leftSpecial', 'Digit9')` refreshes the static tooltip to `(9)`
- [x] **Verify RED** — record failure reasons.
- [x] **GREEN** — add `_specialShortcutSuffix()`; consume it in `updateSpecialButtonsState()` (compare for left/right, single for `#specialBtn`) and in `addMediaOverlayControls()` (mode read at build time, so tournament gets its existing `1`/`2` shown for the first time); call `updateSpecialButtonsState()` from `saveShortcut` and `resetShortcuts`.
- [x] **Verify GREEN** — full unit suite, `npm run lint`, `npm run format:check`.

## Task 3: Docs

- [x] Rephrase CLAUDE.md L185: the migration exists at v2; bump for *changed* defaults only, never for additive keys.
- [x] Add the `index.html` comment naming `updateSpecialButtonsState()` as the owner of the three special titles.

---

## Improvements (minimum 2 required before Extract)

1. **`_specialShortcutSuffix()` as a single seam.** The alternative — inlining `keyDisplayName(this.shortcuts[mode][action])` at three call sites — would have duplicated the derivation and made the overlay path (DOM-heavy, awkward to unit-test) untestable without a full `addMediaOverlayControls` mock context. One pure helper makes the *logic* testable in isolation and leaves only the wiring to the DOM-level test.
2. **Tooltip truthfulness after a remap.** The pre-existing convention (`'Like Left (Q)'`) hardcodes the key and silently lies once the user remaps. Deriving the special suffix, and refreshing it from `saveShortcut`/`resetShortcuts`, means the new surfaces cannot drift. Recorded as a deliberate inconsistency with the like/dislike tooltips, which stay hardcoded — extending the fix to all eight sites was offered and declined as scope.
3. **Backfilled coverage for an untested pair.** `leftSpecial`/`rightSpecial` had **zero** test coverage in any mode before this group (`grep` over `tests/` returned nothing). Task 1's per-mode dispatch tests cover tournament's existing bindings too, not just the new compare ones.

---

## Residuals for Extract (🟤 candidates, found while reading — not fixed here)

1. **`saveShortcut()` drops `tournament`** (`media-viewer.js:~9538-9543`) — it persists only `single` and `compare`, so a tournament remap never survives a reload. Adjacent to this work, not caused by it.
   ⚠️ **Sequencing constraint (PR #71 round 3, verified here): entries 1 and 3 must ship together, entry 3 never alone.** The drop is currently *unobservable* because there is no UI path to remap a tournament binding at all — `renderShortcutRows` emits `data-mode` as only `single` or `compare` (`media-viewer.js:9569`/`9576`), `index.html` has exactly those two grids (`403`/`409`), and `startListeningMode` reads `kbdElement.dataset.mode`, so `saveShortcut` is never called with `'tournament'`. Adding the tournament F1 section **converts this latent bug into a visible one**: the user would remap a tournament key, watch it take effect, and lose it on reload. Cross-reference both BACKLOG entries at closeout.
2. **`checkShortcutConflict` never runs at load** — it only validates at remap time, which is why a
   default added later could collide unnoticed. `_mergeModeShortcuts` now covers the load side, but the
   asymmetry is worth a look if a third validation path ever appears.
3. **Tournament has no F1 help section** (⚠️ blocked on entry 1 — see its sequencing note) — `renderShortcutRows()` renders only the single and compare grids, so tournament's `1`/`2` stay undiscoverable in help. This group at least surfaces them in the overlay tooltip.

---

## Closeout (after user approval and code review)

Per `~/.claude/rules/planning-closeout.md`: **Extract → Archive → Transition → Commit → Capture learnings**.

- [ ] **Extract**: file the two residuals above as BACKLOG 🟤 under `### [2026-09-21] From: G3 closeout`.
- [ ] **Archive**: remove the Active Plans row from `docs/README.md`, `git mv` this file to `docs/archive/plans/`, mark `Status: Complete — merged <SHA>`, and index it in `docs/README.md` (pre-commit guard enforces this).
- [ ] **Transition**: WEEKLY G3's two checkboxes + the doc ride-along + Summary-Table row `✅ <merge-SHA>`.
- [ ] **Commit**: check off the two 🔵 `[2026-08-28]` BACKLOG entries (compare `1`/`2`; tooltips) **in the same commit as the closeout**.
- [ ] **Capture learnings**: session memory file + a one-line `MEMORY.md` pointer.

---

## Review round 1 (PR #71) — one finding, accepted and fixed differently

**Finding**: the new `leftSpecial: 'Digit1'` / `rightSpecial: 'Digit2'` defaults silently shadow a
pre-existing user remap onto those keys. `Digit1`/`Digit2` were legal remap targets in compare mode
before this PR (`reservedKeys` is only `['F1','Space','KeyI','KeyZ','KeyX','Escape']`), so a user
could hold `1` for `next`. `Object.assign` preserves the *default* key order and the new actions are
declared last, while `buildReverseMap` is last-write-wins — so `1` dispatched `leftSpecial`, the
user's `next` went dead, and pressing `1` **moved a file** with nothing reporting it.

**Verified before acting**, by executing the real `loadShortcuts` merge and `buildReverseMap` loop
against the exact stored object described — not by reading them:

```
merged.next = Digit1 | merged.leftSpecial = Digit1
pressing "1" in compare dispatches -> leftSpecial
user's remapped `next` reachable?  -> NO - DEAD
migration re-ran / rewrote storage? -> false
```

**Remedy — the reviewer's suggested v3 bump was declined in favour of a structural fix.** A version
bump is one-shot: the *next* additive binding needs a v4, and the CLAUDE.md rule would have to become
"additive keys need a bump too" — the exact rule this task already proved forgettable. The cause is
not a missing migration; it is that the merge lets a later default steal a claimed key. So
`_mergeModeShortcuts()` now makes the merge itself collision-safe, and the rule stays true.

**Who loses the race matters.** A v3 delete would drop the *user's* remap, which still leaves someone
pressing `1` expecting navigation and getting a file move — only softened by a toast. The **new
default yields instead** (`null`), so the user's key keeps doing what they bound it to. Knock-ons, all
covered by tests: `keyDisplayName` renders `'Unbound'` (an unguarded `null` crashes the entire F1
panel — caught by a RED `TypeError`, not by inspection), `buildReverseMap` skips the entry, and
`_persistableBindings` keeps the `null` out of localStorage, without which `hasOwnProperty` would
short-circuit the sweep next load and pin the action Unbound forever.

**Self-caught during the fix**: the comment asserting collisions are "never written back" was fiction
until `_persistableBindings` existed — `saveShortcut` persists the full mode object. Found by
re-reading my own comment against `saveShortcut`, and fixed rather than reworded.

---

## Progress Log

_(Append as you go: task started/finished, deviations, the RED failure reason for each test, and any premise that turned out wrong.)_

- 2026-09-21 — **Task 1 RED**: 5 failures, all "feature absent" (`compare` toEqual, mirrors-tournament, `buildReverseMap` Digit1→undefined, `executeAction` compare branch never called, `checkShortcutConflict` null). Three of the new tests passed immediately; checked each rather than accepting it, per the "a RED test that passes is zero coverage" rule. All three are legitimate guards, not filler: two pin the ruling that single mode stays bare, and `tournament mode routes through handleTournamentSpecial` is backfilled characterization of exactly the behaviour the `else if` edit could have broken. **GREEN** 40/40.
- 2026-09-21 — **Task 2 RED** initially arrived as a *collection error*, not an assertion failure: `extractMethod` resolves at describe-scope, so a missing `_specialShortcutSuffix` threw before any test ran and took both files down ("no tests"). That is a true feature-absent signal but an illegible one. Added the method as a `return ''` stub to make the RED assertion-level → **7 failures**, each naming the expected suffix. Note the two degenerate cases (`single` stays bare; no-folder omits the suffix) stayed green under the stub, correctly — they guard against over-applying the suffix rather than proving it exists.
- 2026-09-21 — **Deviation (expected, unlisted in the plan)**: the G2 `addMediaOverlayControls` suite broke with `this._specialShortcutSuffix is not a function`. The mock ctx must supply every `this.*` the method touches (CLAUDE.md § Testing), and the derived tooltip added three. Wired the *real* extracted helper plus a shortcut map into that ctx rather than stubbing the return, so those tests still exercise real derivation.
- 2026-09-21 — **Added E2E beyond the plan** (`tests/e2e/compare-mode.test.js`, 3 tests): the unit tests cover the binding, the reverse map and the dispatch branch, but **none of them prove the keydown listener reaches `Digit1` in compare mode** — the extracted-method harness bypasses the real listener entirely. Since the feature was already implemented, these could not be written RED-first, so the failure was proven by backing the feature out of `media-viewer.js`, running the three tests (all 3 failed, on the right assertions — `Received: "Move left to special folder"`), then restoring from a scratchpad copy and re-running (12/12 green). Without that step they would have been three tests that had never been observed to fail.
- 2026-09-21 — Verification: unit **824/824** (805 → 824, +19); `npm run lint` clean (2 pre-existing `no-shadow` warnings in files/lines untouched here); `npm run format:check` clean; full E2E **71 passed, 4 skipped** (the G2 visual-evidence group, skipped by design) before the new tests, 12/12 on `compare-mode.test.js` after.
- 2026-09-21 — Branch created off `main` at `59a2875` (G2 merged as `f874f93`, so the "branch after G2" ordering constraint is satisfied). Plan written from the in-chat approved design. Three premise corrections recorded above; two of them (the migration claim, the missing `updateSpecialButtonsState` call site) came from the source entries being wrong, not from the code changing.
