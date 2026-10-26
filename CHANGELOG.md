# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/TROUBLESHOOTING.md`, `docs/adr/`, `llms.txt`.
- E2E validation runbook scaffold (`EVIDENCE.md`).
- User guide (`docs/USER_GUIDE.md`) and settings/data reference (`docs/CONFIGURATION.md`);
  README reorganized as a first-use and documentation landing page.
- `docs/CRITICAL_POINTS.md`: freeze/clipboard/state invariants mapped to tests and gates.
- Tests: shell-process boundary (no GTK/Adw/Node, explicit clipboard writes), schema and
  metadata contract, accelerator validation, and malformed persisted-state recovery.
- `.githooks/pre-commit` + `.githooks/pre-push` (enabled by `make hooks`) and
  `.github/workflows/ci.yml`; all run `make check`.

### Fixed
- Invalid accelerators without a key (`<Alt><Super>`) are never registered and are
  reported in prefs instead of failing silently.
- Malformed `stack.json`/`fifo.json` items are sanitized on load instead of crashing the
  HUD (invalid ids/content dropped, metadata repaired, `maxItems` clamped).

## [0.2.0] - 2026-10-26

Redesign around a **Nexus-owned clipboard** and user-defined shortcuts with per-shortcut
prompts. The system clipboard is now an explicit import/export boundary.

### Added
- `lib/shortcuts.js`: pure shortcut model (modes, canonical accelerators, defaults,
  legacy migration, duplicate/reserved-key validation, 12-shortcut cap).
- `lib/config.js`: GSettings glue shared by the extension and prefs (load/save/migrate,
  registration signature, API config).
- `lib/hud.js`: in-shell St/Clutter stack viewer (`Enter` copies an item to the system
  clipboard) and a non-focusable live streaming panel.
- `lib/store-core.js`, `lib/store-io.js`, `lib/store.js`, `tests/helpers/store-node.js`: pure
  LIFO/FIFO semantics with shared serialization and GJS/Node adapters.
- Prefs: dynamic shortcut rows with direct key capture, per-shortcut prompt editor,
  action dropdown, add/remove, warnings for duplicates/reserved keys, API timeout row,
  Nexus stack/FIFO/history management.
- Actions: `push-process`, `process`, `copy-top`, `enqueue`, `run-next`, `drain`, `pop`,
  `show`; busy guard, cancellable requests, configurable timeout, friendly errors.
- `make check` (schemas + Node tests + syntax + GJS store smoke) and `make smoke`
  (live gateway `chat()`/`stream()`).
- ADR-0008 (configurable shortcuts), ADR-0009 (no GTK in the shell process),
  ADR-0010 (result nodes on the stack).

### Changed
- **Default shortcuts:** `<Alt><Super>v` = Importar e processar, `<Alt><Super>c` =
  Processar pilha. The export action (`copy-top`) ships as an unbound template.
- Every successful inference pushes a `kind: "result"` node with `parentId` pointing at
  the processed item; results can be chained.
- Shortcuts are stored as a JSON array in `shortcuts` and mirrored into
  `hotkey-slot-0..11` for `Main.wm.addKeybinding`.
- `v1client`: accepts `Cancellable` + `timeoutSeconds`, returns accumulated text from
  `stream()`, and includes HTTP error body previews.
- Prefs imports Gtk/Adw with explicit versions (`?version=4.0` / `?version=1`).
- `Makefile install` copies the complete `lib/` directory.

### Fixed
- **GNOME Shell freeze on Super+X:** the old `selector.js` created a GTK window inside
  the compositor process. Removed; in-shell UI is St/Clutter only.
- No automatic system-clipboard write-back from inference paths (no feedback loop, no
  clobbering the user's clipboard).
- Clipboard reads now have a 3 s timeout so a stuck Wayland read cannot leave the action
  permanently busy.
- Streaming no longer writes to the clipboard or spawns a selector window.

### Removed
- `lib/selector.js` (GTK prompt selector) and the S1/S2/S3 shortcut trio.
- `tests/store.test.js` (split into `store-core`/`store-node` tests).

## [0.1.0] - 2026-10-18

POC of the clipboard-driven LLM pipeline (GNOME Shell 50, ESM/GJS).

### Added
- Extension scaffold: `metadata.json`, `extension.js`, `prefs.js`, GSettings schema,
  `Makefile`, `README.md` (`0675317`).
- GSettings prefs layer + state store (LIFO stack + FIFO + history, `schemaVersion: 1`,
  tree-ready nodes) (`8a62329`).
- `/v1` non-streaming client (`chat()`) + GTK prompt selector window (`cb952bf`).
- S1 push+process shortcut (`<Super>c`): clipboard → stack → inference → clipboard.
- SSE streaming client + `stream()`; pure SSE parser and incremental UTF-8 decoder.
- S2 choose shortcut (`<Super>x`): live response in the GTK window → chosen prompt enqueued
  onto the FIFO.
- S3 loop shortcut (`<Super>v`): stepwise, one FIFO item per press, manual intermediate
  paste.

### Fixed
- `chat()`: GJS does not promisify `Soup.Session.send_and_read_async` → pass the callback
  explicitly and bridge to a Promise.
- `stream()`: the gateway keeps the socket open after `data: [DONE]` → settle on `[DONE]`
  instead of waiting for EOF.
- UTF-8 decoding: GJS `TextDecoder` has no `{stream:true}` → pure `createUtf8Decoder()`.
- `Makefile install`: was missing `cp -r extension/lib` → the installed extension could not
  load (`a6a799b`).

### Notes
- Validated: `node --test` 25/25; live gateway smoke (`chat()` = "ok", `stream()` deltas +
  `[DONE]`). Interactive S1→S2→S3 validation tracked in `EVIDENCE.md`.
