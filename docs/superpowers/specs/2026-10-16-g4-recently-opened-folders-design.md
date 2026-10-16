# G4 Recently Opened Folders — Design Spec

**Task Reference**: WEEKLY.md Oct 12–16 § G4 (🔵, 3 SP → **~4.5 SP**, see § 11) ← BACKLOG 🔵 [2026-07-01] "Add 'Recently opened folders' quick-access list" (manual testing)
**Created**: 2026-10-16
**Status**: Approved by the user 2026-10-16 (brainstormed section by section, decisions D0–D2, § 3). **Amended while writing, before the user's review of this file** (both flagged at hand-off): § 6 step 2 uses a per-row busy state instead of the loading spinner, because `showLoadingSpinner()` hides the drop zone; and § 6 routes each surface like the existing button on that surface (drop-zone list → `loadFolder`, header menu → `switchToFolder`), because `switchToFolder`'s same-folder no-op would swallow a drop-zone retry of a folder whose last load was empty. **Amended at planning, same day, before any code** (plan [2026-10-16_g4-recently-opened-folders.md](../../planning/plans/2026-10-16_g4-recently-opened-folders.md), Premise Corrections 1–6): the open menu pins the header instead of closing on its `mouseleave` (§ 7, E13); it stops `wheel` propagation (§ 7, E17); the ▾ and ✕ are text glyphs, not Lucide icons (§ 7); the ▾ sits in an anchor wrapper, which is what shows and hides (§ 7); `classifyRecentFolder` and `folderDisplayName` are pure functions in the module (§ 4); the evidence screenshots redact the temp root (§ 9.3). **Amended again the same day, by user ruling (D3)**, after a side-agent note verified against the code: a header folder switch during an unfinished tournament asks Save / Discard / Cancel first (§ 6, E12).
**Branch**: `g4-recently-opened-folders` (from `main` @ `dd05eed`; one PR)
**Trial vehicle**: `typescript-lsp` (REVIEW-QUEUE § 5, WEEKLY G4) — see § 9.4; read-out at G6.

---

## 1. Goal

Let the user reopen a folder they used recently with one click, without the folder picker. Since Electron 32
the picker is the **only** way to open a folder (§ 2 F1), and the app always starts on the drop zone, so every
session today starts with navigating the dialog to a deep folder such as `…\Sorted\Liked_3`.

**Success**: a folder that loaded media before is listed on the drop zone at the next start and in a header
menu while another folder is open; choosing it opens it with no dialog; a folder that has gone is dropped from
the list with a notice; nothing in this feature widens what the main process will do for the renderer.

---

## 2. Findings that shaped the design

