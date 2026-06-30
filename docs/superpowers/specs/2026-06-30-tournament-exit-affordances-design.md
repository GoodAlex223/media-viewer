# Group T1: Tournament Exit Affordances — Design

**Date**: 2026-06-30
**Branch**: `feature/tournament-exit-affordances`
**Source**: 🔵 User-Flagged — BACKLOG [2026-06-03] intake (two items), batched in WEEKLY Group T1
**Total SP**: 3 (one branch, one PR)
**Status**: Approved (design)

---

## Overview

Two tournament-mode exit/leave affordances that both reuse the existing
`showTournamentLeavePrompt` / `switchMode('single')` machinery:

1. **In-tournament exit button** (1 SP) — a discoverable, always-visible control to leave
   tournament mode. Today the only exits are the `Escape` key and the mode-selector. This
   re-adds the "pause" button that was removed in `c6914ef`.
2. **Confirm before app close during an active tournament** (2 SP) — intercept window close
   (X button / `app.quit()` / Alt+F4) and, if an incomplete tournament is in progress, show
   the same Save/Discard/Cancel leave prompt before the app quits — so an accidental close
   doesn't silently abandon a tournament session.

Neither item introduces new leave/save/discard semantics; both route through the existing
leave prompt. The work is an affordance + a lifecycle hook over machinery that already exists.

---

## Existing machinery (reused, not rebuilt)

