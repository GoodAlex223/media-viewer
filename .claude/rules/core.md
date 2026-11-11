---
paths:
  - "core/**"
---

# Core renderer code (`core/`)

v2 moves core renderer code out of `media-viewer.js` into `core/` (spec § 5.1). Plan: [v2 P1a](../../docs/planning/plans/2026-11-11_v2-p1a-module-host.md).

- **The pattern.** A core file is an ES module with a class whose dependencies come through its constructor (the v2.0 manager pattern: `FullscreenManager`, `ZoomManager`). `MediaViewer` builds it and delegates to it. `showNotification` is a one-line call into `this.notifier.show(…)`.
- **Notifications** (`core/notifications.js`, `Notifier.show`; `MediaViewer.showNotification` delegates):
  - `show` returns the notification element.
  - `{ sticky: true }` stays until closed, is exempt from the 5-notification and info prunes, and leaves its action button's closing to the caller.
  - `autoCloseErrors` is a getter, read at each show (the Settings toggle changes it).
  - `host.ui.notify` wraps it for modules.
- **Lint.** `core/**` is linted as a browser ES module with the HTML sink guard (`eslint.config.mjs` block 2d). Core is the page's own code, so it may look up the document, and M-2 does not apply. A new core file joins `tests/lint-guard.test.js` and `tests/media-url.test.js` by glob, so it needs no list edit.
- **Line ceiling.** Moving code from `media-viewer.js` into `core/` lowers the ratchet's count (`scripts/renderer-line-ceiling.txt`). GOALS G-7's soft target counts both.
