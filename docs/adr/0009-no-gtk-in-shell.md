# ADR-0009: Never create GTK widgets in the shell process

## Status
Accepted.

## Context
The original `lib/selector.js` opened a `Gtk.Window` from inside the GNOME Shell process
when the user pressed a shortcut. On Wayland this deadlocked the compositor: GTK
initialized its own Wayland connection and waited for a round-trip from the very
compositor that was blocked inside the keybinding handler. The symptom was a full GNOME
Shell freeze on Super+X (and any other binding that opened the selector).

GNOME Shell is itself a Clutter/St application. GTK is a separate toolkit with its own
main loop and display connection; embedding it in the shell process is not supported.

## Decision
1. **No GTK imports in shell-process modules.** `extension.js`, `lib/actions.js`, and
   `lib/hud.js` use only St/Clutter, Gio/GLib, Soup, and GNOME Shell resources.
2. **In-shell UI is St/Clutter.** `lib/hud.js` implements:
   - a full-screen stack/FIFO viewer (St widgets, keyboard handling, `Enter` exports the
     selected item to the system clipboard);
   - a non-focusable live streaming panel.
3. **GTK stays in prefs.** `prefs.js` runs in a separate process launched by
   `gnome-extensions prefs`; it may use GTK4/Adw normally.
4. **No modal dialogs from the shell.** Feedback uses `Main.notify`; interaction uses the
   St HUD.

## Consequences
- The Super+X freeze is eliminated by construction, not by a workaround.
- No GTK dependency in the runtime extension; fewer moving parts in the compositor.
- St/Clutter code must be tested in the shell (no Node/GTK harness). `make check` still
  syntax-checks it and the UI is exercised manually per `EVIDENCE.md`.
- Prefs can evolve independently with modern Adw widgets.

## Alternatives considered
- **Run GTK in a subprocess and show a separate window.** Rejected for the POC: extra
  process management, focus/positioning complexity, and still a second toolkit.
- **Keep GTK but defer it with `GLib.idle_add`.** Rejected: the deadlock is structural,
  not a timing issue; deferring merely changes when the compositor blocks.