- `switchMode('single')` ([media-viewer.js:4059](../../../media-viewer.js#L4059)) guards an
  incomplete tournament (`isTournamentMode && engine && !engine.isComplete()`) and calls
  `showTournamentLeavePrompt(mode)` before `_applyModeSwitch`.
- `showTournamentLeavePrompt(targetMode)` ([media-viewer.js:4162](../../../media-viewer.js#L4162))
  renders the `#tournamentResumeModal` with **Save & leave** (`tournament.flush()` → drop
  in-memory engine), **Discard** (`tournament.handleDiscard()`), **Cancel** (stay). On Save/
  Discard it resumes the pending mode switch via `_applyModeSwitch(targetMode)`. **Single call
  site** today (the `switchMode` guard) — safe to refactor its signature.
- Tournament control buttons are wired in the event-binding setup at
  [media-viewer.js:1957](../../../media-viewer.js#L1957) (`tournamentUndoBtn`,
  `tournamentBothWinBtn`, `tournamentBothLoseBtn`).
- `#tournamentHeader` ([index.html:251](../../../index.html#L251)) is
  `display:flex; justify-content:space-between` ([styles.css:2279](../../../styles.css#L2279))
  with two children: `#tournamentProgress` (left) and `#tournamentTiers` (right).
- Window lifecycle: `mainWindow` is created at [main.js:97](../../../main.js#L97) with **no**
  `close` handler. Alt+F4 is a `globalShortcut` that calls `focusedWindow.close()`
  ([main.js:148](../../../main.js#L148)); the window "X" and `app.quit()` (via
  `window-all-closed`) also fire the window's `close` event. So a single `mainWindow.on('close')`
  handler covers **every** exit path.
- `preload.js` IPC patterns: `ipcRenderer.invoke` (request/response), `ipcRenderer.on` wrapped
  to return a cleanup function (e.g. `onClipDownloadProgress`,
  [preload.js:44](../../../preload.js#L44)), and `ipcRenderer.send` (fire-and-forget, e.g.
  `logError`).

---

## Item 1 — In-tournament exit button

### Placement & appearance
Re-add the removed pause button to `#tournamentHeader` (the upper stats line), centered —
matching its original location before `c6914ef` removed it.

- Insert a third flex child **between** `#tournamentProgress` and `#tournamentTiers`. With
  `justify-content:space-between`, three children place progress left, the button centered,
  tiers right — i.e. "the middle of the tournament mode line."
- Markup (icon-only, mirroring the original):
  ```html
  <button class="tournament-pause" id="tournamentExitBtn" title="Pause / leave tournament (Escape)">
      <i data-lucide="pause"></i>
  </button>
  ```
- Re-add the `.tournament-pause` CSS rule (removed in `c6914ef`): a translucent/glass circular
  icon button legible on the dark header background, `pointer-events:auto`, hover state. (The
  original rule is recoverable from `git show c6914ef^:styles.css`.)

### Behavior
- Click handler (wired alongside the other tournament buttons at
  [media-viewer.js:1957](../../../media-viewer.js#L1957)): `() => this.switchMode('single')`.
- `switchMode('single')` already routes an incomplete tournament through
  `showTournamentLeavePrompt` (Save/Discard/Cancel) and a complete one straight to single mode.
- **No new leave logic.** Pure discoverable affordance over the path `Escape` and the
  mode-selector already use.

### Icon dependency
Lucide `pause` icon — already loaded via the pinned Lucide CDN. Re-rendered by the existing
`createIcons()` pass over the tournament UI (use `{root: element}` per CLAUDE.md, never
`{nodes:[el]}`). Since the button is in static `index.html` markup present at load, the
initial `createIcons()` covers it.

---

## Item 2 — Confirm before app close during an active tournament

### Interception
Add `mainWindow.on('close', handler)` in `createWindow()` ([main.js:97](../../../main.js#L97)).
This single handler covers the window "X", `app.quit()` (via `window-all-closed`), and Alt+F4
(which routes through `focusedWindow.close()`).

### Flow (reuse the in-app DOM modal via IPC — chosen approach)

**Main process** (`main.js`):
```js
let isQuitting = false; // set once the user has confirmed, to let the re-issued close() through

mainWindow.on('close', (e) => {
    if (isQuitting) return;                         // already confirmed → allow
    const wc = mainWindow.webContents;
    if (wc.isDestroyed() || wc.isCrashed()) return; // dead renderer → never trap the app
    e.preventDefault();
    wc.send('app-close-requested');
});

ipcMain.on('app-close-allow', () => {
    isQuitting = true;
    mainWindow.close();
});
```

**Renderer** (`media-viewer.js`, listener registered during init):
```js
window.electronAPI.onAppCloseRequested(() => {
    try {
        if (this.isTournamentMode && this.tournament.engine && !this.tournament.engine.isComplete()) {
            this.showTournamentLeavePrompt(() => window.electronAPI.allowAppClose());
        } else {
            window.electronAPI.allowAppClose();
        }
    } catch (err) {
        window.electronAPI.logError?.(`app-close handler failed: ${err.message}`);
        window.electronAPI.allowAppClose(); // fail-safe: a renderer bug must never trap the app
    }
});
```

- **No tournament** (the common case) → renderer replies instantly via `allowAppClose()`;
  window closes normally.
- **Incomplete tournament** → the same Save/Discard/Cancel modal the user sees on `Escape`.
  Save flushes (`tournament.flush()`), Discard deletes state (`handleDiscard()`); both then
  call the continuation `allowAppClose()`. **Cancel** keeps the window open (intended — the
  modal's cleanup runs, no `allowAppClose()` fires).

### Refactor: parameterize the leave prompt's continuation
Change `showTournamentLeavePrompt(targetMode)` →
`showTournamentLeavePrompt(onAfterLeave)`, where `onAfterLeave` is an async continuation run
after Save and after Discard (not after Cancel).

- Mode-switch caller (`switchMode` guard): `showTournamentLeavePrompt(() => this._applyModeSwitch(targetMode))`.
- App-close caller: `showTournamentLeavePrompt(() => window.electronAPI.allowAppClose())`.

This keeps a single source of truth for the Save/Discard/Cancel leave UX. Only one existing
call site to update.

### New IPC surface (`preload.js`)
```js
onAppCloseRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app-close-requested', handler);
    return () => ipcRenderer.removeListener('app-close-requested', handler);
},
allowAppClose: () => ipcRenderer.send('app-close-allow'),
```
(`onAppCloseRequested` returns a cleanup function, matching the `onClipDownloadProgress`
idiom; `allowAppClose` is fire-and-forget like `logError`.)

### Rejected alternative — cached `tournamentActive` flag in main
Have the renderer push an `tournamentActive` boolean to main on enter/exit so main only
intercepts when a tournament is active (no round-trip on normal quits; fail-safe on flag
drift). **Rejected** because the confirm condition is
`isTournamentMode && engine && !engine.isComplete()` — completeness flips mid-tournament (the
last pick completes the engine; undo can un-complete it). A cached flag would have to chase
live state across many sync points. Evaluating the condition fresh in the renderer at close
time is always correct; the `isDestroyed()/isCrashed()` guard plus the try/catch-always-allow
in the renderer cover the only real risk (a dead/buggy renderer trapping the app).

---

## Components & boundaries

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `index.html` `#tournamentExitBtn` | Static markup for the header exit button | `.tournament-pause` CSS, Lucide `pause` |
| `styles.css` `.tournament-pause` | Visual style (re-added) | header layout |
| `media-viewer.js` exit-button wiring | `click → switchMode('single')` | existing `switchMode` |
| `media-viewer.js` `showTournamentLeavePrompt(onAfterLeave)` | Leave UX, now continuation-parameterized | `tournament.flush()/handleDiscard()`, `_applyModeSwitch` |
| `media-viewer.js` close-request handler | Decide allow-close vs. show prompt at close time | leave prompt, `electronAPI` |
| `main.js` `close` handler + `app-close-allow` | Window-lifecycle interception | `mainWindow`, IPC |
| `preload.js` `onAppCloseRequested` / `allowAppClose` | Secure IPC bridge | `ipcRenderer` |

---

## Error handling
- Renderer close-request handler is wrapped in `try/catch` that calls `allowAppClose()` on any
  error — a renderer bug can never make the app unclosable.
- Main guards `isDestroyed()/isCrashed()` before `preventDefault()` — a crashed renderer that
  can't reply won't trap the window.
- `Cancel` is the only path that intentionally keeps the window open (no `allowAppClose()`).

---

## Testing

### Unit (Vitest)
- Exit button exists in `#tournamentHeader` markup; its click handler calls `switchMode('single')`.
- `showTournamentLeavePrompt(onAfterLeave)` invokes the continuation after **Save** and after
  **Discard**, and does **not** invoke it after **Cancel**.
- Close-request handler: with no/complete tournament → calls `allowAppClose()` immediately;
  with an incomplete tournament → opens the leave prompt and does not yet call `allowAppClose()`;
  a thrown error inside the handler still results in `allowAppClose()`.

### E2E (Playwright — extend `tests/e2e/tournament-mode.test.js`)
- In tournament mode, `#tournamentExitBtn` is visible/attached; clicking it opens the leave
  modal (`#tournamentResumeModal`).

### Manual (main-process window-close can't be driven from Playwright without ending the run)
- Alt+F4 and window "X" **with** an incomplete tournament → leave prompt appears; Cancel keeps
  the app open; Save & leave → app quits and the tournament resumes on next launch; Discard →
  app quits and no resume is offered.
- Alt+F4 and window "X" **without** a tournament (and with a complete one) → app closes
  immediately, no prompt.

---

## Out of scope (YAGNI)
- The close confirm applies **only** to an incomplete tournament — not to other "unsaved"
  states (e.g. compare-mode bulk rating). (Confirmed with user.)
- No new keyboard shortcut for the exit button (`Escape` already does this; the button is the
  discoverable visual equivalent).
- No change to the leave prompt's Save/Discard/Cancel semantics — only its continuation is
  parameterized.

---

## Affected files
- `index.html` — `#tournamentExitBtn` in `#tournamentHeader`.
- `styles.css` — re-add `.tournament-pause`.
- `media-viewer.js` — button wiring; `showTournamentLeavePrompt` signature →
  continuation; close-request handler registration.
- `main.js` — `mainWindow.on('close')` + `app-close-allow` IPC.
- `preload.js` — `onAppCloseRequested` / `allowAppClose` (security-review surface).
- `tests/*.test.js`, `tests/e2e/tournament-mode.test.js` — unit + E2E coverage.
