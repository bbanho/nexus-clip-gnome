# ADR-0008: Configurable shortcuts and an explicit system-clipboard boundary

## Status
Accepted. Supersedes ADR-0004 and ADR-0006.

## Context
The first POC hard-coded three shortcuts (S1/S2/S3) and one global "active preset" (the
first key of a JSON object). That had several problems:

- Users could not add their own actions or give each action its own prompt.
- `<Super>v` collided with GNOME's message-tray binding, and other combinations collided
  with the user's existing setup.
- Every inference wrote its result into the system clipboard. That clobbered the user's
  clipboard, created feedback loops, and fused two different concepts: the system
  clipboard and the Nexus working set.
- Selecting a prompt required a GTK window, which is unsafe in the shell process
  (ADR-0009).

## Decision
1. **Nexus owns its clipboard.** The top of the LIFO stack (`stack.json`) is the Nexus
   clipboard. It persists across sessions and is never overwritten by the system
   clipboard implicitly.
2. **The system clipboard is an explicit boundary.**
   - Read only by the `push-process` action (import).
   - Written only by `copy-top` and by the stack viewer's `Enter` (export).
   - Inference paths never call `St.Clipboard.set_text()`.
3. **Shortcuts are user data.** A JSON array in the `shortcuts` GSettings key:
   `{ id, label, accel, mode, prompt }`. Up to 12 entries. Each entry has its own prompt.
4. **Defaults are two bound actions plus an unbound export template:**
   - `<Alt><Super>v` → `push-process` ("Importar e processar").
   - `<Alt><Super>c` → `process` ("Processar pilha").
   - `copy-top` → no key by default; capture one in prefs when needed.
5. **Dynamic registration.** `Main.wm.addKeybinding` needs a schema key, so registered
   bindings are mirrored into `hotkey-slot-0..11`. The extension re-grabs only when the
   `(id, accel)` signature changes; prompt/label edits are resolved by id at keypress.
6. **Legacy migration.** On first run, the old `presets` object becomes shortcut entries:
   the first prompt feeds the two defaults, the rest become unbound shortcuts.
7. **Action set** (instead of fixed S1/S2/S3): `push-process`, `process`, `copy-top`,
   `enqueue`, `run-next`, `drain`, `pop`, `show`.

## Consequences
- The user's native `Ctrl+C`/`Ctrl+V` keep their meaning; Nexus never fights the system
  clipboard.
- Export is one extra keypress (or a configured shortcut) instead of being implicit.
  This is a deliberate trade-off: predictability over convenience.
- Each action can have a different prompt, so the old "active preset = first key" rule is
  gone (ADR-0006 superseded).
- Accelerators are canonicalized to GTK modifier order and validated for duplicates and
  known GNOME-reserved combinations.
- `shortcuts` is the single source of truth; `hotkey-slot-*` are internal mirrors.

## Alternatives considered
- **Keep auto-writing results to the system clipboard.** Rejected: clobbers user data and
  makes the two clipboards indistinguishable.
- **One global prompt + many keys.** Rejected: users want a distinct prompt per action.
- **Register all 12 slots unconditionally.** Rejected: empty accelerators and stale slots
  cause confusing grabs; only real bindings are registered.