| #  | Finding (measured on `main` @ `dd05eed`)                                                                                                                                                                 | Consequence |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| F1 | Drag-and-drop folder loading is dead: `handleFolderDrop` reads `File.path`, removed in Electron 32 (installed `^39.1.2`; G1 spec § 282, BACKLOG 🟤).                                                     | The dialog is the only way in; the list is the first non-dialog path. |
| F2 | The app never reopens the last folder; it starts on `#dropZone`, which is visible by default in `index.html`.                                                                                           | The list must render at init, not only from `showDropZone()`. |
| F3 | The whole drop zone is a click target that opens the dialog (`media-viewer.js:2182`).                                                                                                                   | List clicks must `stopPropagation()`. |
| F4 | Once a folder is open the drop zone is unreachable: `#changeFolderBtn` goes straight to the dialog (`:2218`). The drop zone returns only after a failed load or an empty folder.                       | A header entry point is needed for mid-session switching (D1). |
| F5 | Grants persist in `userData/folder-grants.json` (`main.js:212`); `load-folder` is guarded by `kinds.grantedPath` (`:339`); `get-grant-status` answers `true` / `false` / `'unreachable'` for ≤16 paths (`:326`); `open-folder-dialog(defaultPath)` re-confirms at a saved folder; `check-folder-exists` returns `true` / `false`, or `null` when refused (`:646`). | **No new IPC and no `preload.js` change.** A tampered list can only name folders main then refuses. |
| F6 | `status()` canonicalizes by walking up to the nearest existing parent (`path-grants.js:236`), so a folder deleted from a drive that still exists reads `granted`. `'unreachable'` means nothing on the path resolves (drive absent). | "No longer exists" needs `checkFolderExists`, after the status check. |
| F7 | `statusMany` runs one path at a time because `realpath` on an offline share holds a libuv thread ~21 s (deep review #3).                                                                               | Validate on click only — never a status query per entry on render. |
| F8 | `.header` auto-hides on its own `mouseleave` (`_setupAutoHide`, `:2741`).                                                                                                                                | The menu is a child of `.header`, so the pointer inside it does not hide the header. |
| F9 | `showLoadingSpinner()` sets `#dropZone` to `display:none` (`:4307`).                                                                                                                                     | The open flow must not use it (amendment, § 6 step 2). |
| F10 | E2E launches share one renderer profile; `closeApp` clears only the three saved-folder keys (`tests/e2e/helpers/electron-app.js:98`). `app-launch.test.js:64` clicks the drop zone's centre.          | The helper must clear the new key, or a stale list catches that click. |

---

## 3. Decisions (user rulings, 2026-10-16 brainstorm)

| #  | Question                                   | Ruling |
| -- | ------------------------------------------ | ------ |
| D0 | G4 is scheduled after I1 (TODO 🔴, user decision 2026-10-11). Order? | **G4 now, I1 next.** G4 uses only existing guarded IPC (F5) and adds no page-side file load — names only, no thumbnails — so it does not depend on I1 or widen it. I1 stays 🔴 and goes next; the reorder is recorded in WEEKLY.md and TODO.md. |
| D1 | Where is the list reachable?               | **Drop zone + a header menu**: a ▾ button beside change-folder opens the same list; change-folder still opens the dialog in one click. |
| D2 | Architecture                               | **A pure module + glue** (Approach A): pure `recent-folders.js`; `MediaViewer` keeps the DOM and IPC. Not B (all in the 11,015-line renderer the active milestone shrinks) and not C (main-process store: a `preload.js` change, and the grant store would double as UI history — the planned grant eviction would silently shrink the list). |
| D3 | A header folder switch during an unfinished tournament? (added 2026-10-16, after approval) | **Ask first, in `switchToFolder`** — the same Save & leave / Discard / Cancel prompt as Escape and the mode buttons, for change-folder and the ▾ menu alike. Measured on `main`: `loadFolder` leaves tournament mode and nulls the engine without asking, and a pick's write is debounced 500 ms (`PERSIST_DEBOUNCE_MS`) and skips itself once the engine is gone (`_drain`), so a pick made just before the switch was never written. Change-folder's OS dialog outlasted the debounce; two clicks on the menu need not. Save & leave flushes first. Not chosen: disabling ▾ in tournaments, or leaving it as change-folder does. |

Also approved with the sections (no separate question): cap 8; exact-path dedupe, no case folding; record only
loads that show media; validate on click; a missing folder is removed with a notice; an unreachable one is kept
with a notice; an ungranted one re-opens the dialog at its path; change-folder's handler body becomes
`switchToFolder`; the ▾ button is disabled, not hidden, when nothing else can be opened; the open menu owns the
keyboard; ✕ removes a list entry and never revokes a grant; no auto-reopen at startup.

---

## 4. Architecture

```
recent-folders.js  (new, pure ESM — no DOM, no IPC, no localStorage)
    parseRecentFolders(raw) · recordRecentFolder(entries, path, now)
    removeRecentFolder(entries, path) · serializeRecentFolders(entries) · MAX_RECENT_FOLDERS = 8
    folderDisplayName(path, basename) · classifyRecentFolder(status, exists)   (amended at planning: § 6's table, pure)
        ▲ import * as RecentFolders from './recent-folders.js'
media-viewer.js  (glue)
    constructor: this.recentFolders = RecentFolders.parseRecentFolders(localStorage.getItem('recentFolders'))
    _recordRecentFolder(path) / _removeRecentFolder(path)   — update, persist (try/catch), re-render
    renderRecentFolders()        — the drop-zone list (#recentFoldersDrop)
    _buildRecentFolderRows(...)  — the row builder both surfaces share
    toggle/open/closeRecentFoldersMenu()   — #recentFoldersMenu + its capture listeners
    openRecentFolder(path, { surface: 'drop' | 'menu' })   — § 6
    switchToFolder(folderPath)   — extracted from #changeFolderBtn's handler, behaviour unchanged
main.js / preload.js — unchanged
```

`recent-folders.js` joins the pure-ESM ESLint block beside `like-or-skip.js` (`eslint.config.mjs:160`). The
renderer imports it as a namespace, like `LikeOrSkip`.

---

## 5. Storage and recording

**Key** `recentFolders`, value `{"version":1,"entries":[{"path":"C:\\…\\Liked_3","openedAt":1760000000000}, …]}`,
most recent first. The display name is derived at render with `electronAPI.path.basename`, never stored.

- **`parseRecentFolders(raw)`** never throws. Bad JSON, `version !== 1`, or `entries` not an array → `[]`. Each
  entry needs `path` a string of 1–4096 characters and `openedAt` a finite number ≥ 0; others are dropped.
  Duplicate paths keep the first (newest); the result is capped at `MAX_RECENT_FOLDERS`.
- **`recordRecentFolder(entries, path, now)`** returns a new array: `{ path, openedAt: now }` first, any older
  entry with the same path removed, capped. The input is not mutated.
- **`removeRecentFolder(entries, path)`** returns a new array without it.
- **`serializeRecentFolders(entries)`** is the inverse of parse (`parse(serialize(x))` deep-equals `x` for a
  valid `x`).
- **Path identity is exact string equality** — no `toLowerCase()` (memory: NTFS keeps case-variant names
  distinct). The dialog returns on-disk casing, so this does not duplicate entries in practice.
- **This validation is hygiene, not a control.** The security boundary stays main's `kinds.grantedPath` (F5).

**Recording.** `loadFolder` calls `_recordRecentFolder(folderPath)` in one place: the success branch with
`result.files.length > 0`, after `showMedia()`. Every way in ends there — the drop-zone click, change-folder,
both recent surfaces and a re-pick. The empty-folder branch does not record (reopening would only say "No media
files found"); an entry already listed that is now empty stays. The path recorded is the one the caller passed,
which for a dialog pick is the path as picked. A `localStorage` write that throws (quota, a blocked accessor)
is caught and logged at `warn` via `logError`; the in-memory list still updates for the session.

---

## 6. The open flow — `openRecentFolder(path, { surface })`

1. **Guards.** Single-flight: while `_recentOpenInFlight` is set, a click is ignored (double-click, two quick
   picks). `_refuseIfFileOpInFlight()` refuses with "Wait for the move to finish" before anything else, and
   `_refuseIfFolderLoadInFlight()` refuses during a folder load (amended — PR #81 review #1, below). In the
   menu the current folder (`=== this.baseFolderPath`, with media on screen) is disabled and never reaches here.
2. **Busy row** (amended — F9). The chosen row gets `aria-busy="true"` and its path line reads "Checking…".
   The menu, if open, stays open **during the checks only** (milliseconds locally, up to ~21 s on an offline
   share, F7); Escape may still close it, and the flow carries on. **As soon as the checks decide, the menu
   closes — before the dialog opens, before the open starts, and before a notice.**
3. **Ask main**, one path:

   | `getGrantStatus([path])[0]` | Next | Result |
   | --- | --- | --- |
   | `true` | `checkFolderExists(path)` → `true` | **open** `path` (step 4) |
   | | → `false` | `_removeRecentFolder(path)`; warning *"Liked_3" no longer exists — removed from recent folders* |
   | | → `null` (refused) | as `false` below |
   | `false` | info *Confirm "Liked_3" — press Select Folder (security update)*; `openFolderDialog(path)` | a pick → **open** the picked path (recorded by `loadFolder`); cancel → nothing |
   | `'unreachable'` | keep the entry | warning *"Liked_3" isn't reachable — its drive may be disconnected, or access denied* (amended — PR #81 review #6: main fails closed on `EACCES`/`EPERM`, so a denied folder on a mounted drive reads `'unreachable'` too) |
   | anything else | `logError` at `warn` | `showError("Couldn't open that folder")`; entry kept |

4. **Open** routes each surface like the existing button on it (amended): from the **drop zone**,
   `loadFolder(p)` — what the drop-zone click's `openFolderDialog()` does; from the **menu**, `switchToFolder(p)`
   — what change-folder does, reset included. (`switchToFolder`'s same-folder no-op would otherwise swallow a
   drop-zone retry of a folder whose last load was empty, which leaves `baseFolderPath` set to it.)
5. **`finally`**: clear `_recentOpenInFlight`; clear the row's busy state (re-render); close the menu if a
   thrown error left it open.

A load that fails after the checks pass (e.g. `readdir` → `EACCES`) takes `loadFolder`'s existing path: drop zone
plus error; the entry is kept.

**Amended — PR #81 review** (`/code-review high`, 2026-10-16):
- **One folder load at a time (#1).** Change-folder's reset empties `baseFolderPath` before its load, so ▾ was
  enabled for the whole load, and nothing refused a second switch. Two loads then interleaved: the older load's
  `loadBulkRatedFile` read resolved against the newer folder's files and saved into that folder's
  `.bulk_rated.json`, flipping a rating there (measured by the reviewer, then as an E2E). Now `loadFolder` holds
  `_folderLoadInFlight` from before its listing until it settles, on every path. While it is set,
  `_refuseIfFolderLoadInFlight()` makes `loadFolder`, `switchToFolder`, `_switchToFolderNow` (before its reset),
  `openRecentFolder` (before any IPC) and change-folder (before its dialog) refuse with info *Wait for the folder
  to finish loading*, and ▾ is disabled with that title. The cost: while a slow listing runs (an offline share),
  every other folder change waits.
- **A failed load leaves tournament mode (#2).** `loadFolder` exits tournament mode before every branch, a failed
  listing and a thrown one included. After a header switch's Save & leave or Discard the engine is already gone,
  and a failure used to return first, leaving tournament mode on with no engine.
- **A ✕ on the row being checked drops its decision (#3)**, whatever it is: no open (which would list the folder
  again), no dialog, no notice. A ✕ on another row leaves it in force.
- **A dialog supersedes a pending click, and a Cancel does not revive it (#4, kept as built).** The intent bump
  (G4 final review F1) runs before the drop-zone and change-folder dialogs, not on a pick. Bumping on a pick only
  would let a check that answers while the dialog is open act behind it: `'regrant'` would open a second dialog,
  and `'open'` would start a load that the dialog's pick then collides with (refused under #1). The row reverts
  from "Checking…" and can be clicked again.
- **The busy mark survives a re-render (#5).** `_recentOpenInFlight` holds the path being checked, and
  `_buildRecentFolderRows` marks that row, so a ✕ on another row no longer drops "Checking…" while clicks stay
  ignored. Step 5's re-render runs after the path is cleared.

**`switchToFolder(folderPath)`** is `#changeFolderBtn`'s inline handler body (`media-viewer.js:2218-2249`) moved
into a method, **no behaviour change**, same order: same-folder no-op → `_refuseIfFileOpInFlight()` **before** the
state reset (G2 final review F1) → reset → `hideDropZone()` → `await loadFolder(folderPath)`. The button calls
`switchToFolder(await openFolderDialog())`.

**During an unfinished tournament (D3)** `switchToFolder` shows `showTournamentLeavePrompt` before the reset and
returns; the reset and load run as the prompt's continuation (`_switchToFolderNow`) after Save & leave (which
flushes the debounced write first) or Discard. Cancel changes nothing. The continuation checks the file-op guard
again before its reset: the prompt blocks clicks but not keys, so a special move can start behind it. If that
refuses after Save, the tournament is already on disk and the engine dropped, so the next pick of the same folder
switches without a second prompt.

---

## 7. UI and keyboard

**Drop-zone list** — `#recentFoldersDrop`, inside `#dropZone`, after `.drop-subtitle`:
- A "Recent folders" heading, then one row per entry: a `.recent-folder-item` button (name in bold; full path
  muted, ellipsized, `title` = full path) and a sibling ✕ `.recent-folder-remove` button
  (`aria-label="Remove "Liked_3" from recent folders"`). Sibling buttons, never nested.
- **`display:none` when the list is empty**, so a first launch looks exactly as today.
- The container stops click propagation (F3) and sets `cursor: default`; the rest of the drop zone still opens
  the dialog.
- `createElement` + `textContent` only — the `htmlSinkGuard` lint rule enforces it. No icons: the ▾ and ✕
  are text glyphs (amended at planning — the E2E harness stubs Lucide, so icon-only buttons would be blank in
  the committed evidence, and glyphs need no `createIcons` call).
- `renderRecentFolders()` runs at init (after `initializeElements()`), from `showDropZone()`, and after every
  record or remove.

**Header menu** — `#recentFoldersBtn` (▾, `aria-haspopup="menu"`, `aria-expanded`), right after
`#changeFolderBtn`, inside `#recentFoldersAnchor` (the menu's positioning wrapper), which is what is shown and
hidden in the same two places (`hideDropZone` / `showDropZone`) — amended at planning:
- **Disabled**, title *No other recent folders*, when the list holds nothing but the current folder.
- `#recentFoldersMenu` (`role="menu"`) is a **child of `.header`** (F8), built fresh on each open from
  `_buildRecentFolderRows`. The current folder is marked *current* and disabled; ✕ works on every row.
- **While open it owns the keyboard** (the `.bulk-dislike-modal` pattern): capture-phase `document` listeners,
  removed on every close path. Escape closes it and stops there (no fullscreen exit, no tournament leave);
  ArrowUp/ArrowDown move focus between rows, Tab/Enter/Space act natively on the focused button; **every other
  key is swallowed** (`preventDefault` + `stopPropagation`), so a Like/Dislike key cannot move a file behind it.
- Closes on: choosing a row (once § 6's checks decide, step 2), Escape and a pointerdown outside it.
  **While open it pins the header** (`.header.menu-open`: opacity 1, pointer-events auto) — amended at
  planning: `_setupAutoHide` re-arms its 3 s hide only on `mouseenter` and in the top 50 px band, so a pointer
  resting in the menu below the band faded both out, and crossing the gap under the header fired its
  `mouseleave`. It also **stops `wheel` propagation**: the document wheel handler would change the file behind
  it (and on the AI order record a skip).

**Styling**: existing tokens — `--glass-bg`, `--border-strong`, `--radius-lg`, `--z-dropdown`. List ≤ ~480 px wide,
menu ~360 px.

---

## 8. Edge cases

| #   | Case | Behaviour |
| --- | ---- | --------- |
| E1  | Double-click a row / two quick picks | Single-flight: the second click is ignored |
| E2  | Pick during a file action (`_fileOpInFlight`) | Refused with "Wait for the move to finish"; nothing changes |
| E3  | The current folder in the menu | Marked *current*, disabled |
| E4  | Folder deleted (drive present) | Status `granted` (F6) → exists `false` → removed + notice; no dialog |
| E5  | Drive absent / share offline | `'unreachable'` → kept + notice (offline share: the row reads "Checking…" for up to ~21 s) |
| E6  | Grant missing (store unwritable, deleted, future eviction) | Dialog at the path; cancel → nothing; a different pick → that folder opens and is recorded |
| E7  | A listed folder is empty now | `loadFolder`'s "No media files found"; entry kept; a retry from the drop zone reloads (§ 6 step 4) |
| E8  | `recentFolders` corrupted or a future version | Parsed as `[]`, list hidden; the next record overwrites it |
| E9  | `localStorage` write throws | `warn` logged; the session list still updates |
| E10 | More than 8 folders | The oldest drops off |
| E11 | Folder renamed outside the app | The old entry reads as missing (E4) and is removed; the new name is recorded when next opened |
| E12 | Pick from the menu (or change-folder) mid-tournament or mid-sort | An unfinished tournament asks Save & leave / Discard / Cancel first (D3); then, as before, `loadFolder` exits tournament mode and aborts in-flight sorts |
| E13 | The header's auto-hide fires, or the pointer crosses the gap under it, with the menu open | The header stays pinned (`.header.menu-open`) until the menu closes (amended at planning) |
| E14 | A key pressed while the menu is open | Swallowed, except Escape (closes), arrows, Tab, Enter, Space |
| E15 | ✕ on the current folder | Removed; re-recorded on its next successful load |
| E16 | A folder name with `&`, `'`, `;` | Rendered as text (Windows forbids `<>`; see § 9.2 case 5) |
| E17 | Mouse wheel over the open menu | Stopped at the menu: nothing navigates behind it (amended at planning) |

---

## 9. Testing and acceptance

### 9.1 Unit (Vitest)

- `tests/recent-folders.test.js` — the module directly: parse (bad JSON, unknown version, non-array, each
  invalid-entry shape, duplicates, the cap, a 4097-character path), record (front, dedupe, cap, input not
  mutated), remove, the serialize round trip.
- `tests/recent-folders-glue.test.js` — `extractAsyncMethod`: **one case per row of the § 6 table**, asserting
  which of open / `_removeRecentFolder` / `openFolderDialog(path)` / which notice ran, and that each surface
  opens through its own route (§ 6 step 4); the single-flight drop; the file-op refusal before any IPC;
  `switchToFolder` refusing **before** it resets state (G2 F1 order).

### 9.2 E2E (`tests/e2e/recent-folders.test.js`)

1. **Startup reopen** — open A via the mocked dialog; `page.reload()` (grants live in main); the drop zone lists
   A; clicking it loads A; the dialog mock was not called.
2. **Header menu** — open A, then B; the menu lists B (current, disabled) and A; choosing A loads it, no dialog.
3. **Missing folder** — an entry for a deleted folder inside a granted temp root: clicking removes the entry and
   shows the notice; no dialog.
4. **Not granted** — seeded under `{ grant: false }`: the dialog opens at that path (`__mvLastDialogDefaultPath`)
   and the pick loads.
5. **Name as text** — a folder named `a&amp;b`: the row's text is `a&amp;b` (an `innerHTML` render would show
   `a&b`, so this case discriminates).
6. **Keyboard ownership** — menu open: the Like key moves no file; Escape closes the menu and the mode is
   unchanged.
7. **Click isolation** — a list row does not open the dialog; the existing `app-launch` drop-zone click test
   still passes.

**Helper changes** (`tests/e2e/helpers/electron-app.js`): `closeApp` also removes `recentFolders` (F10), and
`launchApp` clears it and re-renders at start, in case an earlier run crashed before cleanup; `mockFolderDialog`
gains a call counter so "no dialog" is asserted directly.

### 9.3 Visual evidence (plan-level acceptance check)

Committed to `docs/superpowers/specs/assets/`, as G2 did: `g4-drop-zone-before.png` (no list — today's look),
`g4-drop-zone-after.png` (with the list), `g4-header-menu-after.png`. Paths are redacted in the shots (amended
at planning): E2E folders live under `%TEMP%`, inside the Windows profile, so the path text is swapped for
`D:\Photos` before each shot — text only, layout unchanged.

### 9.4 `typescript-lsp` trial

At the start of implementation, before the first `media-viewer.js` edit: ask before the global
`npm i -g typescript-language-server typescript`; enable `typescript-lsp@claude-plugins-official` at project
scope in `.claude/settings.json` (a protected path); confirm a `diagnostics` record in the session transcript.
Not a gate on the feature; read out at G6.

### 9.5 Acceptance

All of § 9.1–9.2 green, plus the full unit suite and the pre-push E2E suite; lint clean; the three screenshots
committed; `CLAUDE.md` (architecture tree + one State Management line) and `docs/README.md` updated.

---

## 10. Out of scope, and found on the way

**Out of scope**: thumbnails or any page-side file load (I1's territory); grant revocation or a "forget folder"
action (BACKLOG 🟤 "Grant eviction and a forget-folder action", G1 Future Improvement); auto-reopening the last
folder at startup; a keyboard shortcut for the menu; reviving drag-and-drop (BACKLOG 🟤, F1).

**Found on the way — Future Improvement candidates for the plan** (not fixed here):
- `#changeFolderBtn` opens the dialog at the OS default location; passing the current folder's parent as
  `defaultPath` would put sibling folders (`Liked_1` beside `Liked_3`) one click away.
- `.drop-subtitle` reads "Supports: JPG, PNG, GIF, MP4, WebM, MOV" — out of date against `media-formats.js`
  (`.jxl`, at least).
- The drop zone's title, class and id still say "drop" although dropping has not worked since Electron 32 (F1).

---

## 11. Sizing, model and risks

**Re-estimate: ~4.5 SP** (planned 3; 1.5× — inside the 2× abort line): pure module + unit 1; open flow +
`switchToFolder` + glue unit 1; drop-zone list + header menu + keyboard ownership + CSS 1.5; E2E (7) + helper +
screenshots 1. The header menu (D1) is most of the growth.

**Execution model** (WORKFLOW § 1.0, between the 3–4 and 5–7 SP rows; the plan confirms): Sonnet · `medium` for
the module, markup, CSS, E2E helper and screenshots the plan spells out; Sonnet · `high` for the open-flow glue,
`switchToFolder` and the menu's keyboard ownership, where a guard order or a missed close path is easy to get
subtly wrong. Review standard (`high`).

**Risks**
- **A close path that leaves the menu's capture listeners attached** → every key swallowed for the session. Mitigated
  by one `closeRecentFoldersMenu()` that every path calls, and E2E case 6.
- **The extraction of `switchToFolder` changes change-folder's behaviour.** Mitigated by moving the body verbatim
  and the glue test pinning the refusal-before-reset order.
- **Grant-status latency on offline shares** makes a click feel dead. Mitigated by the busy row; accepted
  otherwise (one path, on click).
