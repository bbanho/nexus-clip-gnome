# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/TROUBLESHOOTING.md`, `docs/adr/`, `llms.txt`.
- E2E validation runbook scaffold (`EVIDENCE.md`).

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
