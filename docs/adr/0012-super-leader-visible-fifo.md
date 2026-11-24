# 0012 — One Super leader for AI actions, and a visible FIFO

Status: Accepted

## Context

The reviewed direct bindings (`Alt`+`Super`+letter) work, but they grab a global chord per
action. On GNOME that competes with the shell's own `Super` shortcuts and with applications,
so normal copy/paste/typing does not feel "natural" while using the extension. At the same
time the FIFO was practically invisible: a user discovered only afterwards that an agent had
queued **15** steps, with no sense of depth, next step, or progress. A full GTK preferences
window is also not the right place to watch a queue during a GNOME workflow.

## Decision

1. **One global chord, many actions** (`command-keys.js`, `extension.js`): bind
   `command-accel` (default `<Super>semicolon`) to `hotkey-command`; `openCommandBar()` opens
   an St-only keyboard panel. Single keys dispatch the actions: `V/C/X/Q/N/D/Z/H`, plus `1`–`5`
   to enqueue the first five prompt templates. Configured shortcuts win; unconfigured modes
   get safe synthetic entries. Existing direct `Alt`+`Super` bindings stay available and
   unchanged.
2. **A queue you can feel** (`getQueueBadge()`): a non-interactive St badge stays on screen
   while `fifo.json` has items, showing depth, the next label and the current stack depth. It
   is refreshed after every mutation and after each step of a drain, and hides when empty.
   `run-next` status also states the remaining count. Toggle: `queue-badge` (default `true`).
3. **Still no GTK in the shell** (ADR-0009): the command bar and badge are St/Clutter actors.
   The command bar closes before invoking an action, so streaming/live feedback remains
   visible. Neither actor reads or writes the system clipboard; export is still the explicit
   `copy-top` / HUD `Enter` path (CP-03).

## Consequences

- Plain `Super+letter` keeps its normal GNOME behavior; only `Super+;` is reserved. The key is
  rebindable in Preferences and normalized so an invalid value cannot silently drop the grab.
- Backlog and progress are visible without opening Preferences or a separate GUI app.
- The leader adds one keystroke to the direct bindings; power users can keep the old
  one-keystroke `Alt`+`Super` actions or assign their own direct keys in Preferences.
- GNOME Shell caches extension JS/metadata for the session: after installing this change a
  shell restart (or logout/login) may be required before the new binding is live.
- Palette mapping and badge text are pure functions covered by `tests/command-keys.test.js`;
  widget behavior still needs manual validation in a live shell (see `EVIDENCE.md` §12).
