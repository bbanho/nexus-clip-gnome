# 0014 — Motor-memory mnemonics: C collects, V writes, X moves

Status: Accepted. Adjusts the mnemonics selected in ADR-0011/0012/0013; those records are
kept unchanged as historical decisions.

## Context

Nexus is used keyboard-first while reading stacks of prompts. The Super leader (ADR-0012)
already gives the extension one universal layer without grabbing plain `Super+letter`, but the
chosen mnemonics worked against the desktop's muscle memory: `V` meant import (collect),
`C` meant process (write), and `X` meant export (move out). The desktop's `Ctrl+C` / `Ctrl+V`
/ `Ctrl+X` associations are copiar (collect), colar (write), and cortar/mover (move), so the
old mapping made the user pause at exactly the moment the workflow should be automatic.
There is also a perceived effort gradient (`Super` > `Alt` > `Ctrl`), so `Super` should be the
single differentiating modifier for Nexus, not an extra modifier stacked on top of `Alt`
everywhere.

## Decision

1. The system keeps `Ctrl+C` / `Ctrl+V` / `Ctrl+X`. Nexus never grabs a `Ctrl+letter`
   accelerator.
2. Inside the command bar (`Super+;`), the three core keys become:
   - `C` → `push-process` — **coletar**: system clipboard → Nexus stack + inference.
   - `V` → `process` — **escrever**: inference on the Nexus top, result becomes the new top.
   - `X` → `copy-top` — **mover uma cópia**: export the Nexus top to the system clipboard.
3. The direct defaults mirror the bar: `<Alt><Super>c`, `<Alt><Super>v`, `<Alt><Super>x`.
   `Alt` is retained as a second modifier because bare `Super+C` / `Super+V` are reserved by
   GNOME on some versions; the *mnemonic* is what transfers, not the modifier count.
4. `N` / `Q` / `D` / `Z` continue to drive the prompt FIFO and undo. Labels and hints state
   the motor mapping explicitly in the bar, Preferences, and documentation.
5. Legacy `presets` migration (ADR-0008) uses the same C/V/X letters, so both fresh installs
   and upgrades speak the same language.

## Consequences

- The bar and the direct bindings share one mental map; the motion learned in one layer works
  in the other.
- Existing users with a custom `shortcuts` array keep their keys — only defaults and the
  migration path changed. Users on the old defaults need to relearn `C`/`V` once; Preferences
  can remap them.
- Export remains explicit (CP-03/ADR-0008): `X` moves a **copy** out and does not pop the
  stack; `Z` is still the undo.
- Tests assert the C/V/X mapping and that the direct defaults agree with the bar, so a future
  edit cannot silently desynchronize the two layers.
